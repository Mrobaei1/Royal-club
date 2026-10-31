import test from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { adjudicateExpiredChessClocks } from "./clock-scheduler.js";

test("expired active clock is atomically adjudicated and releases room voice lease", async () => {
  const calls: Array<{ sql: string; values?: unknown[] | undefined }> = [];
  const game = {
    id: 41,
    room_id: 9,
    white_user_id: 101,
    black_user_id: 202,
    clock_snapshot: {
      whiteMs: 100,
      blackMs: 300000,
      active: "white" as const,
      lastStartedAt: 1000,
      finished: false
    },
    settings_snapshot: {
      timeControl: { id: "rapid", name: "rapid", baseMs: 300000, incrementMs: 0, enabled: true }
    }
  };

  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("SELECT id,room_id,white_user_id")) return { rows: [game], rowCount: 1 };
      if (sql.includes("SELECT user_id,rating")) {
        return { rows: [{ user_id: 101, rating: 1200 }, { user_id: 202, rating: 1200 }], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };

  const pool = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      return { rows: [{ id: 41 }], rowCount: 1 };
    },
    async connect() { return client; }
  } as unknown as Pool;

  const result = await adjudicateExpiredChessClocks(pool, 1200);
  assert.equal(result, 1);
  assert.ok(calls.some(call => call.sql.includes("FOR UPDATE SKIP LOCKED")));
  assert.ok(calls.some(call => call.sql.includes("status=$2") && call.values?.[1] === "black_win"));
  assert.ok(calls.some(call => call.sql.includes("UPDATE chess_rooms SET status='finished'")));
  assert.ok(calls.some(call => call.sql.includes("DELETE FROM chess_voice_leases")));
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});
