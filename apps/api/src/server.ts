import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Pool } from 'pg';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

const app = Fastify({ logger: true, trustProxy: false });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await app.register(helmet);
await app.register(cors, {
  origin: [
    'https://super-duper-palm-tree-4r9v56pv6gcj7rw-8080.app.github.dev',
    'https://mrobaei1.github.io',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(jwt, { secret });

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS backgammon_matches (
    id BIGSERIAL PRIMARY KEY,
    room_code TEXT NOT NULL UNIQUE,
    host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    CHECK (guest_user_id IS NULL OR guest_user_id <> host_user_id)
  );
  CREATE INDEX IF NOT EXISTS backgammon_matches_waiting_idx ON backgammon_matches (created_at DESC) WHERE status = 'waiting';
  CREATE INDEX IF NOT EXISTS backgammon_matches_players_idx ON backgammon_matches (host_user_id, guest_user_id, status);
`);

app.get('/api/v1/health', async () => ({
  status: 'ok',
  service: 'royal-club-api',
  timestamp: new Date().toISOString(),
}));

app.get('/api/v1/health/db', async (_request, reply) => {
  try {
    await pool.query('SELECT 1');
    return { status: 'ok', database: 'connected' };
  } catch (error) {
    app.log.error({ err: error }, 'Database health check failed');
    return reply.code(503).send({ status: 'error', database: 'unavailable' });
  }
});

app.post<{ Body: { email?: string; password?: string; fullName?: string; phone?: string; country?: string } }>(
  '/api/v1/auth/register',
  { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const password = request.body?.password;
    const fullName = request.body?.fullName?.trim();
    const phone = request.body?.phone?.trim();
    const country = request.body?.country?.trim();

    if (!fullName || fullName.length > 120 || !phone || phone.length > 32 ||
        !/^[+0-9() .-]{6,32}$/.test(phone) || !country || country.length > 80 ||
        !email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== 'string' || password.length < 6 ||
        Buffer.byteLength(password, 'utf8') > 128) {
      return reply.code(400).send({
        error: 'Enter a name, valid phone, country, valid email, and a password of 6–128 bytes.'
      });
    }

    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    const passwordHash = `${salt.toString('hex')}:${derived.toString('hex')}`;

    try {
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, full_name, phone, country) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, phone, country, created_at',
        [email, passwordHash, fullName, phone, country]
      );
      const user = result.rows[0] as { id: string; email: string; full_name: string; phone: string; country: string; created_at: Date };
      const accessToken = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '1h' }
      );
      return reply.code(201).send({
        user: { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at },
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null &&
          'code' in error && error.code === '23505') {
        return reply.code(409).send({ error: 'An account with this email already exists.' });
      }
      request.log.error({ err: error }, 'Registration failed');
      return reply.code(500).send({ error: 'Could not create account.' });
    }
  }
);

app.post<{ Body: { email?: string; password?: string } }>(
  '/api/v1/auth/login',
  { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const password = request.body?.password;
    if (!email || typeof password !== 'string' || password.length > 128) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0] as
      | { id: string; email: string; password_hash: string }
      | undefined;

    let matches = false;
    if (user) {
      const [saltHex, hashHex] = user.password_hash.split(':');
      if (/^[0-9a-f]{32}$/.test(saltHex ?? '') &&
          /^[0-9a-f]{128}$/.test(hashHex ?? '')) {
        const candidate = await scrypt(password, Buffer.from(saltHex, 'hex'), 64) as Buffer;
        matches = timingSafeEqual(candidate, Buffer.from(hashHex, 'hex'));
      }
    }
    if (!matches || !user) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '1h' }
    );
    return {
      user: { id: user.id, email: user.email },
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600
    };
  }
);

app.get('/api/v1/me', {
  onRequest: [async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Authentication required.' });
    }
  }]
}, async (request, reply) => {
  const claims = request.user as { sub?: string };
  if (!claims.sub) return reply.code(401).send({ error: 'Invalid token.' });

  const result = await pool.query(
    'SELECT id, email, full_name, phone, country, created_at FROM users WHERE id = $1',
    [claims.sub]
  );
  if (!result.rowCount) return reply.code(401).send({ error: 'Account not found.' });
  const user = result.rows[0] as { id: string; email: string; created_at: Date };
  return { user: { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at } };
});

// Lobby API pairs two authenticated players. It does not accept client-supplied board state.
const requireMatchAuth = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const claims = request.user as { sub?: string };
    if (!claims.sub || !/^\d+$/.test(claims.sub)) return reply.code(401).send({ error: 'Invalid token.' });
  } catch {
    return reply.code(401).send({ error: 'Authentication required.' });
  }
};

app.get('/api/v1/matches/open', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status, m.created_at AS "createdAt", u.full_name AS "hostName"
       FROM backgammon_matches m JOIN users u ON u.id = m.host_user_id
      WHERE m.status = 'waiting' AND m.expires_at > NOW() AND m.host_user_id <> $1
      ORDER BY m.created_at ASC LIMIT 30`, [claims.sub]);
  return { matches: result.rows };
});

app.post('/api/v1/matches', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  for (let attempt = 0; attempt < 3; attempt++) {
    const roomCode = randomBytes(3).toString('hex').toUpperCase();
    try {
      const result = await pool.query(
        `INSERT INTO backgammon_matches (room_code, host_user_id) VALUES ($1, $2)
         RETURNING id, room_code AS "roomCode", status, created_at AS "createdAt", expires_at AS "expiresAt"
        , [roomCode, claims.sub]);
      return reply.code(201).send({ match: result.rows[0] });
    } catch (error: any) {
      if (error?.code !== '23505') {
        request.log.error({ err: error }, 'Could not create match');
        return reply.code(500).send({ error: 'Could not create match.' });
      }
    }
  }
  return reply.code(503).send({ error: 'Could not allocate a room code. Try again.' });
});

app.post<{ Params: { id: string } }>('/api/v1/matches/:id/join', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, room_code AS "roomCode", host_user_id, guest_user_id, status, expires_at AS "expiresAt"
         FROM backgammon_matches WHERE id = $1 FOR UPDATE`, [request.params.id]);
    const match = result.rows[0] as { id: string; host_user_id: string; guest_user_id: string | null; status: string; expiresAt: Date } | undefined;
    if (!match || new Date(match.expiresAt).getTime() <= Date.now() || !['waiting', 'active'].includes(match.status)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found or expired.' });
    }
    if (match.host_user_id === claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'You cannot join your own match.' });
    }
    if (match.guest_user_id && match.guest_user_id !== claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'This match is already full.' });
    }
    if (match.status === 'waiting') await client.query(
      `UPDATE backgammon_matches SET guest_user_id = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
      [claims.sub, match.id]);
    await client.query('COMMIT');
    const joined = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode", m.status, host.full_name AS "hostName",
              guest.full_name AS "guestName", m.created_at AS "createdAt"
         FROM backgammon_matches m JOIN users host ON host.id = m.host_user_id
         LEFT JOIN users guest ON guest.id = m.guest_user_id WHERE m.id = $1`, [match.id]);
    return { match: joined.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not join match');
    return reply.code(500).send({ error: 'Could not join match.' });
  } finally { client.release(); }
});

app.get<{ Params: { id: string } }>('/api/v1/matches/:id', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!/^\d+$/.test(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status, host.full_name AS "hostName",
            guest.full_name AS "guestName", m.created_at AS "createdAt", m.updated_at AS "updatedAt"
       FROM backgammon_matches m JOIN users host ON host.id = m.host_user_id
       LEFT JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.id = $1 AND (m.host_user_id = $2 OR m.guest_user_id = $2) AND m.expires_at > NOW()`,
    [request.params.id, claims.sub]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  return { match: result.rows[0] };
});
app.addHook('onClose', async () => { await pool.end(); });

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
