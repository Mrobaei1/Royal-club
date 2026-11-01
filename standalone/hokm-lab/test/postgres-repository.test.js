import test from "node:test";
import assert from "node:assert/strict";
import { PostgresRoomRepository } from "../src/postgres-repository.js";

function fakePool({ updateRows = 1, failOnProgress = false } = {}) {
  const calls = [];
  const pool = {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT room_data")) return { rows: [{ room_data: { roomId: "r1", version: 2 } }] };
      return { rows: [], rowCount: 1 };
    },
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql.startsWith("UPDATE hokm_rooms")) return { rows: [], rowCount: updateRows };
          if (failOnProgress && sql.startsWith("INSERT INTO hokm_player_progress")) throw new Error("progress write failed");
          return { rows: [], rowCount: 1 };
        },
        release() { calls.push({ sql: "RELEASE" }); }
      };
    }
  };
  return pool;
}

test("PostgreSQL repository reads persisted room JSON", async () => {
  const pool = fakePool();
  const repository = new PostgresRoomRepository(pool);
  assert.deepEqual(await repository.get("r1"), { roomId: "r1", version: 2 });
});

test("PostgreSQL room update and XP upserts share one transaction", async () => {
  const pool = fakePool();
  const repository = new PostgresRoomRepository(pool);
  const next = {
    roomId: "r1", version: 3, status: "completed",
    playerProgress: { u1: { xp: 20, level: 1 }, u2: { xp: 5, level: 1 } }
  };
  assert.equal(await repository.compareAndSwap("r1", 2, next), true);
  const statements = pool.calls.map(call => call.sql);
  assert.equal(statements[0], "BEGIN");
  assert.ok(statements[1].startsWith("UPDATE hokm_rooms"));
  assert.equal(statements.filter(sql => sql.startsWith("INSERT INTO hokm_player_progress")).length, 2);
  assert.equal(statements.at(-2), "COMMIT");
  assert.equal(statements.at(-1), "RELEASE");
});

test("PostgreSQL repository rolls back a stale room version without writing XP", async () => {
  const pool = fakePool({ updateRows: 0 });
  const repository = new PostgresRoomRepository(pool);
  const next = { roomId: "r1", version: 3, playerProgress: { u1: { xp: 20, level: 1 } } };
  assert.equal(await repository.compareAndSwap("r1", 2, next), false);
  const statements = pool.calls.map(call => call.sql);
  assert.deepEqual(statements, ["BEGIN", "UPDATE hokm_rooms SET version = $3, room_data = $4::jsonb, updated_at = now() WHERE room_id = $1 AND version = $2 RETURNING room_id", "ROLLBACK", "RELEASE"]);
});

test("PostgreSQL repository rolls back room state if XP persistence fails", async () => {
  const pool = fakePool({ failOnProgress: true });
  const repository = new PostgresRoomRepository(pool);
  const next = { roomId: "r1", version: 3, playerProgress: { u1: { xp: 20, level: 1 } } };
  await assert.rejects(repository.compareAndSwap("r1", 2, next), /progress write failed/);
  const statements = pool.calls.map(call => call.sql);
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.includes("COMMIT"));
  assert.equal(statements.at(-1), "RELEASE");
});

test("PostgreSQL repository rejects invalid version jumps before opening a transaction", async () => {
  const pool = fakePool();
  const repository = new PostgresRoomRepository(pool);
  await assert.rejects(
    repository.compareAndSwap("r1", 2, { roomId: "r1", version: 4 }),
    /Invalid room compare-and-swap transition/
  );
  assert.equal(pool.calls.length, 0);
});
