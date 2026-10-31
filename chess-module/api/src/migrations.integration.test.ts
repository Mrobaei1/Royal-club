import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const databaseUrl = process.env.CHESS_TEST_DATABASE_URL;

test("isolated chess migrations apply cleanly against a bigint users schema", { skip: !databaseUrl }, async () => {
  const schema = `chess_ci_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const db = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });

  try {
    await db.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE
      )
    `);

    for (const file of [
      "001_chess_core.sql",
      "002_realtime_notifications.sql",
      "003_draws_and_ratings.sql",
      "004_matchmaking_queue.sql",
      "005_room_lifecycle.sql",
      "006_admin_audit.sql",
    ]) {
      const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8");
      await db.query(sql);
    }

    const users = await db.query(
      "INSERT INTO users(username) VALUES ('white_test'),('black_test') RETURNING id"
    );
    const [white, black] = users.rows.map(row => String(row.id));
    const control = await db.query("SELECT id FROM chess_time_controls WHERE id='rapid' AND enabled=true");
    assert.equal(control.rowCount, 1);

    const room = await db.query(
      `INSERT INTO chess_rooms(room_code,host_user_id,time_control_id,settings_snapshot)
       VALUES('CIROOM', $1, 'rapid', '{"chatEnabled":true,"voiceEnabled":true}') RETURNING id`,
      [white],
    );
    const game = await db.query(
      `INSERT INTO chess_games(room_id,white_user_id,black_user_id,initial_fen,current_fen,clock_snapshot,settings_snapshot)
       VALUES($1,$2,$3,'start','start',
       '{"whiteMs":300000,"blackMs":300000,"active":"white","lastStartedAt":1000,"finished":false}',
       '{"timeControl":{"id":"rapid","baseMs":300000,"incrementMs":0}}') RETURNING id`,
      [room.rows[0].id, white, black],
    );

    await db.query(
      "INSERT INTO chess_matchmaking_queue(user_id,time_control_id,min_opponent_level) VALUES($1,'rapid',1)",
      [black],
    );
    await db.query(
      "INSERT INTO chess_voice_leases(room_id,user_id,lease_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '8 seconds')",
      [room.rows[0].id, white, randomUUID()],
    );
    await db.query(
      "INSERT INTO chess_chat_messages(game_id,user_id,message) VALUES($1,$2,'migration smoke test')",
      [game.rows[0].id, white],
    );

    const triggers = await db.query(
      `SELECT COUNT(*)::int AS count FROM pg_trigger
       WHERE NOT tgisinternal AND tgname IN (
         'chess_games_realtime_notify','chess_chat_realtime_notify','chess_voice_realtime_notify'
       )`,
    );
    assert.equal(triggers.rows[0].count, 3);

    const columns = await db.query(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema=$1 AND table_name IN ('chess_games','chess_rooms','chess_moves','chess_draw_offers','chess_player_ratings','chess_matchmaking_queue')`,
      [schema],
    );
    const actual = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`));
    for (const required of [
      "chess_games.revision", "chess_games.clock_snapshot", "chess_rooms.settings_snapshot", "chess_rooms.expires_at",
      "chess_moves.ply", "chess_draw_offers.status", "chess_player_ratings.rating",
      "chess_matchmaking_queue.min_opponent_level", "chess_admin_audit_events.action",
    ]) assert.ok(actual.has(required), `missing ${required}`);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
