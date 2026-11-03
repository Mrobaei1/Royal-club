import 'dotenv/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { verifyRoyalHs256Token } from './royal-token.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { registerUnoSockets } from './socket.js';
import { UnoRoomManager, type AuthenticatedPlayer } from './room-manager.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL is required to resolve the authenticated public username.');
function normalizeDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const mode = url.searchParams.get('sslmode')?.toLowerCase();
    if (mode && ['prefer', 'require', 'verify-ca'].includes(mode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return value;
  }
}
const pool = new Pool({ connectionString: normalizeDatabaseUrl(databaseUrl) });

// Room state is currently process-local. Hold a PostgreSQL session lock before
// loading snapshots so a second replica cannot overwrite newer room state.
const instanceLockClient = await pool.connect();
try {
  const lock = await instanceLockClient.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock(1380929364, 1) AS locked',
  );
  if (!lock.rows[0]?.locked) {
    throw new Error('A UNO instance is already running. Multiple replicas are disabled until distributed room transactions are implemented.');
  }
} catch (error) {
  instanceLockClient.release();
  await pool.end();
  throw error;
}
const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');

const roomManager = new UnoRoomManager();
await pool.query(`
  CREATE TABLE IF NOT EXISTS uno_room_snapshots (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    state JSONB NOT NULL DEFAULT '{"rooms":[]}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO uno_room_snapshots (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
`);
const savedRooms = await pool.query('SELECT state FROM uno_room_snapshots WHERE id = 1');
if (savedRooms.rows[0]?.state) roomManager.restoreSnapshot(savedRooms.rows[0].state);
// A process restart invalidates every old transport. Seats remain reserved, but
// must be marked offline until their authenticated clients reconnect.
roomManager.markAllPlayersDisconnected();
let roomWriteQueue: Promise<unknown> = Promise.resolve();
const persistRooms = (): Promise<void> => {
  const snapshot = JSON.stringify(roomManager.exportSnapshot());
  roomWriteQueue = roomWriteQueue.catch(() => undefined).then(() =>
    pool.query('UPDATE uno_room_snapshots SET state = $1::jsonb, updated_at = NOW() WHERE id = 1', [snapshot]),
  );
  return roomWriteQueue.then(() => {});
};
async function verifyRoyalToken(token: string): Promise<AuthenticatedPlayer> {
  const claims = verifyRoyalHs256Token(token, jwtSecret);
  const profile = await pool.query(
    'SELECT username, token_version FROM users WHERE id = $1 LIMIT 1', [claims.sub],
  );
  const row = profile.rows[0];
  const username = String(row?.username ?? '').trim();
  if (!username || username.length > 32) throw new Error('The account has no valid public username.');
  if (Number(row?.token_version) !== claims.ver) throw new Error('Token has been revoked.');
  return { id: claims.sub, username };
}
const app = Fastify({ logger: true, trustProxy: false, bodyLimit: 64 * 1024 });
const origins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
await app.register(helmet);
await app.register(cors, { origin: origins.length ? origins : false, credentials: true });
app.get('/health', async () => ({ ok: true, service: 'royal-club-uno', version: '0.1.0' }));
const io = new Server(app.server, {
  cors: { origin: origins.length ? origins : false, credentials: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 64 * 1024,
});
registerUnoSockets(io, verifyRoyalToken, roomManager, persistRooms);
const roomCleanupTimer = setInterval(() => {
  const removed = roomManager.cleanupExpiredRooms();
  if (removed > 0) {
    app.log.info({ removed }, 'Expired inactive UNO rooms');
    void persistRooms().catch(error => app.log.error(error, 'Failed to persist UNO room cleanup'));
  }
}, 60_000);
roomCleanupTimer.unref();
const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '0.0.0.0';
app.addHook('onClose', async () => {
  clearInterval(roomCleanupTimer);
  await roomWriteQueue.catch(error => app.log.error(error));
  try {
    await instanceLockClient.query('SELECT pg_advisory_unlock(1380929364, 1)');
  } finally {
    instanceLockClient.release();
    await pool.end();
  }
});
try {
  await app.listen({ port, host });
  app.log.info(`UNO standalone service listening on ${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
