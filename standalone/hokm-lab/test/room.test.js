import test from "node:test";
import assert from "node:assert/strict";
import { legalCards } from "../src/engine.js";
import { createRoom, joinRoom, leaveRoom, setPlayerReady, startRoom as startRoomImpl, expireRoom, roomViewForUser, applyRoomCommand, startNextRound, recordMatchForfeit, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout, processAllDisconnectedTimeout, processMultipleDisconnectTimeout, cancelForUnrecoverableTechnicalFailure, ALL_PLAYERS_DISCONNECTED_MS, sendOpponentChatMessage } from "../src/room.js";

const startRoom = (room, requester, options = {}) => startRoomImpl(room, requester, { ...options, selectHakemSeat: options.selectHakemSeat ?? (() => 0) });

function fullReadyRoom(now = 1000, matchTarget = 7) {
  let room = createRoom({ roomId: "test-room", hostUserId: "u0", now, matchTarget });
  room = joinRoom(room, "u1", now + 1);
  room = joinRoom(room, "u2", now + 2);
  room = joinRoom(room, "u3", now + 3);
  for (const userId of ["u0", "u1", "u2", "u3"]) room = setPlayerReady(room, userId, true);
  return room;
}

test("room requires four unique users and refuses a fifth", () => {
  let room = createRoom({ roomId: "room", hostUserId: "u0", now: 100 });
  room = joinRoom(room, "u1", 101);
  room = joinRoom(room, "u2", 102);
  room = joinRoom(room, "u3", 103);
  assert.equal(room.players.length, 4);
  assert.throws(() => joinRoom(room, "u4", 104), /full/);
  assert.equal(joinRoom(room, "u2", 104).players.length, 4);
});

test("manager match target accepts only 3, 5, or 7 points", () => {
  for (const target of [3, 5, 7]) assert.equal(createRoom({ roomId: "room", hostUserId: "u0", now: 0, matchTarget: target }).matchTarget, target);
  for (const target of [0, 1, 4, 6, 8, "7"]) {
    assert.throws(() => createRoom({ roomId: "room", hostUserId: "u0", now: 0, matchTarget: target }), /3, 5, or 7/);
  }
});

test("waiting room never expires while occupied, regardless of elapsed time", () => {
  const room = createRoom({ roomId: "room", hostUserId: "u0", now: 1000 });
  const afterHours = expireRoom(room, 1000 + 24 * 60 * 60 * 1000);
  assert.equal(afterHours.status, "waiting");
  assert.equal(afterHours.players.length, 1);
  assert.equal(joinRoom(afterHours, "u1", 1000 + 24 * 60 * 60 * 1000).players.length, 2);
});

test("only an empty room expires; leaving last player makes it eligible", () => {
  let room = createRoom({ roomId: "room", hostUserId: "u0", now: 1000 });
  room = leaveRoom(room, "u0");
  assert.equal(room.players.length, 0);
  const expired = expireRoom(room, 1001);
  assert.equal(expired.status, "expired");
  assert.throws(() => joinRoom(expired, "u1", 1002), /not accepting/);
});

test("host departure transfers host role while room remains occupied", () => {
  let room = createRoom({ roomId: "room", hostUserId: "u0", now: 100 });
  room = joinRoom(room, "u1", 101);
  room = leaveRoom(room, "u0");
  assert.equal(room.hostUserId, "u1");
  assert.equal(expireRoom(room, 999999).status, "waiting");
});

test("host can start only after all four players are ready", () => {
  let room = createRoom({ roomId: "room", hostUserId: "u0", now: 100 });
  room = joinRoom(room, "u1", 101);
  room = joinRoom(room, "u2", 102);
  room = joinRoom(room, "u3", 103);
  assert.throws(() => startRoom(room, "u0", { now: 200, rng: () => 0.25 }), /ready/);
  for (const id of ["u0", "u1", "u2", "u3"]) room = setPlayerReady(room, id, true);
  assert.throws(() => startRoom(room, "u2", { now: 200 }), /host/);
  const started = startRoom(room, "u0", { now: 200, rng: () => 0.25 });
  assert.equal(started.status, "playing");
  assert.equal(started.round.phase, "choose_trump");
  assert.equal(started.matchTarget, 7);
  assert.deepEqual(started.matchScore, [0, 0]);
});

test("room view is membership-gated and exposes manager match settings", () => {
  const room = fullReadyRoom(1000, 5);
  const view = roomViewForUser(room, "u2");
  assert.equal(view.players.length, 4);
  assert.equal(view.game, null);
  assert.equal(view.matchTarget, 5);
  assert.deepEqual(view.matchScore, [0, 0]);
  assert.throws(() => roomViewForUser(room, "outsider"), /not a member/);
});

test("stale room versions and non-members cannot submit commands", () => {
  const room = fullReadyRoom();
  const started = startRoom(room, "u0", { now: 2000, rng: () => 0.5 });
  assert.throws(() => applyRoomCommand(started, "u0", { type: "choose_trump", suit: "hearts" }, started.version - 1), /Stale room version/);
  assert.throws(() => applyRoomCommand(started, "outsider", { type: "choose_trump", suit: "hearts" }, started.version), /not a member/);
  const chosen = applyRoomCommand(started, "u0", { type: "choose_trump", suit: "hearts" }, started.version);
  assert.equal(chosen.round.phase, "playing");
  assert.equal(chosen.version, started.version + 1);
});

test("initial hakem is selected from all four seats and the winner controls next-hand hakem", () => {
  const started = startRoom(fullReadyRoom(), "u0", {
    now: 2000, rng: () => 0.4, selectHakemSeat: () => 3
  });
  assert.equal(started.round.hakemSeat, 3);
  assert.throws(() => startRoom(fullReadyRoom(), "u0", {
    now: 2000, rng: () => 0.4, selectHakemSeat: () => 4
  }), /randomly from seats/);

  const room = {
    ...fullReadyRoom(), status: "round_completed",
    round: { phase: "completed", hakemSeat: 1, scores: [0, 1] }
  };
  assert.throws(() => startNextRound(room, "u2"), /Only the host/);
  const sameTeamWinner = startNextRound(room, "u0", { rng: () => 0.4 });
  assert.equal(sameTeamWinner.status, "playing");
  assert.equal(sameTeamWinner.round.hakemSeat, 1,
    "the previous hakem keeps the role when their team won the hand");

  const oppositeTeamWon = {
    ...room, round: { ...room.round, scores: [1, 0] }
  };
  const rotated = startNextRound(oppositeTeamWon, "u0", { rng: () => 0.4 });
  assert.equal(rotated.round.hakemSeat, 3,
    "the opposite player on the winning team becomes hakem when the previous hakem team lost");
});

function completeOneRound(room, host = "u0") {
  const hakemUserId = ["u0", "u1", "u2", "u3"][room.round.hakemSeat];
  room = applyRoomCommand(room, hakemUserId, { type: "choose_trump", suit: "spades" }, room.version);
  while (room.status === "playing") {
    const seat = room.round.currentSeat;
    const legal = legalCards(room.round.hands[seat], room.round.currentTrick);
    room = applyRoomCommand(room, ["u0", "u1", "u2", "u3"][seat], { type: "play_card", card: legal[0] }, room.version);
  }
  return room;
}

test("completed hands award one match point and preserve the configured target", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.37 });
  room = completeOneRound(room);
  assert.equal(room.status, "round_completed");
  assert.equal(room.matchScore[0] + room.matchScore[1], 1);
  assert.equal(room.matchTarget, 3);
  const previousHakem = room.round.hakemSeat;
  const previousWinner = room.round.scores[0] > room.round.scores[1] ? 0 : 1;
  const expectedHakem = previousWinner === previousHakem % 2
    ? previousHakem : (previousHakem + 2) % 4;
  room = startNextRound(room, "u0", { rng: () => 0.61, now: room.handRevealUntil });
  assert.equal(room.status, "playing");
  assert.equal(room.round.hakemSeat, expectedHakem);
});

test("match completes exactly when a team reaches the manager target", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.37 });
  let roundsPlayed = 0;
  while (room.status !== "completed" && roundsPlayed < 12) {
    room = completeOneRound(room);
    roundsPlayed += 1;
    if (room.status === "round_completed") {
      const sample = (0.17 + roundsPlayed * 0.061) % 0.99;
      room = startNextRound(room, "u0", { rng: () => sample, now: room.handRevealUntil });
    }
  }
  assert.equal(room.status, "completed");
  assert.equal(Math.max(...room.matchScore), 3);
  assert.equal(room.matchScore[0] + room.matchScore[1], roundsPlayed);
  assert.throws(() => startNextRound(room, "u0"), /previous round is not completed/);
});

test("personal XP is awarded only after the entire match finishes", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.37 });
  room = completeOneRound(room);
  assert.equal(room.status, "round_completed");
  assert.deepEqual(room.playerProgress, {});
  let rounds = 1;
  while (room.status !== "completed" && rounds < 12) {
    room = startNextRound(room, "u0", { rng: () => (0.17 + rounds * 0.061) % 0.99, now: room.handRevealUntil });
    room = completeOneRound(room);
    rounds += 1;
  }
  assert.equal(room.status, "completed");
  assert.deepEqual(Object.keys(room.playerProgress).sort(), ["u0", "u1", "u2", "u3"]);
  for (const player of room.players) {
    const winningTeam = room.matchScore[0] > room.matchScore[1] ? 0 : 1;
    assert.equal(room.playerProgress[player.userId].xp, (player.seat % 2 === winningTeam) ? 20 : 5);
  }
});

test("active-match exit queues exactly one -5 XP deduction for match completion", async () => {
  const { recordMatchForfeit } = await import("../src/room.js");
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = { ...room, playerProgress: { u0: { xp: 100, level: 1 }, u1: { xp: 50, level: 1 } } };
  const exited = recordMatchForfeit(room, "u0");
  assert.equal(exited.playerProgress.u0.xp, 100, "the penalty is deferred until match completion");
  assert.equal(exited.playerProgress.u1.xp, 50);
  assert.deepEqual(exited.pendingXpDeductions, ["u0"]);
  assert.equal(exited.players[0].forfeited, true);
  const repeated = recordMatchForfeit(exited, "u0");
  assert.equal(repeated.playerProgress.u0.xp, 100);
  assert.deepEqual(repeated.pendingXpDeductions, ["u0"]);
});

test("a player marked as having left cannot continue sending game commands", async () => {
  const { recordMatchForfeit } = await import("../src/room.js");
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = recordMatchForfeit(room, "u0");
  assert.throws(
    () => applyRoomCommand(room, "u0", { type: "choose_trump", suit: "hearts" }, room.version),
    /left the match/
  );
});


test("a voluntary leaver is replaced by Hard bot and receives one deferred XP deduction at match end", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.5 });
  room = { ...room, playerProgress: { u0: { xp: 100, level: 1 }, u1: { xp: 50, level: 1 } } };
  const leaverSeat = room.players.find(player => player.userId === "u0").seat;
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  room = handleDisconnectTimeout(room, "u0", { now: room.players[0].reconnectDeadline, expectedVersion: room.version });
  room = recordMatchForfeit(room, "u0");

  assert.equal(room.playerProgress.u0.xp, 100, "the -5 deduction must not be applied before match end");
  assert.deepEqual(room.pendingXpDeductions, ["u0"]);
  assert.equal(room.players[leaverSeat].botControlled, true);
  assert.equal(room.players[leaverSeat].temporaryBot, false);
  assert.equal(room.players[leaverSeat].connected, false);
  assert.equal(room.round.phase, "playing");
  assert.throws(() => applyRoomCommand(room, "u0", { type: "play_card", card: room.round.hands[0][0] }, room.version), /left the match/);

  let clock = Date.now() + 1000;
  let safety = 0;
  while (room.status !== "completed" && safety++ < 240) {
    if (room.status === "round_completed") {
      room = startNextRound(room, "u1", { now: room.handRevealUntil, rng: () => 0 });
      clock = Math.max(clock, room.turnStartedAt + 1);
      continue;
    }
    const seat = room.round.currentSeat;
    const player = room.players.find(candidate => candidate.seat === seat);
    assert.equal(player.botControlled, false, "server must advance the fixed Hard bot before returning control");
    const card = legalCards(room.round.hands[seat], room.round.currentTrick)[0];
    room = applyRoomCommand(room, player.userId, { type: "play_card", card }, room.version, clock++);
  }
  assert.equal(room.status, "completed");
  const winningTeam = room.matchScore[0] > room.matchScore[1] ? 0 : 1;
  assert.equal(room.playerProgress.u0.xp, 100 + (winningTeam === 0 ? 20 : 5) - 5);
  assert.deepEqual(room.pendingXpDeductions, []);
});

function awaitRecordForfeit(room,userId){
  // The exit API is synchronous; helper keeps this test focused on room lifecycle.
  return recordMatchForfeit(room,userId);
}


test("temporary disconnect can reconnect within grace without XP penalty", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, false);
  assert.equal(room.players[0].botControlled, false);
  assert.deepEqual(room.playerProgress, {});
  assert.throws(() => handleDisconnectTimeout(room, "u0", { now: 22999, expectedVersion: room.version }), /grace period has not elapsed/);
  room = reconnectPlayer(room, "u0", { now: 10000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].botControlled, false);
  assert.equal(room.players[0].reconnectDeadline, null);
  assert.deepEqual(room.playerProgress, {});
});

test("reconnect grace expires exactly at the deadline with no boundary race", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  assert.throws(
    () => reconnectPlayer(room, "u0", { now: deadline, expectedVersion: room.version }),
    /grace period expired/
  );
  room = handleDisconnectTimeout(room, "u0", { now: deadline, expectedVersion: room.version });
  assert.equal(room.players[0].temporaryBot, true);
  assert.equal(room.players[0].botControlled, true);
  assert.equal(room.players[0].connected, false);
});

test("expired disconnect grace transfers seat to temporary Hard bot and permits safe reclaim", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  assert.throws(() => reconnectPlayer(room, "u0", { now: deadline + 1, expectedVersion: room.version }), /grace period expired/);
  room = handleDisconnectTimeout(room, "u0", { now: deadline, expectedVersion: room.version });
  assert.equal(room.players[0].temporaryBot, true);
  assert.equal(room.players[0].botControlled, true);
  assert.equal(room.players[0].connected, false);
  assert.equal(room.playerProgress.u0, undefined, "temporary disconnect must not apply the -5 XP forfeit penalty");
  assert.equal(room.round.phase, "playing", "bot must resolve hakem choice and lead through the round validator");
  assert.equal(room.round.currentTrick.length, 1);
  const staleVersion = room.version - 1;
  room = reconnectPlayer(room, "u0", { now: deadline + 1000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].temporaryBot, false);
  assert.equal(room.players[0].botControlled, false);
  assert.equal(room.round.currentTrick.length, 1, "reconnect must not roll back a committed bot move");
  assert.throws(() => handleDisconnectTimeout(room, "u0", { now: deadline + 2000, expectedVersion: staleVersion }), /Stale room version/);
});


test("two or three unrecovered disconnects cancel only after the second grace period expires", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  room = disconnectPlayer(room, "u1", { now: 3010, expectedVersion: room.version });
  assert.equal(room.multipleDisconnectedDeadline, 23010);
  assert.throws(() => processMultipleDisconnectTimeout(room, {
    now: 23009, expectedVersion: room.version
  }), /Fewer than two/);
  const cancelled = processMultipleDisconnectTimeout(room, {
    now: 23010, expectedVersion: room.version
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "multiple_unrecovered_disconnects");
  assert.deepEqual(cancelled.matchScore, [0, 0]);
  assert.deepEqual(cancelled.playerProgress, {});
  assert.equal(cancelled.result, null);
});

test("a reconnecting player prevents the multiple-disconnect cancellation", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  room = disconnectPlayer(room, "u1", { now: 3010, expectedVersion: room.version });
  room = handleDisconnectTimeout(room, "u0", { now: 23000, expectedVersion: room.version });
  room = reconnectPlayer(room, "u0", { now: 23005, expectedVersion: room.version });
  assert.equal(room.multipleDisconnectedDeadline, null);
  assert.equal(room.status, "playing");
});

test("intentional forfeit remains permanent after a temporary disconnect", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  room = handleDisconnectTimeout(room, "u0", { now: room.players[0].reconnectDeadline, expectedVersion: room.version });
  room = recordMatchForfeit(room, "u0");
  assert.equal(room.players[0].forfeited, true);
  assert.equal(room.players[0].temporaryBot, false);
  assert.equal(room.playerProgress.u0, undefined, "the deferred XP deduction is not written until match end");
  assert.deepEqual(room.pendingXpDeductions, ["u0"]);
  assert.throws(() => reconnectPlayer(room, "u0", { now: 40000, expectedVersion: room.version }), /forfeited player/);
});

test("private seat view exposes server time for synchronized turn countdowns", () => {
  const room = createRoom({ roomId: "clock-view-room", hostUserId: "u0", now: 1000 });
  const view = roomViewForUser(room, "u0", { now: 4321 });
  assert.equal(view.serverNow, 4321);
  assert.equal(Object.hasOwn(view, "round"), false);
});


test("temporary disconnect and reconnect are accepted during the three-second hand reveal", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  room = { ...room, status: "round_completed", handRevealUntil: 6000 };
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, false);
  room = reconnectPlayer(room, "u0", { now: 4000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.allDisconnectedDeadline, null);
});

test("all-four-disconnected cancellation also runs during the hand reveal", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  room = { ...room, status: "round_completed", handRevealUntil: 6000 };
  for (const userId of ["u0", "u1", "u2", "u3"]) {
    room = disconnectPlayer(room, userId, { now: 3000, expectedVersion: room.version });
  }
  assert.equal(room.allDisconnectedDeadline, 3000 + ALL_PLAYERS_DISCONNECTED_MS);
  const cancelled = processAllDisconnectedTimeout(room, {
    now: 3000 + ALL_PLAYERS_DISCONNECTED_MS, expectedVersion: room.version
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "all_players_disconnected");
});


test("opposing-team text chat is private, bounded, idempotent and excludes teammates", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  room = sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-1", text: "  سلام 👋  ", now: 2100
  });
  assert.equal(room.chatMessages.length, 1);
  assert.equal(room.chatMessages[0].text, "سلام 👋");
  assert.equal(room.version, 10);
  assert.equal(sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-1", text: "سلام 👋", now: 2200
  }), room, "same message ID and content must be idempotent");
  assert.throws(() => sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-1", text: "different", now: 2200
  }), /already used/);
  assert.throws(() => sendOpponentChatMessage(room, "u0", "u2", {
    messageId: "chat-2", text: "teammate", now: 2200
  }), /opposing-team/);
  assert.throws(() => sendOpponentChatMessage(room, "u0", "outsider", {
    messageId: "chat-3", text: "outsider", now: 2200
  }), /belong to this match/);
  assert.deepEqual(roomViewForUser(room, "u0").chatMessages.map(message => message.messageId), ["chat-1"]);
  assert.deepEqual(roomViewForUser(room, "u1").chatMessages.map(message => message.messageId), ["chat-1"]);
  assert.deepEqual(roomViewForUser(room, "u2").chatMessages, []);
  const completed = { ...room, status: "completed" };
  assert.deepEqual(roomViewForUser(completed, "u0").chatMessages, [],
    "completed-match views should expose the final result, not chat history");
});


test("terminal cancelled and completed views hide the round and any remaining-card reveal", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  room = {
    ...room,
    handRevealUntil: 9000,
    revealedHands: [0, 1, 2, 3].map(() => [{ suit: "hearts", rank: "A" }])
  };
  const cancelled = cancelForUnrecoverableTechnicalFailure(room);
  const cancelledView = roomViewForUser(cancelled, "u0", { now: 3000 });
  assert.equal(cancelledView.game, null);
  assert.equal(cancelledView.revealedHands, null);
  assert.equal(cancelledView.handRevealUntil, null);

  const completed = { ...room, status: "completed" };
  const completedView = roomViewForUser(completed, "u0", { now: 3000 });
  assert.equal(completedView.game, null);
  assert.equal(completedView.revealedHands, null);
  assert.equal(completedView.handRevealUntil, null);
});

test("a connected player takes over next-hand start when the host remains disconnected", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  room = { ...room, status: "round_completed", handRevealUntil: 0 };
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  const next = startNextRound(room, "u1", { now: 4000, rng: () => 0 });
  assert.equal(next.status, "playing");
  assert.equal(next.hostUserId, "u1");
  assert.equal(next.round.hakemSeat, 2);
});

test("next-hand host handoff rejects a disconnected or forfeited requester", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 5000, rng: () => 0 });
  room = { ...room, status: "round_completed", handRevealUntil: 0 };
  room = disconnectPlayer(room, "u0", { now: 6000, expectedVersion: room.version });
  room = disconnectPlayer(room, "u1", { now: 6001, expectedVersion: room.version });
  assert.throws(() => startNextRound(room, "u1", { now: 7000, rng: () => 0 }), /connected player/);
});

test("opposing-team chat accepts only signature-verified bounded PNG/JPEG/WebP attachments", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0 });
  const png = "data:image/png;base64,iVBORw0KGgo=";
  room = sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-image-1", text: png, now: 2100
  });
  assert.equal(room.chatMessages[0].text, png);
  assert.equal(roomViewForUser(room, "u1").chatMessages[0].text, png);
  assert.throws(() => sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-image-bad", text: "data:image/png;base64,AAAA", now: 2200
  }), /valid PNG, JPEG or WebP/);
  assert.throws(() => sendOpponentChatMessage(room, "u0", "u1", {
    messageId: "chat-image-svg", text: "data:image/svg+xml;base64,PHN2Zz4=", now: 2200
  }), /valid PNG, JPEG or WebP/);
});
