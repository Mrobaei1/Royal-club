import 'dotenv/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { verifyRoyalHs256Token } from './royal-token.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { Pool } from 'pg';
import { createTurnCredentials } from './turn-credentials.js';
import { Server } from 'socket.io';
import { registerUnoSockets } from './socket.js';
import type { AuthenticatedPlayer } from './room-manager.js';

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
const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
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
app.get('/ice-config', async (request, reply) => {
  const authorization = request.headers.authorization ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  let player: AuthenticatedPlayer;
  try {
    player = await verifyRoyalToken(authorization.slice(7));
  } catch {
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  const iceServers: Array<Record<string, string>> = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  const turnUrl = process.env.TURN_URL?.trim() ?? '';
  const turnSecret = process.env.TURN_SHARED_SECRET ?? '';
  if (turnUrl && !turnSecret) {
    return reply.code(503).send({ error: 'TURN_NOT_CONFIGURED' });
  }
  if (turnUrl && turnSecret) {
    const ttl = Number(process.env.TURN_TTL_SECONDS ?? 3600);
    const credentials = createTurnCredentials(player.id, turnSecret, ttl);
    iceServers.push({
      urls: turnUrl,
      username: credentials.username,
      credential: credentials.credential,
    });
  }
  return { iceServers };
});
const io = new Server(app.server, {
  cors: { origin: origins.length ? origins : false, credentials: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 64 * 1024,
});
registerUnoSockets(io, verifyRoyalToken);
const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '0.0.0.0';
app.addHook('onClose', async () => { await pool.end(); });
try {
  await app.listen({ port, host });
  app.log.info(`UNO standalone service listening on ${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
