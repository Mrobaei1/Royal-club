import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { Pool } from "pg";
import type { FastifyRequest } from "fastify";
import { registerChessRoutes } from "./routes.js";

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
      "INSERT INTO users(username) VALUES ('route_white'),('route_black'),('queue_one'),('queue_two') RETURNING id,username"
    );
    const ids = users.rows.map(row => String(row.id));
    const white = ids[0]!;
    const black = ids[1]!;
    const queueOne = ids[2]!;
    const queueTwo = ids[3]!;

    await registerChessRoutes(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async () => true,
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

    const created = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid",
      minOpponentLevel: 1,
      chatEnabled: true,
      voiceEnabled: false,
    });
    assert.equal(created.statusCode, 201, created.body);
    const roomCode = created.json().roomCode as string;

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

    const queued = await request(queueOne, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(queued.json().status, "waiting");
    const matched = await request(queueTwo, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(matched.statusCode, 201, matched.body);
    assert.equal(matched.json().status, "matched");
    const matchStatus = await request(queueOne, "GET", "/chess/matchmaking/status");
    assert.equal(matchStatus.json().status, "matched");
  } finally {
    await app.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
