// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { HokmRoomService, InMemoryRoomRepository } from "./hokm/service.js";

test("deadline worker cancels two unrecovered disconnects instead of leaving one seat on Hard bot", async () => {
  let now = 1000;
  let id = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({ repository, now: () => now, id: () => `phase1-service-${++id}` });
  const player = userId => ({ authenticated: true, userId });
  let room = await service.create(player("p0"));
  for (const userId of ["p1", "p2", "p3"]) room = await service.join(player(userId), room.roomId, room.version);
  for (const userId of ["p0", "p1", "p2", "p3"]) room = await service.ready(player(userId), room.roomId, true, room.version);
  room = await service.start(player("p0"), room.roomId, room.version);
  now = 2000;
  room = await service.disconnect(player("p0"), room.roomId, room.version);
  now = 2010;
  room = await service.disconnect(player("p1"), room.roomId, room.version);

  now = 22000;
  const firstDeadline = await service.processDueDeadlines({ authenticated: true, userId: "scheduler", role: "system" }, room.roomId);
  assert.equal(firstDeadline.length, 1);
  room = await repository.get(room.roomId);
  assert.equal(room.players[0].temporaryBot, true);
  assert.deepEqual(room.pendingXpDeductions, ["p0"]);

  now = 22010;
  const secondDeadline = await service.processDueDeadlines({ authenticated: true, userId: "scheduler", role: "system" }, room.roomId);
  assert.equal(secondDeadline.length, 1);
  const cancelled = await repository.get(room.roomId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "multiple_unrecovered_disconnects");
  assert.deepEqual(cancelled.matchScore, [0, 0]);
  assert.deepEqual(cancelled.pendingXpDeductions, []);
});
