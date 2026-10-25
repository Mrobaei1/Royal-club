import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Pool } from 'pg';
import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isNumericId } from './validation.js';
import { applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';
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
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

  CREATE TABLE IF NOT EXISTS friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (requester_id <> addressee_id),
    UNIQUE (requester_id, addressee_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair_idx
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
  CREATE INDEX IF NOT EXISTS friendships_inbox_idx
    ON friendships (addressee_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS friendships_outbox_idx
    ON friendships (requester_id, status, created_at DESC);

  CREATE TABLE IF NOT EXISTS backgammon_matches (
    id BIGSERIAL PRIMARY KEY,
    room_code TEXT NOT NULL UNIQUE,
    host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
    board_state JSONB NOT NULL DEFAULT '[2,0,0,0,0,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2]'::jsonb,
    bar_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb,
    off_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb,
    current_turn_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    dice JSONB NOT NULL DEFAULT '[]'::jsonb,
    remaining_dice JSONB NOT NULL DEFAULT '[]'::jsonb,
    state_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    CHECK (guest_user_id IS NULL OR guest_user_id <> host_user_id)
  );
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS board_state JSONB NOT NULL DEFAULT '[2,0,0,0,0,-5,0,-3,0,0,0,5,-5,0,0,0,3,0,5,0,0,0,0,-2]'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS current_turn_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS bar_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS off_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS dice JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS remaining_dice JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS state_version INTEGER NOT NULL DEFAULT 0;
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
  const user = result.rows[0] as { id: string; email: string; full_name: string; phone: string; country: string; created_at: Date };
  return { user: { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at } };
});

const requireMatchAuth = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const claims = request.user as { sub?: string };
    if (!claims.sub || !isNumericId(claims.sub)) return reply.code(401).send({ error: 'Invalid token.' });
  } catch {
    return reply.code(401).send({ error: 'Authentication required.' });
  }
};

// Friend requests are server-owned and capped at 100 accepted friends per account.
app.get<{ Querystring: { email?: string } }>('/api/v1/users/search', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
  const claims = request.user as { sub: string };
  const email = request.query.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes('@')) return { users: [] };
  const result = await pool.query(
    'SELECT id, email, full_name AS "fullName" FROM users WHERE email = $1 AND id <> $2 LIMIT 1',
    [email, claims.sub],
  );
  return { users: result.rows };
});

app.get('/api/v1/friends', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT f.id, f.status, f.requester_id AS "requesterId",
            f.addressee_id AS "addresseeId", f.created_at AS "createdAt",
            requester.full_name AS "requesterName", requester.email AS "requesterEmail",
            addressee.full_name AS "addresseeName", addressee.email AS "addresseeEmail"
       FROM friendships f
       JOIN users requester ON requester.id = f.requester_id
       JOIN users addressee ON addressee.id = f.addressee_id
      WHERE (f.requester_id = $1 OR f.addressee_id = $1)
      ORDER BY f.created_at DESC
      LIMIT 300`,
    [claims.sub],
  );
  const rows = result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    direction: row.status === 'accepted' ? 'friend'
      : String(row.addresseeId) === claims.sub ? 'incoming' : 'outgoing',
    userId: String(row.requesterId) === claims.sub ? row.addresseeId : row.requesterId,
    name: String(row.requesterId) === claims.sub ? row.addresseeName : row.requesterName,
    email: String(row.requesterId) === claims.sub ? row.addresseeEmail : row.requesterEmail,
    createdAt: row.createdAt,
  }));
  return {
    friends: rows.filter((row) => row.status === 'accepted'),
    incomingRequests: rows.filter((row) => row.direction === 'incoming'),
    outgoingRequests: rows.filter((row) => row.direction === 'outgoing'),
  };
});

app.post<{ Params: { id: string } }>('/api/v1/friends/:id/request', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const targetId = request.params.id;
  if (!isNumericId(targetId)) return reply.code(400).send({ error: 'Invalid user id.' });
  if (targetId === claims.sub) return reply.code(400).send({ error: 'You cannot add yourself as a friend.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = await client.query(
      'SELECT id FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
      [[claims.sub, targetId]],
    );
    if (users.rowCount !== 2) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'User not found.' });
    }

    const existing = await client.query(
      `SELECT id, requester_id, addressee_id, status FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)
        FOR UPDATE`,
      [claims.sub, targetId],
    );
    const relation = existing.rows[0] as { id: string; requester_id: string; addressee_id: string; status: string } | undefined;
    if (relation?.status === 'accepted') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'You are already friends.' });
    }
    if (relation && relation.requester_id === targetId && relation.addressee_id === claims.sub) {
      const targetCount = await client.query(
        `SELECT COUNT(*)::int AS total FROM friendships
          WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
        [targetId],
      );
      const ownCount = await client.query(
        `SELECT COUNT(*)::int AS total FROM friendships
          WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
        [claims.sub],
      );
      if (Number(ownCount.rows[0]?.total ?? 0) >= 100 || Number(targetCount.rows[0]?.total ?? 0) >= 100) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'One account has reached the 100-friend limit.' });
      }
      await client.query(
        "UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1",
        [relation.id],
      );
      await client.query('COMMIT');
      return { status: 'accepted', message: 'Friend request accepted.' };
    }
    if (relation) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'A friend request is already pending.' });
    }

    const counts = await client.query(
      `SELECT id, (SELECT COUNT(*)::int FROM friendships f WHERE f.status = 'accepted' AND (f.requester_id = users.id OR f.addressee_id = users.id)) AS friend_count
         FROM users WHERE id = ANY($1::bigint[])`,
      [[claims.sub, targetId]],
    );
    if (counts.rows.some((row) => Number(row.friend_count) >= 100)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'One account has reached the 100-friend limit.' });
    }
    await client.query(
      'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)',
      [claims.sub, targetId],
    );
    await client.query('COMMIT');
    return reply.code(201).send({ status: 'pending', message: 'Friend request sent.' });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error?.code === '23505') return reply.code(409).send({ error: 'A friend request already exists.' });
    request.log.error({ err: error }, 'Could not create friend request');
    return reply.code(500).send({ error: 'Could not send friend request.' });
  } finally {
    client.release();
  }
});

app.post<{ Params: { id: string } }>('/api/v1/friends/:id/accept', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const requesterId = request.params.id;
  if (!isNumericId(requesterId)) return reply.code(400).send({ error: 'Invalid user id.' });
  if (requesterId === claims.sub) return reply.code(400).send({ error: 'Invalid friend request.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [[claims.sub, requesterId]]);
    const result = await client.query(
      `SELECT id FROM friendships
        WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'
        FOR UPDATE`,
      [requesterId, claims.sub],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Incoming friend request not found.' });
    }
    const counts = await client.query(
      `SELECT id, (SELECT COUNT(*)::int FROM friendships f WHERE f.status = 'accepted' AND (f.requester_id = users.id OR f.addressee_id = users.id)) AS friend_count
         FROM users WHERE id = ANY($1::bigint[])`,
      [[claims.sub, requesterId]],
    );
    if (counts.rows.length !== 2) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'User not found.' });
    }
    if (counts.rows.some((row) => Number(row.friend_count) >= 100)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'One account has reached the 100-friend limit.' });
    }
    await client.query("UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = $1", [result.rows[0].id]);
    await client.query('COMMIT');
    return { status: 'accepted', message: 'Friend request accepted.' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not accept friend request');
    return reply.code(500).send({ error: 'Could not accept friend request.' });
  } finally {
    client.release();
  }
});

app.delete<{ Params: { id: string } }>('/api/v1/friends/:id', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const targetId = request.params.id;
  if (!isNumericId(targetId)) return reply.code(400).send({ error: 'Invalid user id.' });
  const result = await pool.query(
    'DELETE FROM friendships WHERE ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)) RETURNING id',
    [claims.sub, targetId],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Friendship or request not found.' });
  return { status: 'removed' };
});

// Lobby API pairs two authenticated players. It does not accept client-supplied board state.


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
         RETURNING id, room_code AS "roomCode", status, created_at AS "createdAt", expires_at AS "expiresAt"`, [roomCode, claims.sub]);
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
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
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
      `UPDATE backgammon_matches SET guest_user_id = $1, status = 'active',
              current_turn_user_id = host_user_id, dice = '[]'::jsonb,
              remaining_dice = '[]'::jsonb, state_version = 0, updated_at = NOW()
         WHERE id = $2`,
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
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
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

// Apply a sequence of die-sized moves atomically. Any invalid step rolls back the entire sequence.
app.post<{ Params: { id: string }; Body: { moves: Array<{ from: number | null; to: number | null; die: number }>; expectedVersion: number } }>('/api/v1/matches/:id/moves/batch', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const body = request.body;
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  if (!body || !Array.isArray(body.moves) || body.moves.length < 1 || body.moves.length > 4 ||
      !Number.isInteger(body.expectedVersion)) {
    return reply.code(400).send({ error: 'Provide 1–4 moves and a valid expectedVersion.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, host_user_id, guest_user_id, current_turn_user_id,
              board_state, bar_state, off_state, dice, remaining_dice, state_version
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const game = result.rows[0] as {
      id: string; status: string; host_user_id: string; guest_user_id: string | null;
      current_turn_user_id: string | null; board_state: number[];
      bar_state: { host: number; guest: number }; off_state: { host: number; guest: number };
      dice: number[]; remaining_dice: number[]; state_version: number;
    } | undefined;
    if (!game || ![game.host_user_id, game.guest_user_id].includes(claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found.' });
    }
    if (game.status !== 'active' || !game.guest_user_id) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'The match is not active.' });
    }
    if (game.current_turn_user_id !== claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'It is not your turn.' });
    }
    if (game.state_version !== body.expectedVersion) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Game state changed. Refresh the board and try again.' });
    }
    if (!Array.isArray(game.remaining_dice)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'No usable dice are available.' });
    }

    const hostTurn = game.current_turn_user_id === game.host_user_id;
    let simulated = {
      board: [...game.board_state],
      bar: { host: Number(game.bar_state?.host ?? 0), guest: Number(game.bar_state?.guest ?? 0) },
      off: { host: Number(game.off_state?.host ?? 0), guest: Number(game.off_state?.guest ?? 0) },
    };
    const remaining = [...game.remaining_dice];
    for (let moveIndex = 0; moveIndex < body.moves.length; moveIndex++) {
      const move = body.moves[moveIndex];
      if (simulated.off.host >= 15 || simulated.off.guest >= 15) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'The game has already ended within this move sequence.' });
      }
      if (!move || !Number.isInteger(move.die) || !remaining.includes(move.die)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'A selected die is invalid or has already been used in this sequence.' });
      }
      if (mustPlayHigherDie(simulated, remaining, move, hostTurn)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'You must play the higher die first when the lower die would prevent it.' });
      }
      const applied = applyBackgammonMove(simulated, move, hostTurn);
      if ('error' in applied) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: applied.error, rejectedMove: body.moves.indexOf(move) + 1 });
      }
      const remainingAfterMove = [...remaining];
      remainingAfterMove.splice(remainingAfterMove.indexOf(move.die), 1);
      const maxBefore = maxPlayableDiceCount(simulated, remaining, hostTurn);
      const maxAfter = maxPlayableDiceCount(applied.state, remainingAfterMove, hostTurn);
      if (maxAfter < maxBefore - 1) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Choose a move sequence that uses the maximum number of dice.' });
      }
      simulated = applied.state;
      remaining.splice(remaining.indexOf(move.die), 1);
      if ((simulated.off.host >= 15 || simulated.off.guest >= 15) &&
          moveIndex !== body.moves.length - 1) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'No moves are allowed after a player wins.' });
      }
    }

    const turnComplete = remaining.length === 0;
    const nextTurn = turnComplete
      ? (hostTurn ? game.guest_user_id : game.host_user_id)
      : game.current_turn_user_id;
    const nextDice = turnComplete ? [] : game.dice;
    const nextRemaining = turnComplete ? [] : remaining;
    const finished = simulated.off.host >= 15 || simulated.off.guest >= 15;
    const updated = await client.query(
      `UPDATE backgammon_matches SET board_state = $1::jsonb, bar_state = $2::jsonb,
              off_state = $3::jsonb, current_turn_user_id = $4, dice = $5::jsonb,
              remaining_dice = $6::jsonb, status = $7,
              state_version = state_version + 1, updated_at = NOW()
         WHERE id = $8
         RETURNING id, status, board_state AS board, bar_state AS bar, off_state AS off,
                   current_turn_user_id AS "currentTurnUserId", dice,
                   remaining_dice AS "remainingDice", state_version AS version`,
      [JSON.stringify(simulated.board), JSON.stringify(simulated.bar), JSON.stringify(simulated.off),
       nextTurn, JSON.stringify(nextDice), JSON.stringify(nextRemaining),
       finished ? 'finished' : 'active', game.id]);
    await client.query('COMMIT');
    return { state: updated.rows[0], appliedMoves: body.moves.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not apply move sequence');
    return reply.code(500).send({ error: 'Could not apply move sequence.' });
  } finally {
    client.release();
  }
});

// Apply one die-sized move under a row lock; the client never submits a replacement board.
app.post<{ Params: { id: string }; Body: { from: number | null; to: number | null; die: number; expectedVersion: number } }>('/api/v1/matches/:id/moves', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const body = request.body;
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  if (!body || !Number.isInteger(body.die) || body.die < 1 || body.die > 6 ||
      !Number.isInteger(body.expectedVersion) ||
      (body.from !== null && (!Number.isInteger(body.from) || body.from < 0 || body.from > 23)) ||
      (body.to !== null && (!Number.isInteger(body.to) || body.to < 0 || body.to > 23)) ||
      (body.from === null && body.to === null)) {
    return reply.code(400).send({ error: 'Invalid move format.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, host_user_id, guest_user_id, current_turn_user_id,
              board_state, bar_state, off_state, dice, remaining_dice, state_version
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const game = result.rows[0] as {
      id: string; status: string; host_user_id: string; guest_user_id: string | null;
      current_turn_user_id: string | null; board_state: number[];
      bar_state: { host: number; guest: number }; off_state: { host: number; guest: number };
      dice: number[]; remaining_dice: number[]; state_version: number;
    } | undefined;
    if (!game || ![game.host_user_id, game.guest_user_id].includes(claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found.' });
    }
    if (game.status !== 'active' || !game.guest_user_id) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'The match is not active.' });
    }
    if (game.current_turn_user_id !== claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'It is not your turn.' });
    }
    if (game.state_version !== body.expectedVersion) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Game state changed. Refresh the board and try again.' });
    }
    if (!Array.isArray(game.remaining_dice) || !game.remaining_dice.includes(body.die)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'That die is not available for this turn.' });
    }

    const hostTurn = game.current_turn_user_id === game.host_user_id;
    const moveState = {
      board: [...game.board_state],
      bar: { host: Number(game.bar_state?.host ?? 0), guest: Number(game.bar_state?.guest ?? 0) },
      off: { host: Number(game.off_state?.host ?? 0), guest: Number(game.off_state?.guest ?? 0) },
    };
    if (mustPlayHigherDie(moveState, game.remaining_dice, body, hostTurn)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'You must play the higher die first when the lower die would prevent it.' });
    }
    const sign = hostTurn ? 1 : -1;
    const bar = { host: Number(game.bar_state?.host ?? 0), guest: Number(game.bar_state?.guest ?? 0) };
    const off = { host: Number(game.off_state?.host ?? 0), guest: Number(game.off_state?.guest ?? 0) };
    const board = [...game.board_state];
    const ownBar = hostTurn ? 'host' : 'guest';
    const otherBar = hostTurn ? 'guest' : 'host';
    let target = -1;

    if (bar[ownBar] > 0) {
      if (body.from !== null || body.to === null) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'A checker on the bar must enter before other checkers can move.' });
      }
      target = hostTurn ? 24 - body.die : body.die - 1;
      if (body.to !== target) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Invalid bar-entry point for that die.' });
      }
    } else {
      if (body.from === null) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'No checker is available on the bar.' });
      }
      if (board[body.from] * sign <= 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Select one of your own checkers.' });
      }
      const rawTarget = hostTurn ? body.from - body.die : body.from + body.die;
      if (body.to === null) {
        const inHome = hostTurn ? body.from <= 5 : body.from >= 18;
        const allHome = board.every((count, point) => hostTurn
          ? point <= 5 || count <= 0
          : point >= 18 || count >= 0);
        const overshootClear = hostTurn
          ? !board.some((count, point) => point > body.from! && point <= 5 && count > 0)
          : !board.some((count, point) => point < body.from! && point >= 18 && count < 0);
        const distanceToOff = hostTurn ? body.from + 1 : 24 - body.from;
        const overshootsDie = body.die > distanceToOff;
        if (!inHome || !allHome || body.die < distanceToOff || (overshootsDie && !overshootClear)) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'That checker cannot bear off with this die.' });
        }
        off[ownBar] += 1;
      } else {
        if (rawTarget < 0 || rawTarget > 23 || body.to !== rawTarget) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'Move distance does not match the selected die.' });
        }
        target = rawTarget;
        if (board[target] * sign <= -2) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'That point is blocked by the opponent.' });
        }
        board[body.from] -= sign;
        if (board[target] * sign < 0) {
          board[target] = 0;
          bar[otherBar] += 1;
        }
        board[target] += sign;
      }
      if (body.to === null) board[body.from] -= sign;
    }

    if (body.from === null) {
      bar[ownBar] -= 1;
      if (board[target] * sign <= -2) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'That entry point is blocked by the opponent.' });
      }
      if (board[target] * sign < 0) {
        board[target] = 0;
        bar[otherBar] += 1;
      }
      board[target] += sign;
    }

    const remaining = [...game.remaining_dice];
    remaining.splice(remaining.indexOf(body.die), 1);
    const maxBefore = maxPlayableDiceCount(moveState, game.remaining_dice, hostTurn);
    const maxAfter = maxPlayableDiceCount({ board, bar, off }, remaining, hostTurn);
    if (maxAfter < maxBefore - 1) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Choose a move that preserves the maximum number of playable dice.' });
    }
    const turnComplete = remaining.length === 0;
    const nextTurn = turnComplete
      ? (hostTurn ? game.guest_user_id : game.host_user_id)
      : game.current_turn_user_id;
    const nextDice = turnComplete ? [] : game.dice;
    const nextRemaining = turnComplete ? [] : remaining;
    const finished = off.host >= 15 || off.guest >= 15;
    const updated = await client.query(
      `UPDATE backgammon_matches SET board_state = $1::jsonb, bar_state = $2::jsonb,
              off_state = $3::jsonb, current_turn_user_id = $4, dice = $5::jsonb,
              remaining_dice = $6::jsonb, status = $7,
              state_version = state_version + 1, updated_at = NOW()
         WHERE id = $8
         RETURNING id, status, board_state AS board, bar_state AS bar, off_state AS off,
                   current_turn_user_id AS "currentTurnUserId", dice,
                   remaining_dice AS "remainingDice", state_version AS version`,
      [JSON.stringify(board), JSON.stringify(bar), JSON.stringify(off), nextTurn,
       JSON.stringify(nextDice), JSON.stringify(nextRemaining), finished ? 'finished' : 'active', game.id]);
    await client.query('COMMIT');
    return { state: updated.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not apply move');
    return reply.code(500).send({ error: 'Could not apply move.' });
  } finally {
    client.release();
  }
});

// A player may end early only when no remaining die has any legal move.
app.post<{ Params: { id: string }; Body: { expectedVersion: number } }>('/api/v1/matches/:id/end-turn', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id) || !Number.isInteger(request.body?.expectedVersion)) {
    return reply.code(400).send({ error: 'Invalid end-turn request.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, host_user_id, guest_user_id, current_turn_user_id,
              board_state, bar_state, remaining_dice, state_version
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const game = result.rows[0] as {
      id: string; status: string; host_user_id: string; guest_user_id: string | null;
      current_turn_user_id: string | null; board_state: number[];
      bar_state: { host: number; guest: number }; remaining_dice: number[]; state_version: number;
    } | undefined;
    if (!game || ![game.host_user_id, game.guest_user_id].includes(claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found.' });
    }
    if (game.status !== 'active' || game.current_turn_user_id !== claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'It is not your active turn.' });
    }
    if (game.state_version !== request.body.expectedVersion) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Game state changed. Refresh the board and try again.' });
    }
    const remaining = Array.isArray(game.remaining_dice) ? game.remaining_dice : [];
    if (remaining.length === 0) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'There are no remaining dice to end.' });
    }
    const hostTurn = game.current_turn_user_id === game.host_user_id;
    const canMove = hasLegalMove(
      game.board_state,
      game.bar_state,
      remaining,
      hostTurn,
    );
    if (canMove) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'A legal move remains; play it before ending the turn.' });
    }
    const nextTurn = hostTurn ? game.guest_user_id : game.host_user_id;
    const updated = await client.query(
      `UPDATE backgammon_matches SET current_turn_user_id = $1, dice = '[]'::jsonb,
              remaining_dice = '[]'::jsonb, state_version = state_version + 1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, status, state_version AS version, current_turn_user_id AS "currentTurnUserId"`,
      [nextTurn, game.id]);
    await client.query('COMMIT');
    return { state: updated.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not end turn');
    return reply.code(500).send({ error: 'Could not end turn.' });
  } finally {
    client.release();
  }
});

// Server-owned game snapshot. Clients can read state but cannot submit a replacement board.
app.get<{ Params: { id: string } }>('/api/v1/matches/:id/state', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const result = await pool.query(
    `SELECT id, status, board_state AS board, bar_state AS bar, off_state AS off,
            current_turn_user_id AS "currentTurnUserId",
            current_turn_user_id = $2::bigint AS "isMyTurn",
            host_user_id = $2::bigint AS "isHost",
            dice, remaining_dice AS "remainingDice", state_version AS version, updated_at AS "updatedAt"
       FROM backgammon_matches
      WHERE id = $1 AND (host_user_id = $2 OR guest_user_id = $2) AND expires_at > NOW()`,
    [request.params.id, claims.sub]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  if (!['active', 'finished'].includes(result.rows[0].status)) return reply.code(409).send({ error: 'The match is not active yet.' });
  return { state: result.rows[0] };
});

// Dice are generated by the API, and a row lock makes competing rolls deterministic.
app.post<{ Params: { id: string }; Body: { expectedVersion?: number } }>('/api/v1/matches/:id/roll', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, status, host_user_id, guest_user_id, current_turn_user_id,
              dice, remaining_dice, state_version
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const match = result.rows[0] as { id: string; status: string; host_user_id: string; guest_user_id: string | null; current_turn_user_id: string | null; dice: number[]; remaining_dice: number[]; state_version: number } | undefined;
    if (!match || ![match.host_user_id, match.guest_user_id].includes(claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found.' });
    }
    if (match.status !== 'active' || !match.guest_user_id) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'The match is not active.' });
    }
    if (match.current_turn_user_id !== claims.sub) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'It is not your turn.' });
    }
    if (Array.isArray(match.dice) && match.dice.length > 0) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Dice have already been rolled for this turn.' });
    }
    if (request.body?.expectedVersion !== undefined && request.body.expectedVersion !== match.state_version) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Game state changed. Refresh the board and try again.' });
    }
    const first = randomInt(1, 7);
    const second = randomInt(1, 7);
    const dice = [first, second];
    const remainingDice = first === second ? [first, first, first, first] : dice;
    const updated = await client.query(
      `UPDATE backgammon_matches SET dice = $1::jsonb, remaining_dice = $2::jsonb,
              state_version = state_version + 1, updated_at = NOW()
         WHERE id = $3
         RETURNING id, dice, remaining_dice AS "remainingDice",
                   state_version AS version, current_turn_user_id AS "currentTurnUserId"`,
      [JSON.stringify(dice), JSON.stringify(remainingDice), match.id]);
    await client.query('COMMIT');
    return { state: updated.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not roll dice');
    return reply.code(500).send({ error: 'Could not roll dice.' });
  } finally {
    client.release();
  }
});

app.delete<{ Params: { id: string } }>('/api/v1/matches/:id', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const result = await pool.query(
    `UPDATE backgammon_matches SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND host_user_id = $2 AND status = 'waiting'
      RETURNING id, room_code AS "roomCode", status`,
    [request.params.id, claims.sub]);
  if (result.rowCount) return { match: result.rows[0] };
  const existing = await pool.query(
    `SELECT status FROM backgammon_matches WHERE id = $1 AND host_user_id = $2`,
    [request.params.id, claims.sub]);
  if (!existing.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  return reply.code(409).send({ error: 'Only a waiting match can be cancelled.' });
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
