import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { io as connect, type Socket } from 'socket.io-client';

const databaseUrl = process.env.UNO_INTEGRATION_DATABASE_URL ?? '';
const jwtSecret = 'integration-secret-long-enough-for-hs256';
const port = 4197;
const baseUrl = `http://127.0.0.1:${port}`;

function createToken(userId: string, version = 0): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ver: version,
  })).toString('base64url');
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function waitForHealth(child: ChildProcess, getLogs: () => string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`UNO service exited early: ${getLogs()}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The service may still be starting.
    }
    await delay(100);
  }
  throw new Error(`UNO service did not become healthy: ${getLogs()}`);
}

function startService(database: string): { child: ChildProcess; logs: () => string } {
  let output = '';
  const child = spawn(process.execPath, ['dist/src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      JWT_SECRET: jwtSecret,
      DATABASE_URL: database,
      CORS_ORIGINS: 'http://localhost:3000',
      TURN_URL: 'turn:turn.test.invalid:3478?transport=udp',
      TURN_SHARED_SECRET: 'test-turn-shared-secret',
      TURN_TTL_SECONDS: '300',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  return { child, logs: () => output };
}

async function stopService(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    delay(3000).then(() => { child.kill('SIGKILL'); }),
  ]);
}

function connectSocket(token: string): Promise<Socket> {
  const socket = connect(baseUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: false,
    forceNew: true,
    timeout: 5000,
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => {
      socket.disconnect();
      reject(error);
    });
  });
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error: Error | null, response: Record<string, unknown>) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

test('PostgreSQL-backed UNO service authenticates, issues TURN credentials and restores live rooms', {
  skip: !databaseUrl,
  timeout: 45_000,
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let service: ChildProcess | null = null;
  let getServiceLogs = () => '';
  const sockets: Socket[] = [];
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        token_version INTEGER NOT NULL DEFAULT 0
      )
    `);
    await pool.query('TRUNCATE users RESTART IDENTITY');
    const inserted = await pool.query(
      'INSERT INTO users (username, token_version) VALUES ($1, 0), ($2, 0) RETURNING id, username',
      ['integration_host', 'integration_guest'],
    );
    const hostId = String(inserted.rows[0]!.id);
    const guestId = String(inserted.rows[1]!.id);
    const hostToken = createToken(hostId);
    const guestToken = createToken(guestId);

    let running = startService(databaseUrl!);
    service = running.child;
    getServiceLogs = running.logs;
    await waitForHealth(service, running.logs);

    const iceResponse = await fetch(`${baseUrl}/ice-config`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    assert.equal(iceResponse.status, 200);
    const iceConfig = await iceResponse.json() as { iceServers: Array<Record<string, string>> };
    assert.equal(iceConfig.iceServers.length, 2);
    assert.equal(iceConfig.iceServers[1]!.urls, 'turn:turn.test.invalid:3478?transport=udp');
    const turnUsername = iceConfig.iceServers[1]!.username!;
    assert.match(turnUsername, /^\d+:\d+$/);
    assert.equal(
      iceConfig.iceServers[1]!.credential,
      createHmac('sha1', 'test-turn-shared-secret').update(turnUsername).digest('base64'),
    );

    const host = await connectSocket(hostToken);
    const guest = await connectSocket(guestToken);
    sockets.push(host, guest);
    const created = await emitAck(host, 'uno:room:create', {});
    assert.equal(created.ok, true);
    const code = String((created.data as Record<string, unknown>).code);
    assert.equal((await emitAck(guest, 'uno:room:join', { code })).ok, true);
    assert.equal((await emitAck(host, 'uno:room:ready', { code, ready: true })).ok, true);
    assert.equal((await emitAck(guest, 'uno:room:ready', { code, ready: true })).ok, true);
    assert.equal((await emitAck(host, 'uno:room:start', { code })).ok, true);

    host.disconnect();
    guest.disconnect();
    sockets.length = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await pool.query('SELECT state FROM uno_room_snapshots WHERE id = 1');
      const saved = (state.rows[0]?.state as { rooms?: Array<{code:string;status:string;players:Array<{connected:boolean}>}> } | undefined)
        ?.rooms?.find(room => room.code === code);
      if (saved?.status === 'playing' && saved.players.every(player => !player.connected)) break;
      await delay(100);
    }
    await stopService(service);
    service = null;

    await delay(150);
    running = startService(databaseUrl!);
    service = running.child;
    getServiceLogs = running.logs;
    await waitForHealth(service, running.logs);

    const restoredHost = await connectSocket(hostToken);
    sockets.push(restoredHost);
    const restored = await emitAck(restoredHost, 'uno:room:reconnect', { code });
    assert.equal(restored.ok, true, JSON.stringify(restored.error));
    const restoredData = restored.data as Record<string, unknown>;
    const restoredRoom = restoredData.room as Record<string, unknown>;
    assert.equal(restoredRoom.status, 'playing');
    assert.equal((restoredData.hand as unknown[]).length, 7);
    assert.ok(restoredData.game);

    await pool.query('UPDATE users SET token_version = 1 WHERE id = $1', [guestId]);
    await assert.rejects(connectSocket(guestToken), /UNAUTHORIZED|websocket error|xhr poll error/i);
  } catch (error) {
    throw new Error(`${String(error)}\nUNO service logs:\n${getServiceLogs()}`);
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (service) await stopService(service);
    await pool.end();
  }
});
