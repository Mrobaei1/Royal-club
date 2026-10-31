import test from "node:test";
import assert from "node:assert/strict";
import { legalCards } from "../src/engine.js";
import { createRoom, joinRoom, leaveRoom, setPlayerReady, startRoom, expireRoom, roomViewForUser, applyRoomCommand, startNextRound } from "../src/room.js";

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

test("next round is host-controlled and rotates hakem", () => {
  const room = { ...fullReadyRoom(), status: "round_completed", round: { phase: "completed", hakemSeat: 1 } };
  assert.throws(() => startNextRound(room, "u2"), /Only the host/);
  const next = startNextRound(room, "u0", { rng: () => 0.4 });
  assert.equal(next.status, "playing");
  assert.equal(next.round.hakemSeat, 2);
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
  room = startNextRound(room, "u0", { rng: () => 0.61 });
  assert.equal(room.status, "playing");
  assert.equal(room.round.hakemSeat, 1);
});

test("match completes exactly when a team reaches the manager target", () => {
  let room = startRoom(fullReadyRoom(1000, 3), "u0", { now: 2000, rng: () => 0.37 });
  const rounds = [];
  for (let i = 0; i < 3; i += 1) {
    room = completeOneRound(room);
    rounds.push(room);
    if (i < 2) room = startNextRound(room, "u0", { rng: () => 0.37 + i * 0.1 });
  }
  assert.equal(room.status, "completed");
  assert.equal(Math.max(...room.matchScore), 3);
  assert.equal(room.matchScore[0] + room.matchScore[1], 3);
  assert.throws(() => startNextRound(room, "u0"), /previous round is not completed/);
});
