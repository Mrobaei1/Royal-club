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
import { registerChessWebSocket } from "./websocket.js";

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

test("WebSocket presence remains online until the player's last device disconnects", {
  skip: !databaseUrl,
  timeout: 45_000,
}, async () => {
  const schema = `chess_ws_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000, query_timeout: 5_000, statement_timeout: 5_000 });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
    connectionTimeoutMillis: 3_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });
  const app = Fastify();
  let address: string | undefined;
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
      "INSERT INTO users(username) VALUES ('ws_white'),('ws_black') RETURNING id,username",
    );
    const white = String(users.rows[0].id);
    const black = String(users.rows[1].id);

    await registerChessRoutes(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async (userId: string) => userId === white,
    });
    await registerChessWebSocket(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const serverAddress = app.server.address();
    address = serverAddress && typeof serverAddress !== "string"
      ? `ws://127.0.0.1:${(serverAddress as AddressInfo).port}/chess/ws`
      : undefined;
    assert.ok(address, "Fastify should listen on an ephemeral port");

    const room = await app.inject({
      method: "POST",
      url: "/chess/rooms",
      headers: { "x-user-id": white },
      payload: { timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true, voiceEnabled: false },
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

    const blackSocket = await connect(wsUrl, black);
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

    // Verify host voice settings and the authenticated WebRTC signaling relay.
    const voiceSettings = waitForMessage(blackSocket, m =>
      m.type === "chess:voice:settings" && m.enabled === true,
    );
    const enabled = await app.inject({
      method: "POST",
      url: `/chess/games/${gameId}/voice/enable`,
      headers: { "x-user-id": white },
    });
    assert.equal(enabled.statusCode, 200, enabled.body);
    await voiceSettings;

    const leaseResponse = await app.inject({
      method: "POST",
      url: `/chess/games/${gameId}/voice/request`,
      headers: { "x-user-id": white },
    });
    assert.equal(leaseResponse.statusCode, 200, leaseResponse.body);
    const lease = leaseResponse.json();
    assert.equal(lease.granted, true);

    const offerDelivery = waitForMessage(blackSocket, m =>
      m.type === "chess:voice:signal" && m.signalType === "offer",
    );
    whiteFirst.send(JSON.stringify({
      type: "chess:voice:signal",
      signalType: "offer",
      payload: { type: "offer", sdp: "v=0\\r\\n" },
    }));
    await offerDelivery;

    const answerDelivery = waitForMessage(whiteFirst, m =>
      m.type === "chess:voice:signal" && m.signalType === "answer",
    );
    blackSocket.send(JSON.stringify({
      type: "chess:voice:signal",
      signalType: "answer",
      payload: { type: "answer", sdp: "v=0\\r\\n" },
    }));
    await answerDelivery;

    const candidateDelivery = waitForMessage(blackSocket, m =>
      m.type === "chess:voice:signal" && m.signalType === "candidate",
    );
    whiteFirst.send(JSON.stringify({
      type: "chess:voice:signal",
      signalType: "candidate",
      payload: { candidate: "candidate:1 1 UDP 1 127.0.0.1 9 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    }));
    await candidateDelivery;

    const disabledSettings = waitForMessage(blackSocket, m =>
      m.type === "chess:voice:settings" && m.enabled === false,
    );
    const disabled = await app.inject({
      method: "POST",
      url: `/chess/games/${gameId}/voice/disable`,
      headers: { "x-user-id": white },
    });
    assert.equal(disabled.statusCode, 200, disabled.body);
    await disabledSettings;

    const whiteSecond = await connect(wsUrl, white);
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
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
