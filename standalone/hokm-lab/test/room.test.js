import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, joinRoom, setPlayerReady, startRoom, expireRoom, roomViewForUser, applyRoomCommand } from "../src/room.js";

function fullReadyRoom(now = 1000) {
  let room = createRoom({ roomId: "test-room", hostUserId: "u0", now });
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
});

test("waiting room expires after 60 seconds and cannot be joined", () => {
  const room = createRoom({ roomId: "room", hostUserId: "u0", now: 1000 });
  const expired = expireRoom(room, 61000);
  assert.equal(expired.status, "expired");
  assert.equal(expired.players.length, 0);
  assert.throws(() => joinRoom(room, "u1", 61000), /expired/);
});

test("room view is membership-gated and never exposes all private hands", () => {
  const room = fullReadyRoom();
  const view = roomViewForUser(room, "u2");
  assert.equal(view.players.length, 4);
  assert.equal(view.game, null);
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
