import test from "node:test";
import assert from "node:assert/strict";
import { HokmRoomService, InMemoryRoomRepository } from "./hokm/service.js";

test("deadline worker cancels two unrecovered disconnects instead of leaving one seat on Hard bot", async () => {
  let now = 1000;
  let id = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({ repository, now: () => now, id: () => `phase1-service-${++id}` });
  const player = (userId: string) => ({ authenticated: true, userId });
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
  assert.ok(firstDeadline.length >= 1, 'expired disconnect and any due turn deadline must be processed');
  const firstInternalRoom = await repository.get(room.roomId);
  assert.equal(firstInternalRoom.players[0].temporaryBot, true);
  assert.deepEqual(firstInternalRoom.pendingXpDeductions, ["p0"]);

  now = 22010;
  const secondDeadline = await service.processDueDeadlines({ authenticated: true, userId: "scheduler", role: "system" }, room.roomId);
  assert.equal(secondDeadline.length, 1);
  const cancelled = await repository.get(room.roomId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelReason, "multiple_unrecovered_disconnects");
  assert.deepEqual(cancelled.matchScore, [0, 0]);
  assert.deepEqual(cancelled.pendingXpDeductions, []);
});

test("only the owner may change the fixed 20-second reconnect grace; players use the default", async () => {
  let now = 1000;
  let id = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({ repository, now: () => now, id: () => `phase1-policy-${++id}` });
  await assert.rejects(
    service.create({ authenticated: true, userId: "player" }, { disconnectGraceMs: 30000 }),
    /Only the owner may change/
  );
  const normal = await service.create({ authenticated: true, userId: "player" });
  assert.equal((await repository.get(normal.roomId)).disconnectGraceMs, 20000);
  const owner = await service.create({ authenticated: true, userId: "gm", role: "owner" }, { disconnectGraceMs: 30000 });
  assert.equal((await repository.get(owner.roomId)).disconnectGraceMs, 30000);
  await assert.rejects(
    service.create({ authenticated: true, userId: "player2" }, { matchTarget: 5 }),
    /Only an authorized manager/
  );
  const manager = await service.create({ authenticated: true, userId: "manager", role: "manager" }, { matchTarget: 5 });
  assert.equal((await repository.get(manager.roomId)).matchTarget, 5);
});


test("game command idempotency key prevents duplicate execution and rejects key reuse with different payload", async () => {
  let now = 1000;
  let id = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({
    repository, now: () => now, id: () => `phase1-idempotency-${++id}`,
    selectHakemSeat: () => 0
  });
  const player = userId => ({ authenticated: true, userId });
  let room = await service.create(player("p0"));
  for (const userId of ["p1", "p2", "p3"]) room = await service.join(player(userId), room.roomId, room.version);
  for (const userId of ["p0", "p1", "p2", "p3"]) room = await service.ready(player(userId), room.roomId, true, room.version);
  room = await service.start(player("p0"), room.roomId, room.version);
  const originalVersion = room.version;
  const command = { type: "choose_trump", suit: "spades" };
  const first = await service.command(player("p0"), room.roomId, command, originalVersion, "hokm-acceptance-1");
  const duplicate = await service.command(player("p0"), room.roomId, command, originalVersion, "hokm-acceptance-1");
  assert.equal(duplicate.version, first.version);
  assert.deepEqual(duplicate.game, first.game);
  await assert.rejects(
    service.command(player("p0"), room.roomId, { type: "choose_trump", suit: "hearts" }, originalVersion, "hokm-acceptance-1"),
    /different game command/
  );
  await assert.rejects(
    service.command(player("p0"), room.roomId, command, originalVersion, ""),
    /idempotency key/
  );
});
