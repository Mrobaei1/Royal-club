import {
  createRoom, joinRoom, setPlayerReady, startRoom, applyRoomCommand,
  roomViewForUser, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout
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
        typeof repository.compareAndSwap !== "function") {
      throw new TypeError("A room repository implementing get/insert/compareAndSwap is required");
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
    return roomViewForUser(room, userId);
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

  async ready(principal, roomId, ready, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion, room => setPlayerReady(room, userId, ready), userId);
  }

  async start(principal, roomId, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => startRoom(room, userId, { now: this.now() }), userId);
  }

  async command(principal, roomId, command, expectedVersion) {
    const userId = authenticatedUser(principal);
    return this.#transition(roomId, expectedVersion,
      room => applyRoomCommand(room, userId, command, expectedVersion), userId);
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
      if (next === current) return viewUserId ? roomViewForUser(current, viewUserId) : current;
      const saved = await this.#repository.compareAndSwap(roomId, expectedVersion, next);
      if (!saved) throw new Error("Concurrent room update; retry with the latest version");
      return viewUserId ? roomViewForUser(next, viewUserId) : next;
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
