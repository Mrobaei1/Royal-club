// @ts-nocheck
import { createRound, chooseTrump, playCard, roundViewForSeat } from "./round.js";
import { createDeck, shuffleDeck, legalCards } from "./engine.js";
import { awardCompletedMatch, penalizeMatchLeaver } from "./progression.js";
import { chooseHardBotAction } from "./bot.js";

const MAX_PLAYERS = 4;
const VALID_MATCH_TARGETS = Object.freeze([3, 5, 7]);
export const TURN_DEADLINE_MS = 7_000;
export const END_OF_HAND_REVEAL_MS = 3_000;
export const ALL_PLAYERS_DISCONNECTED_MS = 20_000;
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
  if (!VALID_MATCH_TARGETS.includes(matchTarget)) throw new RangeError("Match target must be 3, 5, or 7 points");
}
function copyHands(hands) {
  return hands.map(hand => hand.map(card => ({ suit: card.suit, rank: card.rank })));
}
function activeSeat(round) {
  return round.phase === "choose_trump" ? round.hakemSeat : round.currentSeat;
}

export function createRoom({ roomId, hostUserId, now, privateRoom = true, matchTarget = 7, disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS }) {
  requireUserId(hostUserId);
  requireNow(now);
  requireMatchTarget(matchTarget);
  if (!Number.isInteger(disconnectGraceMs) || disconnectGraceMs < 0 || disconnectGraceMs > 300000) throw new RangeError("disconnectGraceMs must be an integer between 0 and 300000");
  if (typeof roomId !== "string" || !roomId.trim()) throw new TypeError("roomId is required");
  return {
    roomId, hostUserId, privateRoom: Boolean(privateRoom), createdAt: now,
    // No wall-clock TTL: a room remains alive while at least one player is in it.
    status: "waiting", matchTarget, disconnectGraceMs, matchScore: [0, 0],
    playerProgress: {}, penalizedLeavers: [], cancellationVotes: [],
    appeals: [], reports: [], chatMessages: [], allDisconnectedDeadline: null, handRevealUntil: null, revealedHands: null,
    players: [{ userId: hostUserId, seat: 0, ready: false, connected: true, botControlled: false }],
    version: 1, round: null, turnDeadlineAt: null
  };
}

export function joinRoom(room, userId, now) {
  requireUserId(userId); requireNow(now);
  if (room.status !== "waiting") throw new Error("Room is not accepting players");
  const existing = room.players.find(player => player.userId === userId);
  if (existing) return room;
  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full");
  const occupied = new Set(room.players.map(player => player.seat));
  const seat = [0, 1, 2, 3].find(candidate => !occupied.has(candidate));
  return { ...room, hostUserId: room.hostUserId ?? userId,
    players: [...room.players, { userId, seat, ready: false, connected: true, botControlled: false }],
    version: room.version + 1 };
}

/** A player may leave a waiting room; the room is eligible for cleanup only when empty. */
export function leaveRoom(room, userId) {
  requireUserId(userId);
  if (room.status !== "waiting") throw new Error("Players cannot leave a started room through this operation");
  const players = room.players.filter(player => player.userId !== userId);
  if (players.length === room.players.length) throw new Error("User is not a member of this room");
  const hostUserId = room.hostUserId === userId ? (players[0]?.userId ?? null) : room.hostUserId;
  return { ...room, hostUserId, players, version: room.version + 1 };
}

/** Temporary network loss; authenticated user identity must be supplied by the server. */
export function disconnectPlayer(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Only an unfinished match can record a disconnect");
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited) throw new Error("A forfeited player cannot disconnect again");
  if (!player.connected) return room;
  const players = room.players.map(candidate => candidate.userId === userId
    ? { ...candidate, connected: false, disconnectedAt: now, reconnectDeadline: now + room.disconnectGraceMs, temporaryBot: false }
    : candidate);
  const allDisconnected = players.length === MAX_PLAYERS && players.every(candidate => !candidate.connected);
  return { ...room, players,
    allDisconnectedDeadline: allDisconnected ? now + ALL_PLAYERS_DISCONNECTED_MS : null,
    version: room.version + 1 };
}

/** Reclaim a temporary disconnect; already committed bot moves are never rolled back. */
export function reconnectPlayer(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Only an unfinished match can reconnect");
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited) throw new Error("A forfeited player cannot reclaim their seat");
  if (player.connected) return room;
  if (!player.temporaryBot && Number.isFinite(player.reconnectDeadline) && now >= player.reconnectDeadline) {
    throw new Error("Reconnect grace period expired; process the bot takeover first");
  }
  const players = room.players.map(candidate => candidate.userId === userId
    ? { ...candidate, connected: true, botControlled: false, temporaryBot: false, disconnectedAt: null, reconnectDeadline: null }
    : candidate);
  return { ...room, players, allDisconnectedDeadline: null, version: room.version + 1 };
}

/** Transfer a disconnected seat to the fixed-Hard bot after grace expires. */
export function handleDisconnectTimeout(room, userId, { now, expectedVersion } = {}) {
  requireUserId(userId); requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (room.status !== "playing") throw new Error("Only an active match can process a disconnect timeout");
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited || player.connected || player.temporaryBot) return room;
  if (!Number.isFinite(player.reconnectDeadline) || now < player.reconnectDeadline) throw new Error("Disconnect grace period has not elapsed");
  const players = room.players.map(candidate => candidate.userId === userId
    ? { ...candidate, botControlled: true, temporaryBot: true }
    : candidate);
  return advanceHardBotTurn({ ...room, players, version: room.version + 1 }, now);
}

/** Cancel after all four seats have been disconnected for the full 20-second window. */
export function processAllDisconnectedTimeout(room, { now, expectedVersion } = {}) {
  requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Only an unfinished match can expire its all-disconnected lease");
  if (!room.allDisconnectedDeadline || room.players.length !== MAX_PLAYERS || room.players.some(player => player.connected)) {
    throw new Error("All four players are not disconnected");
  }
  if (now < room.allDisconnectedDeadline) throw new Error("All-disconnected grace period has not elapsed");
  return { ...room, status: "cancelled", cancelReason: "all_players_disconnected",
    result: null, turnDeadlineAt: null, allDisconnectedDeadline: null, version: room.version + 1 };
}

/** Active-match exit: charge the leaver once, reserve their seat for match resolution. */
export function recordMatchForfeit(room, userId) {
  requireUserId(userId);
  if (room.status !== "playing") throw new Error("Only an active match can record a player exit");
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if ((room.penalizedLeavers ?? []).includes(userId)) return room;
  const playerProgress = penalizeMatchLeaver(room.playerProgress ?? {}, userId);
  const players = room.players.map(candidate => candidate.userId === userId
    ? { ...candidate, connected: false, forfeited: true, botControlled: true, temporaryBot: false, disconnectedAt: null, reconnectDeadline: null }
    : candidate);
  const updated = { ...room, players, playerProgress,
    penalizedLeavers: [...(room.penalizedLeavers ?? []), userId], version: room.version + 1 };
  return advanceHardBotTurn(updated);
}

export function setPlayerReady(room, userId, ready) {
  if (room.status !== "waiting") throw new Error("Readiness can only change while waiting");
  if (typeof ready !== "boolean") throw new TypeError("ready must be boolean");
  const index = room.players.findIndex(player => player.userId === userId);
  if (index < 0) throw new Error("User is not a member of this room");
  const players = room.players.map((player, i) => i === index ? { ...player, ready } : player);
  return { ...room, players, version: room.version + 1 };
}

export function startRoom(room, requesterUserId, { now, rng = Math.random } = {}) {
  requireNow(now);
  if (requesterUserId !== room.hostUserId) throw new Error("Only the host may start the game");
  if (room.status !== "waiting") throw new Error("Room has already started or closed");
  if (room.players.length !== MAX_PLAYERS) throw new Error("Exactly four players are required");
  if (!room.players.every(player => player.ready)) throw new Error("All players must be ready");
  const deck = shuffleDeck(createDeck(), rng);
  const round = createRound({ deck, hakemSeat: 0 });
  return { ...room, status: "playing", round, turnStartedAt: now,
    turnDeadlineAt: now + TURN_DEADLINE_MS, version: room.version + 1 };
}

export function startNextRound(room, requesterUserId, { rng = Math.random, now = Date.now() } = {}) {
  requireNow(now);
  if (room.status !== "round_completed") throw new Error("The previous round is not completed");
  const host = room.players.find(player => player.userId === room.hostUserId);
  const hostUnavailable = !host || host.connected === false || host.forfeited === true;
  if (requesterUserId !== room.hostUserId) {
    const requester = room.players.find(player => player.userId === requesterUserId);
    if (!hostUnavailable || !requester || requester.connected === false || requester.forfeited === true) {
      throw new Error("Only the host may start the next round unless unavailable; then a connected player may take over");
    }
  }
  if (Number.isFinite(room.handRevealUntil) && now < room.handRevealUntil) throw new Error("The 3-second end-of-hand reveal is still active");
  const nextHakem = (room.round.hakemSeat + 1) % 4;
  const round = createRound({ deck: shuffleDeck(createDeck(), rng), hakemSeat: nextHakem });
  return { ...room, hostUserId: hostUnavailable && requesterUserId !== room.hostUserId ? requesterUserId : room.hostUserId,
    status: "playing", round, turnStartedAt: now,
    turnDeadlineAt: now + TURN_DEADLINE_MS, handRevealUntil: null, revealedHands: null,
    version: room.version + 1 };
}

/** Empty rooms only: elapsed time alone never expires a room with occupants. */
export function expireRoom(room, now) {
  requireNow(now);
  if (room.players.length === 0 && room.status !== "expired" && room.status !== "completed") {
    return { ...room, status: "expired", version: room.version + 1 };
  }
  return room;
}

/** Four affirmative votes are required; a single negative vote keeps the match active. */
export function voteToCancelMatch(room, userId, approve, expectedVersion) {
  requireUserId(userId); requireExpectedVersion(room, expectedVersion);
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Only an active match can be canceled by player agreement");
  if (typeof approve !== "boolean") throw new TypeError("approve must be boolean");
  if (!room.players.some(player => player.userId === userId)) throw new Error("User is not a member of this room");
  const votes = new Set(room.cancellationVotes ?? []);
  if (approve) votes.add(userId); else votes.delete(userId);
  const unanimous = room.players.length === MAX_PLAYERS && room.players.every(player => votes.has(player.userId));
  return { ...room, cancellationVotes: [...votes],
    ...(unanimous ? { status: "cancelled", cancelReason: "unanimous_player_request", result: null, turnDeadlineAt: null } : {}),
    version: room.version + 1 };
}

/** Participant report of suspected cheating; reports never adjudicate or change a match result. */
export function submitCheatingReport(room, reporterId, { reportId, reportedUserId, reason, now } = {}) {
  requireUserId(reporterId); requireUserId(reportedUserId); requireNow(now);
  if (!["playing", "round_completed", "completed"].includes(room.status)) throw new Error("This match cannot accept reports");
  if (reporterId === reportedUserId) throw new Error("A player cannot report themselves");
  if (!room.players.some(player => player.userId === reporterId) ||
      !room.players.some(player => player.userId === reportedUserId)) {
    throw new Error("Both reporter and reported player must be match participants");
  }
  if (typeof reportId !== "string" || !reportId.trim()) throw new TypeError("reportId is required");
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 1000) {
    throw new TypeError("Report reason must contain between 10 and 1000 characters");
  }
  const report = { reportId, reporterId, reportedUserId, reason: reason.trim(),
    status: "pending", createdAt: now, reviewedBy: null, reviewedAt: null, reviewNotes: null };
  return { ...room, reports: [...(room.reports ?? []), report], version: room.version + 1 };
}

/** Authorized management review is recorded separately from game adjudication. */
export function reviewCheatingReport(room, reviewerId, reportId, { notes = "", now } = {}) {
  requireUserId(reviewerId); requireNow(now);
  if (typeof notes !== "string" || notes.length > 1000) throw new TypeError("Review notes must be at most 1000 characters");
  const index = (room.reports ?? []).findIndex(report => report.reportId === reportId);
  if (index < 0) throw new Error("Cheating report not found");
  if (room.reports[index].status !== "pending") throw new Error("Cheating report has already been reviewed");
  const reports = room.reports.map((report, i) => i === index
    ? { ...report, status: "reviewed", reviewedBy: reviewerId, reviewedAt: now, reviewNotes: notes }
    : report);
  return { ...room, reports, version: room.version + 1 };
}

/** Participant appeal after a committed match result; the result itself remains immutable. */
export function submitMatchAppeal(room, userId, { appealId, reason, now } = {}) {
  requireUserId(userId); requireNow(now);
  if (room.status !== "completed") throw new Error("Only a completed match result can be appealed");
  if (!room.players.some(player => player.userId === userId)) throw new Error("User is not a participant in this match");
  if (typeof appealId !== "string" || !appealId.trim()) throw new TypeError("appealId is required");
  if (typeof reason !== "string" || reason.trim().length < 10 || reason.length > 1000) {
    throw new TypeError("Appeal reason must contain between 10 and 1000 characters");
  }
  if ((room.appeals ?? []).some(appeal => appeal.userId === userId && appeal.status === "pending")) {
    throw new Error("This player already has a pending appeal");
  }
  const appeal = { appealId, userId, reason: reason.trim(), status: "pending", createdAt: now,
    decision: null, reviewedBy: null, reviewedAt: null, reviewNotes: null };
  return { ...room, appeals: [...(room.appeals ?? []), appeal], version: room.version + 1 };
}

/** Manager review records a decision but never silently rewrites the committed match result. */
export function reviewMatchAppeal(room, reviewerId, appealId, { decision, notes = "", now } = {}) {
  requireUserId(reviewerId); requireNow(now);
  if (room.status !== "completed") throw new Error("Only completed match appeals can be reviewed");
  if (!["confirmed", "dismissed"].includes(decision)) throw new RangeError("decision must be confirmed or dismissed");
  if (typeof notes !== "string" || notes.length > 1000) throw new TypeError("Review notes must be at most 1000 characters");
  const index = (room.appeals ?? []).findIndex(appeal => appeal.appealId === appealId);
  if (index < 0) throw new Error("Appeal not found");
  if (room.appeals[index].status !== "pending") throw new Error("Appeal has already been reviewed");
  const appeals = room.appeals.map((appeal, i) => i === index
    ? { ...appeal, status: "reviewed", decision, reviewedBy: reviewerId, reviewedAt: now, reviewNotes: notes }
    : appeal);
  return { ...room, appeals, version: room.version + 1 };
}

function isValidChatImageDataUrl(value) {
  if (typeof value !== "string") return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const [, format, encoded] = match;
  if (encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > 650 * 1024 || bytes.toString("base64") !== encoded) return false;
  if (format === "png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (format === "jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
}

/** Private one-to-one text chat is limited to opposing-team participants. */
export function sendOpponentChatMessage(room, senderUserId, recipientUserId, {
  messageId, text, now
} = {}) {
  requireUserId(senderUserId); requireUserId(recipientUserId); requireNow(now);
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Chat is available only during an active match");
  if (senderUserId === recipientUserId) throw new Error("A player cannot message themselves");
  const sender = room.players.find(player => player.userId === senderUserId);
  const recipient = room.players.find(player => player.userId === recipientUserId);
  if (!sender || !recipient) throw new Error("Both chat participants must belong to this match");
  if (sender.forfeited || recipient.forfeited) throw new Error("A forfeited player cannot use match chat");
  if (sender.seat % 2 === recipient.seat % 2) throw new Error("Private match chat is limited to opposing-team players");
  if (typeof messageId !== "string" || !messageId.trim() || messageId.length > 128) {
    throw new TypeError("A bounded chat message ID is required");
  }
  const isImage = typeof text === "string" && text.startsWith("data:image/");
  if (isImage) {
    if (!isValidChatImageDataUrl(text)) throw new TypeError("Chat image must be a valid PNG, JPEG or WebP image up to 650 KiB");
  } else if (typeof text !== "string" || !text.trim() || text.trim().length > 1000) {
    throw new TypeError("Chat text must contain between 1 and 1000 characters");
  }
  const normalizedText = isImage ? text : text.trim();
  const messages = room.chatMessages ?? [];
  const duplicate = messages.find(message => message.messageId === messageId);
  if (duplicate) {
    if (duplicate.senderUserId !== senderUserId || duplicate.recipientUserId !== recipientUserId ||
        duplicate.text !== normalizedText) throw new Error("Chat message ID was already used for different content");
    return room;
  }
  const message = Object.freeze({
    messageId, senderUserId, recipientUserId, text: normalizedText, createdAt: now
  });
  return {
    ...room,
    chatMessages: [...messages, message].slice(-500),
    version: room.version + 1
  };
}

/** A trusted server/operator may cancel only when technical failure makes continuation impossible. */
export function cancelForUnrecoverableTechnicalFailure(room, { reason = "unrecoverable_server_failure" } = {}) {
  if (!["playing", "round_completed"].includes(room.status)) throw new Error("Only an unfinished match can be canceled for technical failure");
  if (typeof reason !== "string" || !reason.trim() || reason.length > 160) throw new TypeError("A bounded cancellation reason is required");
  return { ...room, status: "cancelled", cancelReason: reason, result: null,
    turnDeadlineAt: null, allDisconnectedDeadline: null, version: room.version + 1 };
}

export function roomViewForUser(room, userId, { now = Date.now() } = {}) {
  requireNow(now);
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  const matchStillActive = !["completed", "cancelled", "expired"].includes(room.status);
  const revealActive = matchStillActive &&
    ["playing", "round_completed"].includes(room.status) &&
    Number.isFinite(room.handRevealUntil) && now < room.handRevealUntil && Array.isArray(room.revealedHands);
  const game = room.round && matchStillActive ? roundViewForSeat(room.round, player.seat) : null;
  return Object.freeze({
    roomId: room.roomId, privateRoom: room.privateRoom, status: room.status,
    matchTarget: room.matchTarget, matchScore: [...room.matchScore], version: room.version,
    serverNow: now,
    hostUserId: room.hostUserId,
    players: room.players.map(({ userId: id, seat, ready, connected, botControlled }) => ({ userId: id, seat, ready, connected, botControlled: Boolean(botControlled) })),
    ownProgress: room.playerProgress?.[userId] ?? { xp: 0, level: 1 },
    turnDeadlineAt: room.turnDeadlineAt ?? null,
    handRevealUntil: revealActive ? room.handRevealUntil : null,
    revealedHands: revealActive ? copyHands(room.revealedHands) : null,
    chatMessages: ["playing", "round_completed"].includes(room.status)
      ? (room.chatMessages ?? []).filter(message =>
          message.senderUserId === userId || message.recipientUserId === userId
        ).map(message => ({ ...message }))
      : [],
    game
  });
}

function applyCommandForSeat(room, seat, command, expectedVersion, now = Date.now()) {
  requireExpectedVersion(room, expectedVersion); requireNow(now);
  const player = room.players.find(candidate => candidate.seat === seat);
  if (!player) throw new Error("Seat is not occupied");
  if (room.status !== "playing" || !room.round) throw new Error("Room is not playing");
  let round;
  if (command?.type === "choose_trump") round = chooseTrump(room.round, player.seat, command.suit);
  else if (command?.type === "play_card") round = playCard(room.round, player.seat, command.card);
  else throw new Error("Unsupported game command");

  let matchScore = room.matchScore;
  let status = "playing";
  let playerProgress = room.playerProgress ?? {};
  let handRevealUntil = null;
  let revealedHands = null;
  if (round.phase === "completed") {
    matchScore = [...room.matchScore];
    const winningTeam = round.scores[0] > round.scores[1] ? 0 : 1;
    matchScore[winningTeam] += 1;
    status = matchScore[winningTeam] >= room.matchTarget ? "completed" : "round_completed";
    handRevealUntil = now + END_OF_HAND_REVEAL_MS;
    revealedHands = copyHands(round.hands);
    if (status === "completed") playerProgress = awardCompletedMatch(room.players, winningTeam, playerProgress);
  }
  return { ...room, round, matchScore, playerProgress, status,
    turnStartedAt: status === "playing" ? now : null,
    turnDeadlineAt: status === "playing" ? now + TURN_DEADLINE_MS : null,
    handRevealUntil, revealedHands,
    version: room.version + 1 };
}

/** Execute bot-controlled seats immediately, always through the same round validator. */
function advanceHardBotTurn(room, now = Date.now()) {
  let next = room;
  let steps = 0;
  while (next.status === "playing" && next.round && steps < 52) {
    const seat = activeSeat(next.round);
    const occupant = next.players.find(player => player.seat === seat);
    if (!occupant?.botControlled) break;
    const action = chooseHardBotAction(next.round, seat);
    const command = action.type === "choose_trump"
      ? { type: "choose_trump", suit: action.suit }
      : { type: "play_card", card: action.card };
    next = applyCommandForSeat(next, seat, command, next.version, now);
    steps += 1;
  }
  return next;
}

/** Server scheduler entry: auto-select trump via fixed Hard policy or a random legal card after 7 seconds. */
export function processTurnTimeout(room, { now, expectedVersion, rng = Math.random } = {}) {
  requireNow(now); requireExpectedVersion(room, expectedVersion);
  if (room.status !== "playing" || !room.round) throw new Error("Room is not playing");
  if (!Number.isFinite(room.turnDeadlineAt) || now < room.turnDeadlineAt) throw new Error("Turn deadline has not elapsed");
  const seat = activeSeat(room.round);
  const occupant = room.players.find(player => player.seat === seat);
  if (!occupant) throw new Error("Active seat is not occupied");
  let command;
  if (room.round.phase === "choose_trump") {
    const action = chooseHardBotAction(room.round, seat);
    command = { type: "choose_trump", suit: action.suit };
  } else {
    const legal = legalCards(room.round.hands[seat], room.round.currentTrick);
    if (!legal.length) throw new Error("No legal card is available for automatic play");
    const sample = rng();
    if (!(sample >= 0 && sample < 1)) throw new RangeError("RNG must return a number in [0, 1)");
    command = { type: "play_card", card: legal[Math.floor(sample * legal.length)] };
  }
  const updated = applyCommandForSeat(room, seat, command, expectedVersion, now);
  return advanceHardBotTurn(updated, now);
}

/** Human commands are authenticated by user ID; bot actions are server-generated and never client supplied. */
export function applyRoomCommand(room, userId, command, expectedVersion, now = Date.now()) {
  requireNow(now);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== room.version) throw new Error("Stale room version");
  const player = room.players.find(candidate => candidate.userId === userId);
  if (!player) throw new Error("User is not a member of this room");
  if (player.forfeited || player.botControlled) throw new Error("A player who left the match cannot submit game commands");
  const updated = applyCommandForSeat(room, player.seat, command, expectedVersion, now);
  return advanceHardBotTurn(updated, now);
}
