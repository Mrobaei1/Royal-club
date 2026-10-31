import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { adjudicateExpiredChessClocks } from "./clock-scheduler.js";

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
      "007_chat_rate_limit_index.sql",
      "008_cancel_draws_on_terminal.sql",
      "009_draw_offer_expiry.sql",
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
    await db.query(
      "INSERT INTO chess_admin_audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'time_control_upsert','time_control','rapid')",
      [white],
    );

    const room = await db.query(
      `INSERT INTO chess_rooms(room_code,host_user_id,time_control_id,settings_snapshot)
       VALUES('CIROOM', $1, 'rapid', '{"chatEnabled":true,"voiceEnabled":true}') RETURNING id`,
      [white],
    );
    const game = await db.query(
      `INSERT INTO chess_games(room_id,white_user_id,black_user_id,initial_fen,current_fen,clock_snapshot,settings_snapshot)
       VALUES($1,$2,$3,'start','start',
       '{"whiteMs":100,"blackMs":300000,"active":"white","lastStartedAt":1000,"finished":false}',
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
    const drawOffer = await db.query(
      "INSERT INTO chess_draw_offers(game_id,offered_by) VALUES($1,$2) RETURNING id",
      [game.rows[0].id, white],
    );

    const adjudicated = await adjudicateExpiredChessClocks(db, 1200);
    assert.equal(adjudicated, 1);
    const finished = await db.query("SELECT status FROM chess_games WHERE id=$1",[game.rows[0].id]);
    assert.equal(finished.rows[0].status, "black_win");
    const roomState = await db.query("SELECT status FROM chess_rooms WHERE id=$1",[room.rows[0].id]);
    assert.equal(roomState.rows[0].status, "finished");
    const leases = await db.query("SELECT 1 FROM chess_voice_leases WHERE room_id=$1",[room.rows[0].id]);
    assert.equal(leases.rowCount, 0);
    const cancelledOffer = await db.query("SELECT status FROM chess_draw_offers WHERE id=$1",[drawOffer.rows[0].id]);
    assert.equal(cancelledOffer.rows[0].status, "cancelled");
    const progression = await db.query("SELECT user_id,xp FROM chess_player_progression ORDER BY user_id");
    assert.deepEqual(progression.rows.map(row => Number(row.xp)), [5, 20]);
    assert.equal(await adjudicateExpiredChessClocks(db, 1200), 0);

    const triggers = await db.query(
      `SELECT COUNT(*)::int AS count FROM pg_trigger
       WHERE NOT tgisinternal AND tgname IN (
         'chess_games_realtime_notify','chess_chat_realtime_notify','chess_voice_realtime_notify','chess_cancel_pending_draws_terminal'
       )`,
    );
    assert.equal(triggers.rows[0].count, 4);

    const columns = await db.query(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema=$1 AND table_name IN ('chess_games','chess_rooms','chess_moves','chess_draw_offers','chess_player_ratings','chess_matchmaking_queue','chess_admin_audit_events')`,
      [schema],
    );
    const actual = new Set(columns.rows.map(row => `${row.table_name}.${row.column_name}`));
    for (const required of [
      "chess_games.revision", "chess_games.clock_snapshot", "chess_rooms.settings_snapshot", "chess_rooms.expires_at",
      "chess_moves.ply", "chess_draw_offers.status", "chess_draw_offers.expires_at", "chess_player_ratings.rating",
      "chess_matchmaking_queue.min_opponent_level", "chess_admin_audit_events.action",
    ]) assert.ok(actual.has(required), `missing ${required}`);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
