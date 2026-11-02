import test from "node:test";
import assert from "node:assert/strict";
import { HokmRoomService, InMemoryRoomRepository } from "../src/service.js";
import { HokmDeadlineScheduler } from "../src/deadline-scheduler.js";

const user = userId => ({ authenticated: true, userId });

async function startedRoom() {
  let clock = 1000;
  let sequence = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({
    repository, now: () => clock, id: () => `hokm-scheduler-${++sequence}`
  });
  let room = await service.create(user("u0"));
  for (const id of ["u1", "u2", "u3"]) room = await service.join(user(id), room.roomId, room.version);
  for (const id of ["u0", "u1", "u2", "u3"]) room = await service.ready(user(id), room.roomId, true, room.version);
  room = await service.start(user("u0"), room.roomId, room.version);
  return { repository, service, room, now: () => clock, setNow(value) { clock = value; } };
}

test("in-memory repository lists only active rooms with elapsed deadlines", async () => {
  const { repository, room } = await startedRoom();
  assert.deepEqual((await repository.listDueRooms(room.turnDeadlineAt - 1)).map(item => item.roomId), []);
  assert.deepEqual((await repository.listDueRooms(room.turnDeadlineAt)).map(item => item.roomId), [room.roomId]);
});

test("deadline scheduler applies expired trump selection through trusted service", async () => {
  const fixture = await startedRoom();
  fixture.setNow(fixture.room.turnDeadlineAt);
  const scheduler = new HokmDeadlineScheduler({
    service: fixture.service, repository: fixture.repository, now: fixture.now,
    intervalMs: 250
  });
  const result = await scheduler.pollOnce();
  assert.deepEqual(result, { skipped: false, discovered: 1, processed: 1, failed: 0 });
  const latest = await fixture.repository.get(fixture.room.roomId);
  assert.equal(latest.round.phase, "playing");
  assert.equal(latest.turnDeadlineAt, fixture.room.turnDeadlineAt + 7000);
});

test("all-four-disconnected expiry wins over individual reconnect and turn deadlines", async () => {
  const fixture = await startedRoom();
  let room = fixture.room;
  const ids = ["u0", "u1", "u2", "u3"];
  for (let i = 0; i < ids.length; i += 1) {
    room = await fixture.service.disconnect(user(ids[i]), room.roomId, room.version);
    fixture.setNow(3000 + i);
  }
  const persisted = await fixture.repository.get(room.roomId);
  fixture.setNow(persisted.allDisconnectedDeadline);
  const scheduler = new HokmDeadlineScheduler({
    service: fixture.service, repository: fixture.repository, now: () => persisted.allDisconnectedDeadline
  });
  const result = await scheduler.pollOnce();
  const latest = await fixture.repository.get(room.roomId);
  assert.equal(result.processed, 1);
  assert.equal(latest.status, "cancelled");
  assert.equal(latest.cancelReason, "all_players_disconnected");
  assert.equal(latest.result, null);
});

test("ordinary players cannot run the persisted deadline dispatcher", async () => {
  const fixture = await startedRoom();
  await assert.rejects(
    fixture.service.processDueDeadlines(user("u0"), fixture.room.roomId),
    /trusted service principal/
  );
});

test("scheduler rejects an untrusted service identity at construction", async () => {
  const fixture = await startedRoom();
  assert.throws(() => new HokmDeadlineScheduler({
    service: fixture.service, repository: fixture.repository,
    servicePrincipal: user("ordinary-player")
  }), /verified internal system\/service principal/);
});

test("scheduler does not overlap concurrent polling loops", async () => {
  const fixture = await startedRoom();
  fixture.setNow(fixture.room.turnDeadlineAt);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const repository = {
    async listDueRooms() { await gate; return []; }
  };
  const scheduler = new HokmDeadlineScheduler({
    service: fixture.service, repository, now: fixture.setNow.bind(fixture)
  });
  const first = scheduler.pollOnce();
  const second = await scheduler.pollOnce();
  assert.equal(second.skipped, true);
  release();
  await first;
});

test("scheduler reports a failed room but continues processing the rest of the batch", async () => {
  const errors = [];
  const repository = { async listDueRooms() {
    return [{ roomId: "bad-room" }, { roomId: "good-room" }];
  } };
  const service = { async processDueDeadlines(_principal, roomId) {
    if (roomId === "bad-room") throw new Error("simulated persistence fault");
    return [{}];
  } };
  const scheduler = new HokmDeadlineScheduler({
    service, repository, onError: (error, context) => errors.push([error.message, context.roomId])
  });
  const result = await scheduler.pollOnce();
  assert.deepEqual(result, { skipped: false, discovered: 2, processed: 1, failed: 1 });
  assert.deepEqual(errors, [["simulated persistence fault", "bad-room"]]);
});

test("scheduler start and stop are idempotent", async () => {
  const fixture = await startedRoom();
  const scheduler = new HokmDeadlineScheduler({
    service: fixture.service, repository: fixture.repository, intervalMs: 1000
  });
  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.isRunning, true);
  assert.equal(scheduler.start(), false);
  assert.equal(scheduler.stop(), true);
  assert.equal(scheduler.isRunning, false);
  assert.equal(scheduler.stop(), false);
});
