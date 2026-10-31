import { createRound, chooseTrump, playCard, roundViewForSeat } from "./round.js";
import { createDeck, shuffleDeck } from "./engine.js";
import { awardCompletedMatch, penalizeMatchLeaver } from "./progression.js";

const MAX_PLAYERS = 4;
const VALID_MATCH_TARGETS = Object.freeze([3, 5, 7]);

function requireUserId(userId) {
  if (typeof userId !== "string" || userId.trim().length < 1 || userId.length > 128) {
    throw new TypeError("A valid authenticated user ID is required");
  }
  return userId;
}

function requireNow(now) {
  if (!Number.isFinite(now) || now < 0) throw new TypeError("now must be a non-negative timestamp");
}

function requireMatchTarget(matchTarget) {
  if (!VALID_MATCH_TARGETS.includes(matchTarget)) {
    throw new RangeError("Match target must be 3, 5, or 7 points");
  }
}

export function createRoom({ roomId, hostUserId, now, privateRoom = true, matchTarget = 7 }) {
  requireUserId(hostUserId);
  requireNow(now);
  requireMatchTarget(matchTarget);
  if (typeof roomId !== "string" || !roomId.trim()) throw new TypeError("roomId is required");
  return {
    roomId,
    hostUserId,
    privateRoom: Boolean(privateRoom),
    createdAt: now,
    // No wall-clock TTL: a room remains alive while at least one player is in it.
    status: "waiting",
    matchTarget,
    matchScore: [0, 0],
    playerProgress: {},
    penalizedLeavers: [],
    players: [{ userId: hostUserId, seat: 0, ready: false, connected: true }],
    version: 1,
    round: null
  };
}

export function joinRoom(room, userId, now) {
  requireUserId(userId);
  requireNow(now);
  if (room.status !== "waiting") throw new Error("Room is not accepting players");
  const existing = room.players.find((player) => player.userId === userId);
  if (existing) return room;
  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full");
  const occupied = new Set(room.players.map((player) => player.seat));
  const seat = [0, 1, 2, 3].find((candidate) => !occupied.has(candidate));
  return {
    ...room,
    hostUserId: room.hostUserId ?? userId,
    players: [...room.players, { userId, seat, ready: false, connected: true }],
    version: room.version + 1
  };
}

/** A player may leave a waiting room; the room is eligible for cleanup only when empty. */
export function leaveRoom(room, userId) {
  requireUserId(userId);
  if (room.status !== "waiting") throw new Error("Players cannot leave a started room through this operation");
  const players = room.players.filter((player) => player.userId !== userId);
  if (players.length === room.players.length) throw new Error("User is not a member of this room");
  const hostUserId = room.hostUserId === userId ? (players[0]?.userId ?? null) : room.hostUserId;
  return { ...room, hostUserId, players, version: room.version + 1 };
}

/** Active-match exit: charge the leaver once, reserve their seat for match resolution. */
export function recordMatchForfeit(room, userId) {
  if (room.status !== "playing") throw new Error("Only an active match can record a player exit");
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if ((room.penalizedLeavers ?? []).includes(userId)) return room;
  const playerProgress = penalizeMatchLeaver(room.playerProgress ?? {}, userId);
  const players = room.players.map((candidate) =>
    candidate.userId === userId ? { ...candidate, connected: false, forfeited: true } : candidate
  );
  return { ...room, players, playerProgress,
    penalizedLeavers: [...(room.penalizedLeavers ?? []), userId], version: room.version + 1 };
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
  if (room.players.length !== MAX_PLAYERS) throw new Error("Exactly four players are required");
  if (!room.players.every((player) => player.ready)) throw new Error("All players must be ready");
  const deck = shuffleDeck(createDeck(), rng);
  const round = createRound({ deck, hakemSeat: 0 });
  return { ...room, status: "playing", round, version: room.version + 1 };
}

export function startNextRound(room, requesterUserId, { rng = Math.random } = {}) {
  if (requesterUserId !== room.hostUserId) throw new Error("Only the host may start the next round");
  if (room.status !== "round_completed") throw new Error("The previous round is not completed");
  const nextHakem = (room.round.hakemSeat + 1) % 4;
  const round = createRound({ deck: shuffleDeck(createDeck(), rng), hakemSeat: nextHakem });
  return { ...room, status: "playing", round, version: room.version + 1 };
}

/** Empty rooms only: elapsed time alone never expires a room with occupants. */
export function expireRoom(room, now) {
  requireNow(now);
  if (room.players.length === 0 && room.status !== "expired" && room.status !== "completed") {
    return { ...room, status: "expired", version: room.version + 1 };
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
    matchTarget: room.matchTarget,
    matchScore: [...room.matchScore],
    version: room.version,
    hostUserId: room.hostUserId,
    players: room.players.map(({ userId: id, seat, ready, connected }) => ({ userId: id, seat, ready, connected })),
    ownProgress: room.playerProgress?.[userId] ?? { xp: 0, level: 1 },
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

  let matchScore = room.matchScore;
  let status = "playing";
  let playerProgress = room.playerProgress ?? {};
  if (round.phase === "completed") {
    matchScore = [...room.matchScore];
    const winningTeam = round.scores[0] > round.scores[1] ? 0 : 1;
    matchScore[winningTeam] += 1;
    status = matchScore[winningTeam] >= room.matchTarget ? "completed" : "round_completed";
  }
  return { ...room, round, matchScore, playerProgress, status, version: room.version + 1 };
}
