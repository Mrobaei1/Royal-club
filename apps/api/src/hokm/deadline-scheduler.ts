// @ts-nocheck
// Ported from the independently verified Hokm lab; strict runtime validation remains in the domain/service layer.
/**
 * Durable deadline poller.
 *
 * Deadlines are stored in the room JSON row itself. Each poll discovers due
 * rooms from the repository, then asks the trusted room service to execute
 * the next due transition using the room's current version. PostgreSQL CAS
 * makes competing workers safe: only one worker can commit a given version.
 */
export class HokmDeadlineScheduler {
  #service;
  #repository;
  #now;
  #intervalMs;
  #batchSize;
  #principal;
  #onError;
  #timer = null;
  #running = false;
  #polling = false;

  constructor(options: any = {}) {
    const {
      service,
      repository,
      now = () => Date.now(),
      intervalMs = 250,
      batchSize = 100,
      servicePrincipal = { authenticated: true, userId: "hokm-deadline-scheduler", role: "system" },
      onError = () => {}
    } = options;
    if (!service || typeof service.processDueDeadlines !== "function") {
      throw new TypeError("A HokmRoomService with processDueDeadlines is required");
    }
    if (!repository || typeof repository.listDueRooms !== "function") {
      throw new TypeError("A durable room repository with listDueRooms is required");
    }
    if (typeof now !== "function" || typeof onError !== "function") throw new TypeError("now and onError must be functions");
    if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 60_000) {
      throw new RangeError("intervalMs must be between 50 and 60000");
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new RangeError("batchSize must be between 1 and 1000");
    }
    if (!servicePrincipal || servicePrincipal.authenticated !== true ||
        !["system", "service"].includes(servicePrincipal.role) ||
        typeof servicePrincipal.userId !== "string" || !servicePrincipal.userId.trim()) {
      throw new TypeError("A verified internal system/service principal is required");
    }
    this.#service = service;
    this.#repository = repository;
    this.#now = now;
    this.#intervalMs = intervalMs;
    this.#batchSize = batchSize;
    this.#principal = servicePrincipal;
    this.#onError = onError;
  }

  /** Run one deterministic poll; useful for tests and controlled server startup. */
  async pollOnce() {
    if (this.#polling) return { skipped: true, discovered: 0, processed: 0, failed: 0 };
    this.#polling = true;
    let processed = 0;
    let failed = 0;
    try {
      const dueRooms = await this.#repository.listDueRooms(this.#now(), this.#batchSize);
      for (const room of dueRooms) {
        try {
          const outcomes = await this.#service.processDueDeadlines(this.#principal, room.roomId);
          if (outcomes.length) processed += outcomes.length;
        } catch (error) {
          failed += 1;
          try { this.#onError(error, { roomId: room.roomId }); } catch { /* monitoring must not stop the worker */ }
        }
      }
      return { skipped: false, discovered: dueRooms.length, processed, failed };
    } finally {
      this.#polling = false;
    }
  }

  start() {
    if (this.#running) return false;
    this.#running = true;
    const tick = async () => {
      if (!this.#running) return;
      try { await this.pollOnce(); }
      catch (error) {
        try { this.#onError(error, { scope: "scheduler_poll" }); } catch { /* keep scheduler alive */ }
      } finally {
        if (this.#running) this.#timer = setTimeout(tick, this.#intervalMs);
      }
    };
    void tick();
    return true;
  }

  stop() {
    if (!this.#running) return false;
    this.#running = false;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    return true;
  }

  get isRunning() { return this.#running; }
}
