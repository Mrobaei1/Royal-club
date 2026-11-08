import test from "node:test";
import assert from "node:assert/strict";
import { PostgresRoomRepository } from "./hokm/postgres-repository.js";

test("PostgreSQL room reads hydrate cumulative account XP from the durable progression table", async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const room = {
    roomId: "progress-room",
    status: "playing",
    version: 7,
    players: [
      { userId: "10", seat: 0 },
      { userId: "11", seat: 1 },
      { userId: "12", seat: 2 },
      { userId: "13", seat: 3 },
    ],
    playerProgress: { "10": { xp: 5, level: 1 } },
    round: null,
  };
  const pool = {
    async connect() { return {}; },
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("FROM hokm_rooms")) return { rows: [{ room_data: room }] };
      if (sql.includes("FROM users u")) {
        return { rows: [
          { userId: "10", username: "RoyalPlayer", xp: "79439", level: 100 },
          { userId: "11", username: "CardMaster", xp: "295", level: 2 },
          { userId: "12", username: "Guest12", xp: null, level: null },
          { userId: "13", username: "Guest13", xp: null, level: null },
        ] };
      }
      throw new Error("Unexpected query");
    },
  };
  const repository = new PostgresRoomRepository(pool);
  const restored = await repository.get("progress-room");
  assert.deepEqual(restored.playerProgress, {
    "10": { xp: 79439, level: 100 },
    "11": { xp: 295, level: 2 },
    "12": { xp: 0, level: 1 },
    "13": { xp: 0, level: 1 },
  });
  assert.deepEqual(restored.players.map((player: { username: string }) => player.username), [
    "RoyalPlayer", "CardMaster", "Guest12", "Guest13",
  ]);
  assert.deepEqual(calls[1]?.params, [["10", "11", "12", "13"]]);
});

test("missing PostgreSQL rooms return null without querying account progression", async () => {
  let queryCount = 0;
  const repository = new PostgresRoomRepository({
    async connect() { return {}; },
    async query() { queryCount += 1; return { rows: [] }; },
  });
  assert.equal(await repository.get("missing"), null);
  assert.equal(queryCount, 1);
});
