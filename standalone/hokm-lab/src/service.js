import { randomUUID } from "node:crypto";
import {
  createRoom, joinRoom, leaveRoom, setPlayerReady, startRoom, startNextRound, applyRoomCommand,
  roomViewForUser, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout,
  processTurnTimeout, processAllDisconnectedTimeout, voteToCancelMatch,
  cancelForUnrecoverableTechnicalFailure, submitMatchAppeal, reviewMatchAppeal,
  submitCheatingReport, reviewCheatingReport
} from "./room.js";

function authenticatedUser(principal) {
  if (!principal || principal.authenticated !== true ||
      typeof principal.userId !== "string" || !principal.userId.trim() ||
      principal.userId.length > 128) {
    throw new Error("A verified authenticated principal is required");
  }
  return principal.userId;
}

/**
 * Minimal repository contract:
 * get(roomId), insert(room), compareAndSwap(roomId, expectedVersion, nextRoom).
 * A production adapter MUST implement compareAndSwap transactionally in its database.
 */
function managerRoomView(room) {
  return Object.freeze({
    roomId: room.roomId, status: room.status, version: room.version,
    matchTarget: room.matchTarget, matchScore: [...room.matchScore],
    hostUserId: room.hostUserId, cancelReason: room.cancelReason ?? null,
    result: room.result ?? null,
    players: room.players.map(({ userId, seat, ready, connected, botControlled, forfeited }) =>
      ({ userId, seat, ready, connected, botControlled: Boolean(botControlled), forfeited: Boolean(forfeited) })),
    reports: (room.reports ?? []).map(report => ({ ...report })),
    appeals: (room.appeals ?? []).map(appeal => ({ ...appeal }))
  });
}

export class InMemoryRoomRepository {
  #rooms = new Map();

  async get(roomId) {
    return this.#rooms.get(roomId) ?? null;
  }

  async insert(room) {
    if (this.#rooms.has(room.roomId)) throw new Error("Room already exists");
    this.#rooms.set(room.roomId, room);
    return room;
  }

  async listDueRooms(now, limit = 100) {
    if (!Number.isFinite(now) || !Number.isInteger(limit) || limit < 1) throw new TypeError("Invalid due-room query");
    return [...this.#rooms.values()].filter(room => {
      if (!["playing", "round_completed"].includes(room.status)) return false;
      if (Number.isFinite(room.turnDeadlineAt) && room.turnDeadlineAt <= now) return true;
      if (Number.isFinite(room.allDisconnectedDeadline) && room.allDisconnectedDeadline <= now) return true;
      return room.players.some(player => !player.connected && !player.forfeited && !player.temporaryBot &&
        Number.isFinite(player.reconnectDeadline) && player.reconnectDeadline <= now);
    }).slice(0, limit);
  }

  async compareAndSwap(roomId, expectedVersion, nextRoom) {
    const current = this.#rooms.get(roomId);
    if (!current || current.version !== expectedVersion) return false;
    if (nextRoom.roomId !== roomId || nextRoom.version !== expectedVersion + 1) {
      throw new Error("Invalid room compare-and-swap transition");
    }
    this.#rooms.set(roomId, nextRoom);
    return true;
  }
}

/**
 * Server-side application boundary. The principal must come from trusted
 * authentication middleware; never construct it from request-body user IDs.
 * This default repository is process-local and is NOT suitable for production
 * multi-instance deployment.
 */
export class HokmRoomService {
  #repository;
  #queues = new Map();

  constructor({ repository = new InMemoryRoomRepository(), now = () => Date.now(), id = () => randomUUID() } = {}) {
    if (!repository || typeof repository.get !== "function" ||
        typeof repository.insert !== "function" ||
        typeof repository.compareAndSwap !== "function" ||
        typeof repository.listDueRooms !== "function") {
      throw new TypeError("A room repository implementing get/insert/compareAndSwap/listDueRooms is required");
    }
    if (typeof now !== "function" || typeof id !== "function") throw new TypeError("now and id must be functions");
    this.#repository = repository;
    this.now = now;
    this.id = id;
  }

  async create(principal, { privateRoom = true, matchTarget = 7, disconnectGraceMs } = {}) {
    const userId = authenticatedUser(principal);
    const room = createRoom({
      roomId: this.id(), hostUserId: userId, now: this.now(),
      privateRoom, matchTarget, ...(disconnectGraceMs === undefined ? {} : { disconnectGraceMs })
    });
    await this.#repository.insert(room);
    return roomViewForUser(room, userId, { now: this.now() });
  }

  async view(principal, roomId) {
    const userId = authenticatedUser(principal);
    const room = await this.#repository.get(roomId);
    if (!room) throw new Error("Room not found");
    return roomViewForUser(room, userId);
  }

  async join(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion, room => joinRoom(room, userId, this.now()), userId);
  }

  async leave(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion, room => leaveRoom(room, userId), userId);
  }

  async ready(principal, roomId, ready, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion, room => setPlayerReady(room, userId, ready), userId);
  }

  async start(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => startRoom(room, userId, { now: this.now() }), userId);
  }

  async nextRound(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => startNextRound(room, userId, { now: this.now() }), userId);
  }

  async command(principal, roomId, command, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => applyRoomCommand(room, userId, command, expectedVersion, this.now()), userId);
  }

  async disconnect(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => disconnectPlayer(room, userId, { now: this.now(), expectedVersion }), userId);
  }

  async reconnect(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => reconnectPlayer(room, userId, { now: this.now(), expectedVersion }), userId);
  }

  async voteCancel(principal, roomId, approve, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => voteToCancelMatch(room, userId, approve, expectedVersion), userId);
  }

  async reportCheating(principal, roomId, reportedUserId, reason, expectedVersion) {
    const reporterId = authenticatedUser(principal);
    const reportId = this.id();
    const room = await this.#transition(roomId, expectedVersion,
      current => submitCheatingReport(current, reporterId, {
        reportId, reportedUserId, reason, now: this.now()
      }), reporterId);
    return Object.freeze({ ...room, submittedReportId: reportId });
  }

  async reviewCheating(principal, roomId, reportId, notes, expectedVersion) {
    const reviewerId = authenticatedUser(principal);
    if (principal.role !== "manager" && principal.role !== "owner") {
      throw new Error("Only an authorized manager may review cheating reports");
    }
    return this.#transition(roomId, expectedVersion,
      room => reviewCheatingReport(room, reviewerId, reportId, { notes, now: this.now() }), managerRoomView);
  }

  async submitAppeal(principal, roomId, reason, expectedVersion) {
    const userId = authenticatedUser(principal);
    const appealId = this.id();
    const room = await this.#transition(roomId, expectedVersion,
      current => submitMatchAppeal(current, userId, { appealId, reason, now: this.now() }), userId);
    return Object.freeze({ ...room, submittedAppealId: appealId });
  }

  async reviewAppeal(principal, roomId, appealId, decision, notes, expectedVersion) {
    const reviewerId = authenticatedUser(principal);
    if (principal.role !== "manager" && principal.role !== "owner") {
      throw new Error("Only an authorized manager may review match appeals");
    }
    return this.#transition(roomId, expectedVersion,
      room => reviewMatchAppeal(room, reviewerId, appealId, { decision, notes, now: this.now() }), managerRoomView);
  }

  async processTurnDeadline(principal, roomId, expectedVersion) {
    authenticatedUser(principal);
    if (principal.role !== "system" && principal.role !== "service") {
      throw new Error("Only a trusted service principal may process turn deadlines");
    }
    return this.#transition(roomId, expectedVersion,
      room => processTurnTimeout(room, { now: this.now(), expectedVersion }), null);
  }

  async processAllDisconnectedDeadline(principal, roomId, expectedVersion) {
    authenticatedUser(principal);
    if (principal.role !== "system" && principal.role !== "service") {
      throw new Error("Only a trusted service principal may process all-disconnected deadlines");
    }
    return this.#transition(roomId, expectedVersion,
      room => processAllDisconnectedTimeout(room, { now: this.now(), expectedVersion }), null);
  }

  async cancelForTechnicalFailure(principal, roomId, expectedVersion, reason) {
    authenticatedUser(principal);
    if (principal.role !== "system" && principal.role !== "service") {
      throw new Error("Only a trusted service principal may cancel for technical failure");
    }
    return this.#transition(roomId, expectedVersion,
      room => cancelForUnrecoverableTechnicalFailure(room, { reason }), null);
  }

  async processDueDeadlines(principal, roomId) {
    authenticatedUser(principal);
    if (principal.role !== "system" && principal.role !== "service") {
      throw new Error("Only a trusted service principal may process scheduled deadlines");
    }
    let room = await this.#repository.get(roomId);
    if (!room) throw new Error("Room not found");
    const outcomes = [];

    // The all-four-disconnected rule takes precedence over individual bot takeover
    // and turn deadlines: no bot should continue a match after the owner's 20s grace.
    if (Number.isFinite(room.allDisconnectedDeadline) && this.now() >= room.allDisconnectedDeadline) {
      outcomes.push(await this.processAllDisconnectedDeadline(principal, roomId, room.version));
      return outcomes;
    }

    if (room.status === "playing") {
      const expiredSeats = room.players.filter(player => !player.connected && !player.forfeited &&
        !player.temporaryBot && Number.isFinite(player.reconnectDeadline) && this.now() >= player.reconnectDeadline);
      for (const player of expiredSeats) {
        room = await this.#repository.get(roomId);
        if (!room || room.status !== "playing") break;
        const current = room.players.find(candidate => candidate.userId === player.userId);
        if (!current || current.connected || current.forfeited || current.temporaryBot ||
            !Number.isFinite(current.reconnectDeadline) || this.now() < current.reconnectDeadline) continue;
        outcomes.push(await this.processDisconnectTimeout(principal, roomId, current.userId, room.version));
      }
    }

    room = await this.#repository.get(roomId);
    if (room?.status === "playing" && Number.isFinite(room.turnDeadlineAt) && this.now() >= room.turnDeadlineAt) {
      outcomes.push(await this.processTurnDeadline(principal, roomId, room.version));
    }
    return outcomes;
  }

  async processDisconnectTimeout(principal, roomId, userId, expectedVersion) {
    authenticatedUser(principal);
    // A trusted scheduler/service identity invokes this method. It cannot be
    // exposed as a public player endpoint.
    if (principal.role !== "system" && principal.role !== "service") {
      throw new Error("Only a trusted service principal may process disconnect deadlines");
    }
    return this.#transition(roomId, expectedVersion,
      room => handleDisconnectTimeout(room, userId, { now: this.now(), expectedVersion }), null);
  }

  async #transition(roomId, expectedVersion, transform, viewUserId) {
    if (typeof roomId !== "string" || !roomId.trim()) throw new TypeError("roomId is required");
    if (!Number.isInteger(expectedVersion)) throw new TypeError("expectedVersion is required");
    return this.#serialize(roomId, async () => {
      const current = await this.#repository.get(roomId);
      if (!current) throw new Error("Room not found");
      if (current.version !== expectedVersion) throw new Error("Stale room version");
      const next = transform(current);
      if (next === current) return typeof viewUserId === "function" ? viewUserId(current) : viewUserId ? roomViewForUser(current, viewUserId) : current;
      const saved = await this.#repository.compareAndSwap(roomId, expectedVersion, next);
      if (!saved) throw new Error("Concurrent room update; retry with the latest version");
      return typeof viewUserId === "function" ? viewUserId(next) : viewUserId ? roomViewForUser(next, viewUserId) : next;
    });
  }

  #serialize(key, operation) {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    // Keep the queue tail fulfilled even when an operation rejects. Returning
    // current still propagates the request error to its caller, while the
    // internal tail cannot become an unhandled rejected promise.
    const tail = current.then(() => undefined, () => undefined).then(() => {
      if (this.#queues.get(key) === tail) this.#queues.delete(key);
    });
    this.#queues.set(key, tail);
    return current;
  }
}
