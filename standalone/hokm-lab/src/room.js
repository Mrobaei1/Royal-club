import { createRound, chooseTrump, playCard, roundViewForSeat } from "./round.js";
import { createDeck, shuffleDeck } from "./engine.js";

const ROOM_TTL_MS = 60_000;
const MAX_PLAYERS = 4;

function requireUserId(userId) {
  if (typeof userId !== "string" || userId.trim().length < 1 || userId.length > 128) {
    throw new TypeError("A valid authenticated user ID is required");
  }
  return userId;
}

function requireNow(now) {
  if (!Number.isFinite(now) || now < 0) throw new TypeError("now must be a non-negative timestamp");
}

export function createRoom({ roomId, hostUserId, now, privateRoom = true }) {
  requireUserId(hostUserId);
  requireNow(now);
  if (typeof roomId !== "string" || !roomId.trim()) throw new TypeError("roomId is required");
  return {
    roomId,
    hostUserId,
    privateRoom: Boolean(privateRoom),
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    status: "waiting",
    players: [{ userId: hostUserId, seat: 0, ready: false, connected: true }],
    version: 1,
    round: null
  };
}

export function joinRoom(room, userId, now) {
  requireUserId(userId);
  requireNow(now);
  if (now >= room.expiresAt && room.status === "waiting") throw new Error("Room invitation expired");
  if (room.status !== "waiting") throw new Error("Room is not accepting players");
  const existing = room.players.find((player) => player.userId === userId);
  if (existing) return room;
  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full");
  const occupied = new Set(room.players.map((player) => player.seat));
  const seat = [0, 1, 2, 3].find((candidate) => !occupied.has(candidate));
  return {
    ...room,
    players: [...room.players, { userId, seat, ready: false, connected: true }],
    version: room.version + 1
  };
}

export function setPlayerReady(room, userId, ready) {
  if (room.status !== "waiting") throw new Error("Readiness can only change while waiting");
  if (typeof ready !== "boolean") throw new TypeError("ready must be boolean");
  const index = room.players.findIndex((player) => player.userId === userId);
  if (index < 0) throw new Error("User is not a member of this room");
  const players = room.players.map((player, i) => i === index ? { ...player, ready } : player);
  return { ...room, players, version: room.version + 1 };
}

export function startRoom(room, requesterUserId, { now, rng = Math.random } = {}) {
  requireNow(now);
  if (requesterUserId !== room.hostUserId) throw new Error("Only the host may start the game");
  if (room.status !== "waiting") throw new Error("Room has already started or closed");
  if (now >= room.expiresAt) throw new Error("Room invitation expired");
  if (room.players.length !== MAX_PLAYERS) throw new Error("Exactly four players are required");
  if (!room.players.every((player) => player.ready)) throw new Error("All players must be ready");
  const deck = shuffleDeck(createDeck(), rng);
  const round = createRound({ deck, hakemSeat: 0 });
  return { ...room, status: "playing", round, version: room.version + 1 };
}

export function expireRoom(room, now) {
  requireNow(now);
  if (room.status === "waiting" && now >= room.expiresAt) {
    return { ...room, status: "expired", players: [], version: room.version + 1 };
  }
  return room;
}

export function roomViewForUser(room, userId) {
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  return Object.freeze({
    roomId: room.roomId,
    privateRoom: room.privateRoom,
    status: room.status,
    expiresAt: room.expiresAt,
    version: room.version,
    hostUserId: room.hostUserId,
    players: room.players.map(({ userId: id, seat, ready, connected }) => ({ userId: id, seat, ready, connected })),
    game: room.round ? roundViewForSeat(room.round, player.seat) : null
  });
}

export function applyRoomCommand(room, userId, command, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) {
    throw new Error("Stale room version");
  }
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (room.status !== "playing" || !room.round) throw new Error("Room is not playing");
  let round;
  if (command?.type === "choose_trump") {
    round = chooseTrump(room.round, player.seat, command.suit);
  } else if (command?.type === "play_card") {
    round = playCard(room.round, player.seat, command.card);
  } else {
    throw new Error("Unsupported game command");
  }
  return { ...room, round, status: round.phase === "completed" ? "completed" : "playing", version: room.version + 1 };
}
