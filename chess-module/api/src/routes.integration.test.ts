import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { Pool } from "pg";
import type { FastifyRequest } from "fastify";
import { registerChessRoutes } from "./routes.js";
import { awardChessResult } from "./progression-store.js";
import { adjudicateExpiredChessClocks, expirePendingChessDrawOffers } from "./clock-scheduler.js";

const databaseUrl = process.env.CHESS_TEST_DATABASE_URL;
const migrationFiles = [
  "001_chess_core.sql",
  "002_realtime_notifications.sql",
  "003_draws_and_ratings.sql",
  "004_matchmaking_queue.sql",
  "005_room_lifecycle.sql",
  "006_admin_audit.sql",
  "007_chat_rate_limit_index.sql",
  "008_cancel_draws_on_terminal.sql",
  "009_draw_offer_expiry.sql",
];

test("authenticated chess routes support private game, draw, chat, voice, profiles and admin audit", { skip: !databaseUrl }, async () => {
  const schema = `chess_routes_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });
  const app = Fastify();

  try {
    await pool.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE
      )
    `);
    for (const file of migrationFiles) {
      const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8");
      await pool.query(sql);
    }

    const users = await pool.query(
      "INSERT INTO users(username) VALUES ('route_white'),('route_black'),('queue_one'),('queue_two'),('queue_cancel') RETURNING id,username"
    );
    const ids = users.rows.map(row => String(row.id));
    const white = ids[0]!;
    const black = ids[1]!;
    const queueOne = ids[2]!;
    const queueTwo = ids[3]!;
    const queueCancel = ids[4]!;

    await registerChessRoutes(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async (userId: string) => userId === white,
    });
    await app.ready();

    type TestResponse = { statusCode: number; body: string; json: () => any };
    const request = async (
      userId: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      payload?: unknown,
    ): Promise<TestResponse> => await (app.inject({
      method,
      url,
      headers: { "x-user-id": userId },
      ...(payload === undefined ? {} : { payload }),
    } as never) as unknown as Promise<TestResponse>);

    const levelGateRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid",
      minOpponentLevel: 3,
      chatEnabled: true,
      voiceEnabled: false,
    });
    assert.equal(levelGateRoom.statusCode, 201, levelGateRoom.body);
    const underLevel = await request(black, "POST", `/chess/rooms/${levelGateRoom.json().roomCode}/join`);
    assert.equal(underLevel.statusCode, 403, underLevel.body);
    const cancelLevelGateRoom = await request(white, "DELETE", `/chess/rooms/${levelGateRoom.json().roomCode}`);
    assert.equal(cancelLevelGateRoom.statusCode, 200, cancelLevelGateRoom.body);

    const created = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid",
      minOpponentLevel: 1,
      chatEnabled: true,
      voiceEnabled: false,
    });
    assert.equal(created.statusCode, 201, created.body);
    const roomCode = created.json().roomCode as string;
    const duplicateRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    assert.equal(duplicateRoom.statusCode, 409);

    const selfJoin = await request(white, "POST", `/chess/rooms/${roomCode}/join`);
    assert.equal(selfJoin.statusCode, 400);
    const joined = await request(black, "POST", `/chess/rooms/${roomCode}/join`);
    assert.equal(joined.statusCode, 201, joined.body);
    const gameId = joined.json().gameId as string;

    const whiteGame = await request(white, "GET", `/chess/games/${gameId}`);
    assert.equal(whiteGame.statusCode, 200, whiteGame.body);
    assert.equal(whiteGame.json().isHost, true);
    assert.ok(whiteGame.json().legalMoves.includes("e2e4"));
    assert.equal(whiteGame.json().players.white.username, "route_white");

    const offer = await request(white, "POST", `/chess/games/${gameId}/draw-offers`);
    assert.equal(offer.statusCode, 201, offer.body);
    const pending = await request(black, "GET", `/chess/games/${gameId}/draw-offers`);
    assert.equal(pending.json().pending, true);
    assert.equal(pending.json().offeredByMe, false);
    const declined = await request(black, "POST",
      `/chess/games/${gameId}/draw-offers/${offer.json().offerId}/respond`, { accept: false });
    assert.equal(declined.statusCode, 200, declined.body);
    assert.equal(declined.json().status, "declined");

    const chat = await request(white, "POST", `/chess/games/${gameId}/chat`, { message: "hello chess" });
    assert.equal(chat.statusCode, 201, chat.body);
    const history = await request(black, "GET", `/chess/games/${gameId}/chat`);
    assert.equal(history.json().messages[0].message, "hello chess");
    assert.equal(history.json().messages[0].username, "route_white");

    const deniedEnable = await request(black, "POST", `/chess/games/${gameId}/voice/enable`);
    assert.equal(deniedEnable.statusCode, 403);
    const enabled = await request(white, "POST", `/chess/games/${gameId}/voice/enable`);
    assert.equal(enabled.statusCode, 200, enabled.body);
    const lease = await request(white, "POST", `/chess/games/${gameId}/voice/request`);
    assert.equal(lease.statusCode, 200, lease.body);
    assert.equal(lease.json().granted, true);
    const occupied = await request(black, "POST", `/chess/games/${gameId}/voice/request`);
    assert.equal(occupied.statusCode, 409);
    const released = await request(white, "POST", `/chess/games/${gameId}/voice/release`, {
      leaseId: lease.json().leaseId,
    });
    assert.equal(released.statusCode, 200);
    assert.equal(released.json().released, true);
    const deniedDisable = await request(black, "POST", `/chess/games/${gameId}/voice/disable`);
    assert.equal(deniedDisable.statusCode, 403);
    const disabled = await request(white, "POST", `/chess/games/${gameId}/voice/disable`);
    assert.equal(disabled.statusCode, 200, disabled.body);

    const moveWhite = await request(white, "POST", `/chess/games/${gameId}/moves`, { from: "e2", to: "e4" });
    assert.equal(moveWhite.statusCode, 200, moveWhite.body);
    const moveBlack = await request(black, "POST", `/chess/games/${gameId}/moves`, { from: "e7", to: "e5" });
    assert.equal(moveBlack.statusCode, 200, moveBlack.body);
    const historyMoves = await request(white, "GET", `/chess/games/${gameId}/history?afterPly=0`);
    assert.equal(historyMoves.json().moves.length, 2);

    const profile = await request(black, "GET", "/chess/players/username/route_white/profile");
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json().username, "route_white");
    assert.equal("fullName" in profile.json(), false);
    assert.equal("phone" in profile.json(), false);
    assert.equal("email" in profile.json(), false);
    assert.equal("id" in profile.json(), false);
    const privateGame = await request(queueCancel, "GET", `/chess/games/${gameId}`);
    assert.equal(privateGame.statusCode, 404);
    const privateChat = await request(queueCancel, "GET", `/chess/games/${gameId}/chat`);
    assert.equal(privateChat.statusCode, 404);

    const deniedAdmin = await request(black, "PUT", "/chess/admin/time-controls", {
      id: "forbidden", displayName: "Forbidden", baseMs: 180000, incrementMs: 0, enabled: true,
    });
    assert.equal(deniedAdmin.statusCode, 403);
    const savedControl = await request(white, "PUT", "/chess/admin/time-controls", {
      id: "blitz_test",
      displayName: "Test Blitz",
      baseMs: 180000,
      incrementMs: 2000,
      enabled: true,
    });
    assert.equal(savedControl.statusCode, 200, savedControl.body);
    const audit = await request(white, "GET", "/chess/admin/audit");
    assert.ok(audit.json().events.some((event: { action: string }) => event.action === "time_control_upsert"));

    const resigned = await request(white, "POST", `/chess/games/${gameId}/resign`);
    assert.equal(resigned.statusCode, 200, resigned.body);
    assert.equal(resigned.json().status, "black_win");

    const progressionBefore = await pool.query(
      "SELECT user_id,xp FROM chess_player_progression WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(progressionBefore.rows.map(row => Number(row.xp)), [0, 20]);
    const ratingBefore = await pool.query(
      "SELECT user_id,rating FROM chess_player_ratings WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(ratingBefore.rows.map(row => Number(row.rating)), [1184, 1216]);
    const idempotencyClient = await pool.connect();
    try {
      await idempotencyClient.query("BEGIN");
      await awardChessResult(idempotencyClient, gameId, "final_result", white, black, {
        outcome: "resignation", winnerId: black, loserId: white,
      });
      await idempotencyClient.query("COMMIT");
    } catch (error) {
      await idempotencyClient.query("ROLLBACK");
      throw error;
    } finally {
      idempotencyClient.release();
    }
    const progressionAfter = await pool.query(
      "SELECT user_id,xp FROM chess_player_progression WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(progressionAfter.rows.map(row => Number(row.xp)), [0, 20]);

    const timeoutRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    const timeoutJoin = await request(black, "POST", `/chess/rooms/${timeoutRoom.json().roomCode}/join`);
    assert.equal(timeoutJoin.statusCode, 201, timeoutJoin.body);
    const timeoutGameId = timeoutJoin.json().gameId as string;
    const expiringOffer = await request(white, "POST", `/chess/games/${timeoutGameId}/draw-offers`);
    assert.equal(expiringOffer.statusCode, 201, expiringOffer.body);
    await pool.query(
      "UPDATE chess_draw_offers SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",
      [expiringOffer.json().offerId],
    );
    assert.equal(await expirePendingChessDrawOffers(pool), 1);
    const expiredOffer = await pool.query("SELECT status FROM chess_draw_offers WHERE id=$1", [expiringOffer.json().offerId]);
    assert.equal(expiredOffer.rows[0].status, "cancelled");
    const timeoutNow = Date.now();
    await pool.query(
      "UPDATE chess_games SET clock_snapshot=jsonb_set(jsonb_set(clock_snapshot,'{whiteMs}','1'::jsonb),'{lastStartedAt}',to_jsonb($2::bigint)) WHERE id=$1",
      [timeoutGameId, timeoutNow - 5000],
    );
    const concurrentTimeouts = await Promise.all([
      adjudicateExpiredChessClocks(pool, timeoutNow),
      adjudicateExpiredChessClocks(pool, timeoutNow),
    ]);
    assert.deepEqual(concurrentTimeouts.sort(), [0, 1]);
    const timeoutResult = await pool.query(
      "SELECT status,clock_snapshot->>'finished' AS finished FROM chess_games WHERE id=$1",
      [timeoutGameId],
    );
    assert.equal(timeoutResult.rows[0].status, "black_win");
    assert.equal(timeoutResult.rows[0].finished, "true");
    assert.equal(await adjudicateExpiredChessClocks(pool, timeoutNow + 1000), 0);
    const timeoutRoomStatus = await pool.query(
      "SELECT status FROM chess_rooms WHERE room_code=$1",
      [timeoutRoom.json().roomCode],
    );
    assert.equal(timeoutRoomStatus.rows[0].status, "finished");

    const cancellable = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    const cancellableCode = cancellable.json().roomCode as string;
    const guestCancel = await request(black, "DELETE", `/chess/rooms/${cancellableCode}`);
    assert.equal(guestCancel.statusCode, 404);
    const hostCancel = await request(white, "DELETE", `/chess/rooms/${cancellableCode}`);
    assert.equal(hostCancel.statusCode, 200);
    assert.equal(hostCancel.json().cancelled, true);

    const expiring = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    const expiringCode = expiring.json().roomCode as string;
    await pool.query("UPDATE chess_rooms SET expires_at=NOW()-INTERVAL '1 second' WHERE room_code=$1", [expiringCode]);
    const expiredJoin = await request(black, "POST", `/chess/rooms/${expiringCode}/join`);
    assert.equal(expiredJoin.statusCode, 410);
    const expiredRoom = await pool.query("SELECT status FROM chess_rooms WHERE room_code=$1", [expiringCode]);
    assert.equal(expiredRoom.rows[0].status, "cancelled");

    const queued = await request(queueOne, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(queued.json().status, "waiting");
    const queuedRoom = await request(queueOne, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    assert.equal(queuedRoom.statusCode, 409);
    const matched = await request(queueTwo, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(matched.statusCode, 201, matched.body);
    assert.equal(matched.json().status, "matched");
    const matchStatus = await request(queueOne, "GET", "/chess/matchmaking/status");
    assert.equal(matchStatus.json().status, "matched");
    const activeRoom = await request(queueOne, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false,
    });
    assert.equal(activeRoom.statusCode, 409);

    const cancelQueue = await request(queueCancel, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(cancelQueue.statusCode, 202);
    const cancelled = await request(queueCancel, "DELETE", "/chess/matchmaking/queue");
    assert.equal(cancelled.json().cancelled, true);
    const idle = await request(queueCancel, "GET", "/chess/matchmaking/status");
    assert.equal(idle.json().status, "idle");
  } finally {
    await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
