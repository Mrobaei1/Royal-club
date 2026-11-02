import test from "node:test";
import assert from "node:assert/strict";
import { legalCards } from "../src/engine.js";
import {
  createRoom, joinRoom, setPlayerReady, startRoom, applyRoomCommand,
  processTurnTimeout, disconnectPlayer, reconnectPlayer, processAllDisconnectedTimeout,
  voteToCancelMatch, cancelForUnrecoverableTechnicalFailure,
  roomViewForUser, startNextRound, submitMatchAppeal, reviewMatchAppeal
} from "../src/room.js";

function readyRoom(now = 1000, matchTarget = 7) {
  let room = createRoom({ roomId: "owner-rules-room", hostUserId: "u0", now, matchTarget });
  for (const [index, id] of ["u1", "u2", "u3"].entries()) room = joinRoom(room, id, now + index + 1);
  for (const id of ["u0", "u1", "u2", "u3"]) room = setPlayerReady(room, id, true);
  return room;
}

function finishOneHand(room, startAt = 10_000) {
  let now = startAt;
  const hakemId = ["u0", "u1", "u2", "u3"][room.round.hakemSeat];
  room = applyRoomCommand(room, hakemId, { type: "choose_trump", suit: "spades" }, room.version, now++);
  let safety = 0;
  while (room.status === "playing" && safety++ < 60) {
    const seat = room.round.currentSeat;
    const card = legalCards(room.round.hands[seat], room.round.currentTrick)[0];
    room = applyRoomCommand(room, ["u0", "u1", "u2", "u3"][seat],
      { type: "play_card", card }, room.version, now++);
  }
  return room;
}

test("trump selection and card turns each receive an exact seven-second server deadline", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  assert.equal(room.turnDeadlineAt, 9000);
  room = processTurnTimeout(room, { now: 9000, expectedVersion: room.version, rng: () => 0.5 });
  assert.equal(room.round.phase, "playing", "expired hakem choice is resolved by the fixed Hard policy");
  assert.equal(room.turnDeadlineAt, 16000);
  const previousHandSize = room.round.hands[room.round.currentSeat].length;
  room = processTurnTimeout(room, { now: 16000, expectedVersion: room.version, rng: () => 0.999999 });
  assert.equal(room.round.currentTrick.length, 1);
  assert.equal(room.round.hands[0].length, previousHandSize - 1);
  assert.equal(room.turnDeadlineAt, 23000);
});

test("a card timeout selects only a legal card and rejects early timeout execution", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  room = applyRoomCommand(room, "u0", { type: "choose_trump", suit: "hearts" }, room.version, 2100);
  assert.throws(() => processTurnTimeout(room, { now: room.turnDeadlineAt - 1, expectedVersion: room.version }), /deadline has not elapsed/);
  const seat = room.round.currentSeat;
  const legal = legalCards(room.round.hands[seat], room.round.currentTrick);
  const timedOut = processTurnTimeout(room, { now: room.turnDeadlineAt, expectedVersion: room.version, rng: () => 0.999999 });
  assert.equal(timedOut.round.currentTrick.length, 1);
  assert.ok(legal.some(card => card.suit === timedOut.round.currentTrick[0].card.suit &&
    card.rank === timedOut.round.currentTrick[0].card.rank));
});

test("all remaining cards are revealed to all four seats for exactly three seconds", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.37 });
  room = finishOneHand(room, 3000);
  assert.ok(["round_completed", "completed"].includes(room.status));
  assert.ok(Number.isFinite(room.handRevealUntil));
  for (const id of ["u0", "u1", "u2", "u3"]) {
    const view = roomViewForUser(room, id, { now: room.handRevealUntil - 1 });
    assert.equal(view.revealedHands.length, 4);
    assert.ok(view.revealedHands.every(hand => Array.isArray(hand)));
  }
  const hidden = roomViewForUser(room, "u0", { now: room.handRevealUntil });
  assert.equal(hidden.revealedHands, null);
  if (room.status === "round_completed") {
    assert.throws(() => startNextRound(room, "u0", { now: room.handRevealUntil - 1 }), /reveal is still active/);
    const next = startNextRound(room, "u0", { now: room.handRevealUntil, rng: () => 0.5 });
    assert.equal(next.status, "playing");
    assert.equal(next.revealedHands, null);
  }
});

test("four disconnected players trigger cancellation after exactly twenty seconds", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  for (const [index, id] of ["u0", "u1", "u2", "u3"].entries()) {
    room = disconnectPlayer(room, id, { now: 3000 + index, expectedVersion: room.version });
  }
  assert.equal(room.allDisconnectedDeadline, 23003);
  assert.throws(() => processAllDisconnectedTimeout(room, {
    now: 23002, expectedVersion: room.version
  }), /grace period has not elapsed/);
  const cancelled = processAllDisconnectedTimeout(room, {
    now: 23003, expectedVersion: room.version
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "all_players_disconnected");
  assert.equal(cancelled.result, null);
  assert.deepEqual(cancelled.playerProgress, {});
});

test("reconnecting any player clears the all-four-disconnected cancellation deadline", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  for (const [index, id] of ["u0", "u1", "u2", "u3"].entries()) {
    room = disconnectPlayer(room, id, { now: 3000 + index, expectedVersion: room.version });
  }
  room = { ...room, players: room.players.map(player => player.userId === "u0"
    ? { ...player, reconnectDeadline: 50000, temporaryBot: true, botControlled: true }
    : player) };
  room = reconnectPlayer(room, "u0", { now: 4000, expectedVersion: room.version });
  assert.equal(room.allDisconnectedDeadline, null);
  assert.equal(room.players.find(player => player.userId === "u0").connected, true);
});

function awaitReconnect(room, userId, now) {
  // Import lazily to keep this helper focused on the reconnect transition.
  return import("../src/room.js").then(({ reconnectPlayer }) =>
    reconnectPlayer(room, userId, { now, expectedVersion: room.version }));
}

test("unanimous cancellation requires all four players and a single dissent keeps play active", () => {
  let room = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  for (const id of ["u0", "u1", "u2"]) {
    room = voteToCancelMatch(room, id, true, room.version);
    assert.equal(room.status, "playing");
  }
  room = voteToCancelMatch(room, "u3", false, room.version);
  assert.equal(room.status, "playing");
  room = voteToCancelMatch(room, "u3", true, room.version);
  assert.equal(room.status, "cancelled");
  assert.equal(room.cancelReason, "unanimous_player_request");
  assert.equal(room.result, null);
});

test("unrecoverable technical failure cancels without awarding a winner or progression", () => {
  const started = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  const cancelled = cancelForUnrecoverableTechnicalFailure(started, { reason: "database_unrecoverable" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.result, null);
  assert.deepEqual(cancelled.playerProgress, {});
});

test("post-match appeal is participant-only and management review does not rewrite result", () => {
  const completed = { ...readyRoom(1000), status: "completed", matchScore: [3, 2], result: { winnerTeam: 0 } };
  let room = submitMatchAppeal(completed, "u1", {
    appealId: "appeal-1", reason: "The final score does not match the server event log.", now: 5000
  });
  assert.equal(room.appeals[0].status, "pending");
  assert.throws(() => submitMatchAppeal(room, "outsider", {
    appealId: "appeal-2", reason: "This user is not a participant in the match.", now: 5001
  }), /not a participant/);
  room = reviewMatchAppeal(room, "manager-1", "appeal-1", {
    decision: "confirmed", notes: "Server event log reviewed.", now: 6000
  });
  assert.equal(room.appeals[0].status, "reviewed");
  assert.deepEqual(room.result, { winnerTeam: 0 });
});

test("completed match view exposes no full replay/history", () => {
  const completed = { ...readyRoom(1000), status: "completed", matchScore: [3, 2],
    round: { phase: "completed", hakemSeat: 0, currentSeat: 0, trumpSuit: "spades",
      hands: [[], [], [], []], currentTrick: [], completedTricks: [{ secret: "should-not-leak" }],
      trickWinners: [], scores: [7, 2], seenCards: new Set(), undealtDeck: [] } };
  const view = roomViewForUser(completed, "u0", { now: 9000 });
  assert.equal(view.game, null);
  assert.equal(view.revealedHands, null);
});

test("cheating reports are participant-scoped and management review does not decide the winner", async () => {
  const { submitCheatingReport, reviewCheatingReport } = await import("../src/room.js");
  const playing = startRoom(readyRoom(1000), "u0", { now: 2000, rng: () => 0.4 });
  let room = submitCheatingReport(playing, "u0", {
    reportId: "report-1", reportedUserId: "u1",
    reason: "The player disclosed their private hand to an opposing player.", now: 3000
  });
  assert.equal(room.reports[0].status, "pending");
  assert.throws(() => submitCheatingReport(room, "outsider", {
    reportId: "report-2", reportedUserId: "u1",
    reason: "This report must be limited to match participants.", now: 3001
  }), /participants/);
  room = reviewCheatingReport(room, "manager-1", "report-1", {
    notes: "Evidence reviewed by management.", now: 4000
  });
  assert.equal(room.reports[0].status, "reviewed");
  assert.equal(room.status, "playing");
  assert.deepEqual(room.matchScore, [0, 0]);
});
