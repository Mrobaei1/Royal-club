import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PostgresRoomRepository } from "../src/postgres-repository.js";
import { HokmRoomService } from "../src/service.js";
import { HokmDeadlineScheduler } from "../src/deadline-scheduler.js";

const connectionString = process.env.HOKM_LIVE_DATABASE_URL;

test("live PostgreSQL migration, multi-instance CAS and scheduler restart recovery", {
  skip: !connectionString ? "HOKM_LIVE_DATABASE_URL is not configured" : false
}, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 8 });
  const prefix = `live-hokm-${randomUUID()}`;
  const users = [0, 1, 2, 3].map(index => `${prefix}-user-${index}`);
  let clock = 1000;
  let sequence = 0;
  const now = () => clock;
  const repoA = new PostgresRoomRepository(pool);
  const repoB = new PostgresRoomRepository(pool);
  const serviceA = new HokmRoomService({ repository: repoA, now, id: () => `${prefix}-room-${++sequence}`, selectHakemSeat: () => 0 });
  const serviceB = new HokmRoomService({ repository: repoB, now, id: () => `${prefix}-unused-${++sequence}`, selectHakemSeat: () => 0 });

  try {
    const migration = await readFile(new URL("../migrations/001_hokm_rooms.sql", import.meta.url), "utf8");
    await pool.query(migration);

    let room = await serviceA.create({ authenticated: true, userId: users[0] });
    const competing = await Promise.allSettled([
      serviceA.join({ authenticated: true, userId: users[1] }, room.roomId, room.version),
      serviceB.join({ authenticated: true, userId: users[2] }, room.roomId, room.version)
    ]);
    assert.equal(competing.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(competing.filter(item => item.status === "rejected").length, 1);

    let persisted = await repoA.get(room.roomId);
    for (const userId of users.slice(1)) {
      if (!persisted.players.some(player => player.userId === userId)) {
        await serviceA.join({ authenticated: true, userId }, room.roomId, persisted.version);
        persisted = await repoA.get(room.roomId);
      }
    }
    for (const userId of users) {
      await serviceA.ready({ authenticated: true, userId }, room.roomId, true, persisted.version);
      persisted = await repoA.get(room.roomId);
    }
    await serviceA.start({ authenticated: true, userId: users[0] }, room.roomId, persisted.version);
    persisted = await repoA.get(room.roomId);
    assert.equal(persisted.status, "playing");
    assert.equal(typeof persisted.turnDeadlineAt, "number");

    const senderSeat = persisted.players.find(player => player.userId === users[0]);
    const opponent = persisted.players.find(player => player.seat % 2 !== senderSeat.seat % 2);
    const teammate = persisted.players.find(player =>
      player.userId !== users[0] && player.seat % 2 === senderSeat.seat % 2
    );
    assert.ok(opponent);
    assert.ok(teammate);
    await serviceA.sendChatMessage(
      { authenticated: true, userId: users[0] }, room.roomId, opponent.userId,
      "سلام 👋", `${prefix}-chat-1`, persisted.version
    );
    persisted = await repoA.get(room.roomId);
    assert.equal(persisted.chatMessages.length, 1);
    assert.equal((await serviceA.view({ authenticated: true, userId: users[0] }, room.roomId)).chatMessages.length, 1);
    assert.equal((await serviceA.view({ authenticated: true, userId: opponent.userId }, room.roomId)).chatMessages.length, 1);
    assert.equal((await serviceA.view({ authenticated: true, userId: teammate.userId }, room.roomId)).chatMessages.length, 0);

    await serviceA.reportCheating(
      { authenticated: true, userId: users[0] }, room.roomId, opponent.userId,
      "Live PostgreSQL manager-review acceptance", persisted.version
    );
    persisted = await repoA.get(room.roomId);
    const managerProjection = await serviceA.managerView(
      { authenticated: true, userId: `${prefix}-manager`, role: "manager" }, room.roomId
    );
    assert.equal(managerProjection.reports.length, 1);
    assert.equal("game" in managerProjection, false);
    assert.equal("chatMessages" in managerProjection, false);

    for (const userId of users) {
      await serviceA.disconnect({ authenticated: true, userId }, room.roomId, persisted.version);
      persisted = await repoA.get(room.roomId);
    }
    assert.equal(typeof persisted.allDisconnectedDeadline, "number");

    // Simulate a process restart: construct a new repository/service/scheduler
    // after all deadline state has already been committed to PostgreSQL.
    const restartedRepository = new PostgresRoomRepository(pool);
    const restartedService = new HokmRoomService({ repository: restartedRepository, now, selectHakemSeat: () => 0 });
    clock = persisted.allDisconnectedDeadline;
    const scheduler = new HokmDeadlineScheduler({
      service: restartedService, repository: restartedRepository, now
    });
    const poll = await scheduler.pollOnce();
    assert.equal(poll.discovered, 1);
    assert.equal(poll.processed, 1);
    assert.equal(poll.failed, 0);
    const finalRoom = await restartedRepository.get(room.roomId);
    assert.equal(finalRoom.status, "cancelled");
    assert.equal(finalRoom.cancelReason, "all_players_disconnected");
    assert.equal(finalRoom.result, null);
    assert.equal(finalRoom.chatMessages.length, 1, "chat metadata must survive PostgreSQL restart recovery");
    assert.equal(finalRoom.reports.length, 1, "manager review records must survive PostgreSQL restart recovery");
    assert.deepEqual((await restartedService.view(
      { authenticated: true, userId: users[0] }, room.roomId
    )).chatMessages, [], "completed/cancelled match views must not expose chat history");
  } finally {
    await pool.query("DELETE FROM hokm_rooms WHERE room_id LIKE $1", [`${prefix}%`]);
    await pool.query("DELETE FROM hokm_player_progress WHERE user_id LIKE $1", [`${prefix}%`]);
    await pool.end();
  }
});
