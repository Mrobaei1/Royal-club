import test from "node:test";
import assert from "node:assert/strict";
import { legalCards } from "../src/engine.js";
import { createRoom, joinRoom, leaveRoom, setPlayerReady, startRoom, expireRoom, roomViewForUser, applyRoomCommand, startNextRound, recordMatchForfeit, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout } from "../src/room.js";

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
  let roundsPlayed = 0;
  while (room.status !== "completed" && roundsPlayed < 12) {
    room = completeOneRound(room);
    roundsPlayed += 1;
    if (room.status === "round_completed") {
      const sample = (0.17 + roundsPlayed * 0.061) % 0.99;
      room = startNextRound(room, "u0", { rng: () => sample });
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
    room = startNextRound(room, "u0", { rng: () => (0.17 + rounds * 0.061) % 0.99 });
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

test("active-match exit applies -5 XP to the leaver once only", async () => {
  const { recordMatchForfeit } = await import("../src/room.js");
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = { ...room, playerProgress: { u0: { xp: 100, level: 1 }, u1: { xp: 50, level: 1 } } };
  const exited = recordMatchForfeit(room, "u0");
  assert.equal(exited.playerProgress.u0.xp, 95);
  assert.equal(exited.playerProgress.u1.xp, 50);
  assert.equal(exited.players[0].forfeited, true);
  assert.equal(recordMatchForfeit(exited, "u0").playerProgress.u0.xp, 95);
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


test("an active-match leaver is replaced by the fixed hard bot and the hand continues",()=>{
  let room=startRoom(fullReadyRoom(1000,3),"u0",{now:2000,rng:()=>0.5});
  room={...room,playerProgress:{u0:{xp:100,level:1},u1:{xp:50,level:1}}};
  const leaverSeat=room.players.find(p=>p.userId==="u0").seat;
  room=(awaitRecordForfeit(room,"u0"));
  assert.equal(room.playerProgress.u0.xp,95);
  assert.equal(room.players[leaverSeat].botControlled,true);
  assert.equal(room.players[leaverSeat].connected,false);
  assert.equal(room.round.phase,"playing");
  assert.equal(room.round.hands[leaverSeat].length,12,"bot should choose trump and play its first card when hakem");
  assert.equal(room.round.currentTrick.length,1);
  assert.equal(room.round.currentSeat,1);
  assert.throws(()=>applyRoomCommand(room,"u0",{type:"play_card",card:room.round.hands[0][0]},room.version),/left the match/);
  // Complete the hand. The server automatically plays whenever the forfeited seat becomes current.
  let safety=0;
  while(room.status==="playing" && safety++<60){
    const seat=room.round.currentSeat;
    const player=room.players.find(p=>p.seat===seat);
    if(player.botControlled) throw new Error("Bot turn was not advanced automatically");
    const card=legalCards(room.round.hands[seat],room.round.currentTrick)[0];
    room=applyRoomCommand(room,player.userId,{type:"play_card",card},room.version);
  }
  assert.ok(["round_completed","completed"].includes(room.status));
  assert.equal(room.round.phase,"completed");
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

test("expired disconnect grace transfers seat to temporary Hard bot and permits safe reclaim", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
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

test("intentional forfeit remains permanent after a temporary disconnect", () => {
  let room = startRoom(fullReadyRoom(), "u0", { now: 2000, rng: () => 0.5 });
  room = disconnectPlayer(room, "u0", { now: 3000, expectedVersion: room.version });
  room = handleDisconnectTimeout(room, "u0", { now: room.players[0].reconnectDeadline, expectedVersion: room.version });
  room = recordMatchForfeit(room, "u0");
  assert.equal(room.players[0].forfeited, true);
  assert.equal(room.players[0].temporaryBot, false);
  assert.equal(room.playerProgress.u0.xp, 0, "XP penalty floors at zero");
  assert.throws(() => reconnectPlayer(room, "u0", { now: 40000, expectedVersion: room.version }), /forfeited player/);
});
