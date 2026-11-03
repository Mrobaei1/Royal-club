import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { Pool } from "pg";
import { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import { registerChessRoutes } from "./routes.js";
import { createPingRateLimiter, registerChessWebSocket } from "./websocket.js";

const databaseUrl = process.env.CHESS_TEST_DATABASE_URL;
const migrations = [
  "001_chess_core.sql",
  "002_realtime_notifications.sql",
  "003_draws_and_ratings.sql",
  "004_matchmaking_queue.sql",
  "005_room_lifecycle.sql",
  "006_admin_audit.sql",
  "007_chat_rate_limit_index.sql",
  "008_cancel_draws_on_terminal.sql",
  "009_draw_offer_expiry.sql",
  "010_presence_sessions.sql",
];

function waitForMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 4_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for expected WebSocket message"));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(raw.toString()) as Record<string, unknown>; }
      catch { return; }
      if (!predicate(parsed)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(parsed);
    };
    socket.on("message", onMessage);
  });
}

function connect(url: string, userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { "x-user-id": userId } });
    const timer = setTimeout(() => reject(new Error("WebSocket connection timed out")), 4_000);
    socket.once("open", () => { clearTimeout(timer); resolve(socket); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

test("WebSocket ping limiter allows 30 pings, rejects the 31st, and resets after its window", () => {
  let now = 1_000;
  const allow = createPingRateLimiter(30, 10_000, () => now);
  for (let i = 0; i < 30; i += 1) assert.equal(allow(), true, `ping ${i + 1} should pass`);
  assert.equal(allow(), false, "31st ping in the same window must be rejected");
  now += 10_000;
  assert.equal(allow(), true, "first ping in the next window should pass");
});

test("WebSocket ping limiter uses a rolling window boundary without early reset", () => {
  let now = 5_000;
  const allow = createPingRateLimiter(2, 1_000, () => now);
  assert.equal(allow(), true);
  now += 999;
  assert.equal(allow(), true);
  assert.equal(allow(), false);
  now += 1;
  assert.equal(allow(), true);
});

test("WebSocket ping limiter prevents bursts across fixed-window boundaries", () => {
  let now = 10_000;
  const allow = createPingRateLimiter(2, 1_000, () => now);
  assert.equal(allow(), true);
  now += 999;
  assert.equal(allow(), true);
  assert.equal(allow(), false, "the allowance must not reset just before the first ping expires");
  now += 1;
  assert.equal(allow(), true, "the first ping expires at the exact window boundary");
  now += 998;
  assert.equal(allow(), false, "the second ping must still count inside its own window");
  now += 1;
  assert.equal(allow(), true, "the second ping expires at its exact window boundary");
});

test("WebSocket ping limiter rejects invalid configuration", () => {
  assert.throws(() => createPingRateLimiter(0, 10_000), RangeError);
  assert.throws(() => createPingRateLimiter(-1, 10_000), RangeError);
  assert.throws(() => createPingRateLimiter(1.5, 10_000), RangeError);
  assert.throws(() => createPingRateLimiter(30, 0), RangeError);
  assert.throws(() => createPingRateLimiter(30, Number.POSITIVE_INFINITY), RangeError);
});

test("WebSocket presence remains online until the player's last device disconnects", {
  skip: !databaseUrl,
  timeout: 45_000,
}, async () => {
  const schema = `chess_ws_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000, query_timeout: 5_000, statement_timeout: 5_000 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const poolOptions = {
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  };
  const pool = new Pool(poolOptions);
  const pool2 = new Pool(poolOptions);
  const app = Fastify();
  const app2 = Fastify();
  let address: string | undefined;
  let address2: string | undefined;
  let activeGameId: string | undefined;
  const sockets: WebSocket[] = [];

  const closeSocket = async (socket: WebSocket): Promise<void> => {
    if (socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("close", finish);
        resolve();
      };
      const timer = setTimeout(() => {
        try { socket.terminate(); } catch {}
        finish();
      }, 2_000);
      socket.once("close", finish);
      try {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, "test_cleanup");
        else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      } catch { finish(); }
      if (socket.readyState === WebSocket.CLOSED) finish();
    });
  };

  try {
    await pool.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE
      )
    `);
    for (const file of migrations) {
      const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8");
      await pool.query(sql);
    }
    const users = await pool.query(
      "INSERT INTO users(username) VALUES ('ws_white'),('ws_black'),('ws_outsider') RETURNING id,username",
    );
    const white = String(users.rows[0].id);
    const black = String(users.rows[1].id);
    const outsider = String(users.rows[2].id);

    await registerChessRoutes(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async (userId: string) => userId === white,
    });
    const websocketOptions = {
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
    };
    await registerChessWebSocket(app, { pool, ...websocketOptions });
    await registerChessWebSocket(app2, { pool: pool2, ...websocketOptions });
    await app.listen({ host: "127.0.0.1", port: 0 });
    await app2.listen({ host: "127.0.0.1", port: 0 });
    const serverAddress = app.server.address();
    const serverAddress2 = app2.server.address();
    address = serverAddress && typeof serverAddress !== "string"
      ? `ws://127.0.0.1:${(serverAddress as AddressInfo).port}/chess/ws`
      : undefined;
    address2 = serverAddress2 && typeof serverAddress2 !== "string"
      ? `ws://127.0.0.1:${(serverAddress2 as AddressInfo).port}/chess/ws`
      : undefined;
    assert.ok(address && address2, "both Fastify instances should listen on ephemeral ports");

    const room = await app.inject({
      method: "POST",
      url: "/chess/rooms",
      headers: { "x-user-id": white },
      payload: { timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true },
    });
    assert.equal(room.statusCode, 201, room.body);
    const joined = await app.inject({
      method: "POST",
      url: `/chess/rooms/${room.json().roomCode}/join`,
      headers: { "x-user-id": black },
    });
    assert.equal(joined.statusCode, 201, joined.body);
    const gameId = String(joined.json().gameId);
    activeGameId = gameId;
    const wsUrl = `${address}?gameId=${gameId}`;

    // A valid account that is not a participant must never subscribe to game events.
    const outsiderSocket = new WebSocket(`${address2}?gameId=${gameId}`, {
      headers: { "x-user-id": outsider },
    });
    sockets.push(outsiderSocket);
    const outsiderClose = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("non-participant WebSocket was not rejected")), 4_000);
      outsiderSocket.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
      outsiderSocket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const outsiderResult = await outsiderClose;
    assert.equal(outsiderResult.code, 1008);
    assert.equal(outsiderResult.reason, "not_a_game_participant");

    const blackSocket = await connect(`${address2}?gameId=${gameId}`, black);
    sockets.push(blackSocket);
    await waitForMessage(blackSocket, m => m.type === "chess:connected");
    const whiteFirst = await connect(wsUrl, white);
    sockets.push(whiteFirst);
    await waitForMessage(whiteFirst, m => m.type === "chess:connected");
    await waitForMessage(blackSocket, m =>
      m.type === "chess:opponent:presence" && m.username === "ws_white" && m.connected === true,
    );

    // Verify persisted chat reaches the other participant through PostgreSQL NOTIFY.
    const chatDelivery = waitForMessage(blackSocket, m =>
      m.type === "chess:chat:message" && m.username === "ws_white" && m.message === "Realtime hello",
    );
    const chatResponse = await app.inject({
      method: "POST",
      url: `/chess/games/${gameId}/chat`,
      headers: { "x-user-id": white },
      payload: { message: "Realtime hello" },
    });
    assert.equal(chatResponse.statusCode, 201, chatResponse.body);
    await chatDelivery;

    // A committed move must reach the opponent's WebSocket across API instances.
    const moveDelivery = waitForMessage(blackSocket, m =>
      m.type === "chess:state" && m.revision === 1 && typeof m.fen === "string" && m.fen.includes(" b "),
    );
    const moveResponse = await app.inject({
      method: "POST",
      url: `/chess/games/${gameId}/moves`,
      headers: { "x-user-id": white },
      payload: { from: "e2", to: "e4" },
    });
    assert.equal(moveResponse.statusCode, 200, moveResponse.body);
    await moveDelivery;

    const whiteSecond = await connect(`${address2}?gameId=${gameId}`, white);
    sockets.push(whiteSecond);
    await waitForMessage(whiteSecond, m => m.type === "chess:connected");
    let sessions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2",
      [gameId, white],
    );
    assert.equal(sessions.rows[0].count, 2, "both white-device sessions must be registered");

    whiteFirst.close();
    await new Promise<void>((resolve, reject) => {
      if (whiteFirst.readyState === WebSocket.CLOSED) return resolve();
      whiteFirst.once("close", () => resolve());
      setTimeout(() => reject(new Error("first device did not close")), 4_000);
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    sessions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2",
      [gameId, white],
    );
    assert.equal(sessions.rows[0].count, 1, "closing one device must preserve the other session");
    assert.equal(
      (await pool.query("SELECT 1 FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2", [gameId, white])).rowCount,
      1,
    );

    const offline = waitForMessage(blackSocket, m =>
      m.type === "chess:opponent:presence" && m.username === "ws_white" && m.connected === false,
    );
    whiteSecond.close();
    await new Promise<void>((resolve, reject) => {
      if (whiteSecond.readyState === WebSocket.CLOSED) return resolve();
      whiteSecond.once("close", () => resolve());
      setTimeout(() => reject(new Error("second device did not close")), 4_000);
    });
    await offline;
    sessions = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2",
      [gameId, white],
    );
    assert.equal(sessions.rows[0].count, 0, "last device closing must clear presence sessions");

    // Reconnecting after missed transient events must immediately restore the persisted board.
    const reconnectedWhite = await connect(wsUrl, white);
    sockets.push(reconnectedWhite);
    await waitForMessage(reconnectedWhite, m => m.type === "chess:connected");
    const restoredState = await waitForMessage(reconnectedWhite, m =>
      m.type === "chess:state" && m.revision === 1 && typeof m.fen === "string" && m.fen.includes(" b "),
    );
    assert.equal(restoredState.status, "active");
    // WebSocket frames above the documented 16 KiB cap must be rejected.
    const oversizedSocket = await connect(wsUrl, white);
    sockets.push(oversizedSocket);
    await waitForMessage(oversizedSocket, m => m.type === "chess:connected");
    const oversizedClose = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("oversized WebSocket payload was not rejected")), 4_000);
      oversizedSocket.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
    oversizedSocket.send(JSON.stringify({ type: "ping", padding: "x".repeat(17 * 1024) }));
    const oversizedResult = await oversizedClose;
    assert.equal(oversizedResult.code, 1009, "payloads over 16 KiB must close with message-too-big");

    // A successful ping/pong proves the inbound message handler is attached.
    const readyPong = waitForMessage(reconnectedWhite, m => m.type === "chess:pong" && m.clientTime === 0);
    reconnectedWhite.send(JSON.stringify({ type: "ping", clientTime: 0 }));
    await readyPong;

    // Exercise the real authenticated socket handler, not only the extracted limiter.
    const rateLimitedClose = new Promise<{ code: number; reason: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ping flood did not close the WebSocket")), 4_000);
      reconnectedWhite.once("close", (code, reason) => {
        clearTimeout(timer);
        resolve({ code, reason: reason.toString() });
      });
    });
    for (let i = 1; i < 31; i += 1) {
      reconnectedWhite.send(JSON.stringify({ type: "ping", clientTime: i }));
    }
    const closeResult = await rateLimitedClose;
    assert.equal(closeResult.code, 1008, "the 31st ping must close the socket with policy violation");
    assert.equal(closeResult.reason, "rate_limited");
  } finally {
    // Wait for client close events before closing Fastify; server-side presence cleanup is asynchronous.
    await Promise.all(sockets.map(closeSocket));
    if (activeGameId) {
      const cleanupDeadline = Date.now() + 5_000;
      while (Date.now() < cleanupDeadline) {
        const remaining = await pool.query(
          "SELECT COUNT(*)::int AS count FROM chess_presence_sessions WHERE game_id=$1",
          [activeGameId],
        ).catch(() => ({ rows: [{ count: 0 }] }));
        if (remaining.rows[0].count === 0) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    await app.close().catch(() => {});
    await app2.close().catch(() => {});
    await pool.end();
    await pool2.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
