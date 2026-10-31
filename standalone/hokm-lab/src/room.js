import { createRound, chooseTrump, playCard, roundViewForSeat } from "./round.js";
import { createDeck, shuffleDeck } from "./engine.js";
import { awardCompletedMatch, penalizeMatchLeaver } from "./progression.js";
import { chooseHardBotAction } from "./bot.js";

const MAX_PLAYERS = 4;
const VALID_MATCH_TARGETS = Object.freeze([3, 5, 7]);
const DEFAULT_DISCONNECT_GRACE_MS = 20_000;
function requireExpectedVersion(room, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) throw new Error("Stale room version");
}

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

export function createRoom({ roomId, hostUserId, now, privateRoom = true, matchTarget = 7, disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS }) {
  requireUserId(hostUserId);
  requireNow(now);
  requireMatchTarget(matchTarget);
  if (!Number.isInteger(disconnectGraceMs) || disconnectGraceMs < 0 || disconnectGraceMs > 300000) throw new RangeError("disconnectGraceMs must be an integer between 0 and 300000");
  if (typeof roomId !== "string" || !roomId.trim()) throw new TypeError("roomId is required");
  return {
    roomId,
    hostUserId,
    privateRoom: Boolean(privateRoom),
    createdAt: now,
    // No wall-clock TTL: a room remains alive while at least one player is in it.
    status: "waiting",
    matchTarget,
    disconnectGraceMs,
    matchScore: [0, 0],
    playerProgress: {},
    penalizedLeavers: [],
    players: [{ userId: hostUserId, seat: 0, ready: false, connected: true, botControlled: false }],
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
    players: [...room.players, { userId, seat, ready: false, connected: true, botControlled: false }],
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

/** Temporary network loss; authenticated user identity must be supplied by the server. */
export function disconnectPlayer(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (room.status !== "playing") throw new Error("Only an active match can record a disconnect");
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited) throw new Error("A forfeited player cannot disconnect again");
  if (!player.connected) return room;
  const players = room.players.map((candidate) => candidate.userId === userId
    ? { ...candidate, connected: false, disconnectedAt: now, reconnectDeadline: now + room.disconnectGraceMs, temporaryBot: false }
    : candidate);
  return { ...room, players, version: room.version + 1 };
}

/** Reclaim a temporary disconnect; already committed bot moves are never rolled back. */
export function reconnectPlayer(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (room.status !== "playing") throw new Error("Only an active match can reconnect");
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited) throw new Error("A forfeited player cannot reclaim their seat");
  if (player.connected) return room;
  const players = room.players.map((candidate) => candidate.userId === userId
    ? { ...candidate, connected: true, botControlled: false, temporaryBot: false, disconnectedAt: null, reconnectDeadline: null }
    : candidate);
  return { ...room, players, version: room.version + 1 };
}

/** Transfer a disconnected seat to the fixed-Hard bot after grace expires. */
export function handleDisconnectTimeout(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (room.status !== "playing") throw new Error("Only an active match can process a disconnect timeout");
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited || player.connected || player.temporaryBot) return room;
  if (!Number.isFinite(player.reconnectDeadline) || now < player.reconnectDeadline) throw new Error("Disconnect grace period has not elapsed");
  const players = room.players.map((candidate) => candidate.userId === userId
    ? { ...candidate, botControlled: true, temporaryBot: true }
    : candidate);
  return advanceHardBotTurn({ ...room, players, version: room.version + 1 });
}

/** Active-match exit: charge the leaver once, reserve their seat for match resolution. */
export function recordMatchForfeit(room, userId) {
  if (room.status !== "playing") throw new Error("Only an active match can record a player exit");
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if ((room.penalizedLeavers ?? []).includes(userId)) return room;
  const playerProgress = penalizeMatchLeaver(room.playerProgress ?? {}, userId);
  const players = room.players.map((candidate) =>
    candidate.userId === userId ? { ...candidate, connected: false, forfeited: true, botControlled: true, temporaryBot: false, disconnectedAt: null, reconnectDeadline: null } : candidate
  );
  const updated = { ...room, players, playerProgress,
    penalizedLeavers: [...(room.penalizedLeavers ?? []), userId], version: room.version + 1 };
  return advanceHardBotTurn(updated);
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
    players: room.players.map(({ userId: id, seat, ready, connected, botControlled }) => ({ userId: id, seat, ready, connected, botControlled: Boolean(botControlled) })),
    ownProgress: room.playerProgress?.[userId] ?? { xp: 0, level: 1 },
    game: room.round ? roundViewForSeat(room.round, player.seat) : null
  });
}

function applyCommandForSeat(room, seat, command, expectedVersion) {
  requireExpectedVersion(room, expectedVersion);
  const player = room.players.find((candidate) => candidate.seat === seat);
  if (!player) throw new Error("Seat is not occupied");
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
    if (status === "completed") playerProgress = awardCompletedMatch(room.players, winningTeam, playerProgress);
  }
  return { ...room, round, matchScore, playerProgress, status, version: room.version + 1 };
}

/** Execute at most the current bot-controlled seat's required action(s), always through the same round validator. */
function advanceHardBotTurn(room) {
  let next = room;
  let steps = 0;
  while (next.status === "playing" && next.round && steps < 2) {
    const seat = next.round.phase === "choose_trump" ? next.round.hakemSeat : next.round.currentSeat;
    const occupant = next.players.find((player) => player.seat === seat);
    if (!occupant?.botControlled) break;
    const action = chooseHardBotAction(next.round, seat);
    const command = action.type === "choose_trump"
      ? { type: "choose_trump", suit: action.suit }
      : { type: "play_card", card: action.card };
    next = applyCommandForSeat(next, seat, command, next.version);
    steps += 1;
  }
  return next;
}

/** Human commands are authenticated by user ID; bot actions are server-generated and never client supplied. */
export function applyRoomCommand(room, userId, command, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) {
    throw new Error("Stale room version");
  }
  const player = room.players.find((candidate) => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited || player.botControlled) throw new Error("A player who left the match cannot submit game commands");
  const updated = applyCommandForSeat(room, player.seat, command, expectedVersion);
  return advanceHardBotTurn(updated);
}
