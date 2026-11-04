// @ts-nocheck
/**
 * Durable deadline poller.
 *
 * Deadlines are stored in the room JSON row itself. Each poll discovers due
 * rooms from the repository, then asks the trusted room service to execute
 * the next due transition using the room's current version. PostgreSQL CAS
 * makes competing workers safe: only one worker can commit a given version.
 *
 * The read-only metrics snapshot and onPoll hook let the host monitoring
 * system detect a stopped/lagging worker without coupling this module to a
 * specific metrics vendor.
 */
function overdueBy(room, now) {
  const deadlines = [
    room.turnDeadlineAt,
    room.allDisconnectedDeadline,
    ...(room.players ?? []).map(player => player.reconnectDeadline)
  ].filter(value => Number.isFinite(value) && value <= now);
  if (!deadlines.length) return 0;
  return Math.max(0, now - Math.min(...deadlines));
}

export class HokmDeadlineScheduler {
  #service;
  #repository;
  #now;
  #intervalMs;
  #batchSize;
  #principal;
  #onError;
  #onPoll;
  #timer = null;
  #running = false;
  #polling = false;
  #metrics = {
    pollCount: 0,
    failedPollCount: 0,
    skippedPollCount: 0,
    discoveredRooms: 0,
    processedTransitions: 0,
    failedRooms: 0,
    lastPollStartedAt: null,
    lastPollCompletedAt: null,
    lastSuccessfulPollAt: null,
    lastErrorAt: null,
    lastPollDurationMs: null,
    oldestOverdueMs: 0
  };

  constructor({
    service,
    repository,
    now = () => Date.now(),
    intervalMs = 250,
    batchSize = 100,
    servicePrincipal = { authenticated: true, userId: "hokm-deadline-scheduler", role: "system" },
    onError = () => {},
    onPoll = () => {}
  } = {}) {
    if (!service || typeof service.processDueDeadlines !== "function") {
      throw new TypeError("A HokmRoomService with processDueDeadlines is required");
    }
    if (!repository || typeof repository.listDueRooms !== "function") {
      throw new TypeError("A durable room repository with listDueRooms is required");
    }
    if (typeof now !== "function" || typeof onError !== "function" || typeof onPoll !== "function") {
      throw new TypeError("now, onError and onPoll must be functions");
    }
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
    this.#onPoll = onPoll;
  }

  #snapshot() {
    return Object.freeze({
      ...this.#metrics,
      isRunning: this.#running,
      isPolling: this.#polling,
      intervalMs: this.#intervalMs,
      batchSize: this.#batchSize
    });
  }

  /** Read-only operational counters and heartbeat timestamps. */
  get metrics() { return this.#snapshot(); }

  #notifyPoll() {
    try { this.#onPoll(this.#snapshot()); } catch { /* monitoring must not stop the worker */ }
  }

  /** Run one deterministic poll; useful for tests and controlled server startup. */
  async pollOnce() {
    if (this.#polling) {
      this.#metrics.skippedPollCount += 1;
      return { skipped: true, discovered: 0, processed: 0, failed: 0 };
    }
    this.#polling = true;
    const startedClock = this.#now();
    const startedMonotonic = Date.now();
    this.#metrics.pollCount += 1;
    this.#metrics.lastPollStartedAt = startedClock;
    this.#metrics.oldestOverdueMs = 0;
    let processed = 0;
    let failed = 0;
    let discovered = 0;
    try {
      const dueRooms = await this.#repository.listDueRooms(startedClock, this.#batchSize);
      discovered = dueRooms.length;
      this.#metrics.discoveredRooms += discovered;
      this.#metrics.oldestOverdueMs = dueRooms.reduce(
        (oldest, room) => Math.max(oldest, overdueBy(room, startedClock)), 0
      );
      for (const room of dueRooms) {
        try {
          const outcomes = await this.#service.processDueDeadlines(this.#principal, room.roomId);
          if (outcomes.length) processed += outcomes.length;
        } catch (error) {
          failed += 1;
          this.#metrics.lastErrorAt = this.#now();
          try { this.#onError(error, { roomId: room.roomId }); } catch { /* monitoring must not stop the worker */ }
        }
      }
      this.#metrics.processedTransitions += processed;
      this.#metrics.failedRooms += failed;
      const completedAt = this.#now();
      this.#metrics.lastPollCompletedAt = completedAt;
      this.#metrics.lastPollDurationMs = Math.max(0, Date.now() - startedMonotonic);
      if (failed === 0) this.#metrics.lastSuccessfulPollAt = completedAt;
      return { skipped: false, discovered, processed, failed };
    } catch (error) {
      this.#metrics.failedPollCount += 1;
      this.#metrics.lastErrorAt = this.#now();
      this.#metrics.lastPollCompletedAt = this.#now();
      this.#metrics.lastPollDurationMs = Math.max(0, Date.now() - startedMonotonic);
      try { this.#onError(error, { scope: "scheduler_poll" }); } catch { /* keep scheduler alive */ }
      throw error;
    } finally {
      this.#polling = false;
      this.#notifyPoll();
    }
  }

  start() {
    if (this.#running) return false;
    this.#running = true;
    const tick = async () => {
      if (!this.#running) return;
      try { await this.pollOnce(); }
      catch { /* pollOnce reports the failure and the worker remains alive */ }
      finally {
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
