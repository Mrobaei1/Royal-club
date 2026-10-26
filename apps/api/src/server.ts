import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Pool, type PoolClient } from 'pg';
import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isNumericId, isValidRegistrationPassword } from './validation.js';
import { getAllowedCorsOrigins } from './cors-config.js';
import { INITIAL_BACKGAMMON_BOARD, applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';
import { calculateEloRatings } from './backgammon-rating.js';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

const app = Fastify({ logger: true, trustProxy: false });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await app.register(helmet);
const configuredCorsOrigins = process.env.CORS_ORIGINS;
const allowedOrigins = getAllowedCorsOrigins({
  nodeEnv: process.env.NODE_ENV,
  corsOrigins: configuredCorsOrigins,
});

await app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
await app.register(jwt, { secret });

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    avatar_data_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
  UPDATE users SET username = 'p' || id::text WHERE username IS NULL OR username = '';
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (LOWER(username)) WHERE username IS NOT NULL;
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

  CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'system')),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS notifications_inbox_idx
    ON notifications (user_id, read_at, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    CHECK (reporter_id <> reported_user_id)
  );
  CREATE INDEX IF NOT EXISTS user_reports_target_time_idx
    ON user_reports (reported_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS user_reports_status_time_idx
    ON user_reports (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS wallet_accounts (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount <> 0),
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    type TEXT NOT NULL CHECK (type IN ('admin_credit', 'subscription_purchase', 'adjustment')),
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx
    ON wallet_transactions (user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    price_credits BIGINT NOT NULL CHECK (price_credits >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO subscription_plans (code, name, duration_days, price_credits)
  VALUES ('vip_monthly', 'اشتراک ویژه یک‌ماهه', 30, 300)
  ON CONFLICT (code) DO NOTHING;
  CREATE TABLE IF NOT EXISTS user_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id BIGINT NOT NULL REFERENCES subscription_plans(id),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS user_subscriptions_current_idx
    ON user_subscriptions (user_id, status, ends_at DESC);
  CREATE TABLE IF NOT EXISTS private_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    CHECK (sender_id <> recipient_id)
  );
  CREATE INDEX IF NOT EXISTS private_messages_thread_idx
    ON private_messages (sender_id, recipient_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS private_messages_inbox_idx
    ON private_messages (recipient_id, read_at, created_at DESC);

  CREATE TABLE IF NOT EXISTS backgammon_matches (
    id BIGSERIAL PRIMARY KEY,
    room_code TEXT NOT NULL UNIQUE,
    host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
    board_state JSONB NOT NULL DEFAULT '${JSON.stringify(INITIAL_BACKGAMMON_BOARD)}'::jsonb,
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
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS board_state JSONB NOT NULL DEFAULT '${JSON.stringify(INITIAL_BACKGAMMON_BOARD)}'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS current_turn_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS bar_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS off_state JSONB NOT NULL DEFAULT '{"host":0,"guest":0}'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS dice JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS remaining_dice JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS state_version INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE backgammon_matches ALTER COLUMN board_state SET DEFAULT '${JSON.stringify(INITIAL_BACKGAMMON_BOARD)}'::jsonb;
  CREATE INDEX IF NOT EXISTS backgammon_matches_waiting_idx ON backgammon_matches (created_at DESC) WHERE status = 'waiting';
  CREATE INDEX IF NOT EXISTS backgammon_matches_players_idx ON backgammon_matches (host_user_id, guest_user_id, status);
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS match_to_win INTEGER NOT NULL DEFAULT 1 CHECK (match_to_win IN (1, 3, 5));
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS host_settings_accepted BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS guest_settings_accepted BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS host_ready BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS guest_ready BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS host_game_wins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS guest_game_wins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS cancellation_proposed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS cancellation_accepted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
  CREATE TABLE IF NOT EXISTS backgammon_match_invites (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES backgammon_matches(id) ON DELETE CASCADE,
    inviter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CHECK (inviter_id <> invitee_id)
  );
  CREATE INDEX IF NOT EXISTS backgammon_match_invites_inbox_idx
    ON backgammon_match_invites (invitee_id, status, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS backgammon_match_invites_pending_pair_idx
    ON backgammon_match_invites (match_id, invitee_id) WHERE status = 'pending';
  CREATE TABLE IF NOT EXISTS backgammon_player_stats (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS backgammon_player_stats_leaderboard_idx
    ON backgammon_player_stats (rating DESC, wins DESC, games_played ASC);
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
        !isValidRegistrationPassword(password)) {
      return reply.code(400).send({
        error: 'Enter a name, valid phone, country, valid email, and a password of at least 6 characters (maximum 128 UTF-8 bytes).'
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
      const created = result.rows[0] as { id: string; email: string; full_name: string; phone: string; country: string; created_at: Date };
      const profile = await pool.query(
        'UPDATE users SET username = $1 WHERE id = $2 RETURNING username',
        [`p${created.id}${randomInt(1000, 9999)}`, created.id],
      );
      const user = { ...created, username: profile.rows[0]?.username ?? null };
      const accessToken = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: '1h' }
      );
      return reply.code(201).send({
        user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at },
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
    'SELECT id, username, email, full_name, phone, country, avatar_data_url, created_at FROM users WHERE id = $1',
    [claims.sub]
  );
  if (!result.rowCount) return reply.code(401).send({ error: 'Account not found.' });
  const user = result.rows[0] as { id: string; username: string | null; email: string; full_name: string; phone: string; country: string; avatar_data_url: string | null; created_at: Date };
  return { user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, avatarDataUrl: user.avatar_data_url ?? null, createdAt: user.created_at } };
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

async function updateBackgammonRatings(client: PoolClient, winnerUserId: string, loserUserId: string) {
  const orderedIds = [winnerUserId, loserUserId].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  await client.query(
    'INSERT INTO backgammon_player_stats (user_id) VALUES ($1), ($2) ON CONFLICT (user_id) DO NOTHING',
    orderedIds,
  );
  const result = await client.query(
    `SELECT user_id, rating, games_played, wins, losses
       FROM backgammon_player_stats
      WHERE user_id = ANY($1::bigint[])
      ORDER BY user_id
      FOR UPDATE`,
    [orderedIds],
  );
  const stats = new Map(result.rows.map((row) => [String(row.user_id), row]));
  const winner = stats.get(winnerUserId);
  const loser = stats.get(loserUserId);
  if (!winner || !loser) throw new Error('Could not lock both player rating rows.');
  const next = calculateEloRatings(Number(winner.rating), Number(loser.rating));
  await client.query(
    `UPDATE backgammon_player_stats
        SET rating = $1, games_played = games_played + 1, wins = wins + 1, updated_at = NOW()
      WHERE user_id = $2`,
    [next.winnerRating, winnerUserId],
  );
  await client.query(
    `UPDATE backgammon_player_stats
        SET rating = $1, games_played = games_played + 1, losses = losses + 1, updated_at = NOW()
      WHERE user_id = $2`,
    [next.loserRating, loserUserId],
  );
}

app.patch<{ Body: { fullName?: string; phone?: string; country?: string } }>('/api/v1/me/profile', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const fullName = typeof request.body?.fullName === 'string' ? request.body.fullName.trim() : '';
  const phone = typeof request.body?.phone === 'string' ? request.body.phone.trim() : '';
  const country = typeof request.body?.country === 'string' ? request.body.country.trim() : '';
  if (!fullName || fullName.length > 120 || !phone || !/^[+0-9() .-]{6,32}$/.test(phone) || !country || country.length > 80) {
    return reply.code(400).send({ error: 'نام، شماره تلفن معتبر و کشور را وارد کنید.' });
  }
  const result = await pool.query(
    'UPDATE users SET full_name = $1, phone = $2, country = $3 WHERE id = $4 RETURNING id, username, email, full_name AS "fullName", phone, country',
    [fullName, phone, country, claims.sub],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Account not found.' });
  return { user: result.rows[0] };
});

app.patch<{ Body: { avatarDataUrl?: string | null } }>('/api/v1/me/avatar', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const avatar = request.body?.avatarDataUrl;
  if (avatar !== null && (typeof avatar !== 'string' ||
      avatar.length > 900_000 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))) {
    return reply.code(400).send({ error: 'تصویر باید JPG یا PNG یا WebP و کمتر از 650 کیلوبایت باشد.' });
  }
  const result = await pool.query(
    'UPDATE users SET avatar_data_url = $1 WHERE id = $2 RETURNING avatar_data_url',
    [avatar ?? null, claims.sub],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Account not found.' });
  return { avatarDataUrl: result.rows[0].avatar_data_url ?? null };
});

app.patch<{ Body: { username?: string } }>('/api/v1/me/username', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const username = typeof request.body?.username === 'string' ? request.body.username.trim().replace(/^@/, '') : '';
  if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username)) {
    return reply.code(400).send({ error: 'نام کاربری باید ۳ تا ۲۴ حرف و فقط شامل حروف انگلیسی، عدد، نقطه یا زیرخط باشد.' });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username',
      [username, claims.sub],
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Account not found.' });
    return { user: result.rows[0] };
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.code(409).send({ error: 'این نام کاربری قبلاً انتخاب شده است.' });
    }
    request.log.error({ err: error }, 'Could not update username');
    return reply.code(500).send({ error: 'Could not update username.' });
  }
});

// Wallet balances are server-owned; credits are non-transferable and every change is ledgered.
app.get('/api/v1/wallet', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  await pool.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [claims.sub]);
  const [account, history] = await Promise.all([
    pool.query('SELECT balance, updated_at AS "updatedAt" FROM wallet_accounts WHERE user_id = $1', [claims.sub]),
    pool.query('SELECT id, amount, balance_after AS "balanceAfter", type, description, created_at AS "createdAt" FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [claims.sub]),
  ]);
  return { balance: Number(account.rows[0]?.balance ?? 0), updatedAt: account.rows[0]?.updatedAt ?? null, transactions: history.rows };
});

app.get('/api/v1/subscriptions/plans', { onRequest: [requireMatchAuth] }, async () => {
  const result = await pool.query('SELECT code, name, duration_days AS "durationDays", price_credits AS "priceCredits" FROM subscription_plans WHERE active = TRUE ORDER BY price_credits ASC');
  return { plans: result.rows };
});

app.get('/api/v1/subscriptions/me', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT s.id, p.code AS "planCode", p.name AS "planName", s.starts_at AS "startsAt",
            s.ends_at AS "endsAt", s.status
       FROM user_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > NOW()
      ORDER BY s.ends_at DESC LIMIT 1`,
    [claims.sub],
  );
  return { subscription: result.rows[0] ?? null };
});

app.post<{ Body: { planCode?: string } }>('/api/v1/subscriptions/activate', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const code = request.body?.planCode;
  if (typeof code !== 'string' || !/^[a-z0-9_]{2,40}$/.test(code)) {
    return reply.code(400).send({ error: 'Invalid subscription plan.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planResult = await client.query(
      'SELECT id, name, duration_days, price_credits FROM subscription_plans WHERE code = $1 AND active = TRUE FOR SHARE',
      [code],
    );
    const plan = planResult.rows[0] as { id: string; name: string; duration_days: number; price_credits: string } | undefined;
    if (!plan) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Subscription plan not found.' });
    }
    await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [claims.sub]);
    const accountResult = await client.query('SELECT balance FROM wallet_accounts WHERE user_id = $1 FOR UPDATE', [claims.sub]);
    const balance = Number(accountResult.rows[0]?.balance ?? 0);
    const price = Number(plan.price_credits);
    if (balance < price) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Insufficient wallet credits.', required: price, balance });
    }
    const active = await client.query(
      `SELECT ends_at FROM user_subscriptions
        WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()
        ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`,
      [claims.sub],
    );
    const startsAt = active.rows[0]?.ends_at ?? new Date();
    const endsAt = new Date(new Date(startsAt).getTime() + Number(plan.duration_days) * 86400000);
    const debit = await client.query(
      'UPDATE wallet_accounts SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 RETURNING balance',
      [price, claims.sub],
    );
    await client.query(
      'INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description) VALUES ($1, $2, $3, $4, $5)',
      [claims.sub, -price, debit.rows[0].balance, 'subscription_purchase', plan.name],
    );
    await client.query(
      `UPDATE user_subscriptions SET status = 'expired'
        WHERE user_id = $1 AND status = 'active' AND ends_at <= NOW()`,
      [claims.sub],
    );
    const subscription = await client.query(
      `INSERT INTO user_subscriptions (user_id, plan_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, starts_at AS "startsAt", ends_at AS "endsAt", status`,
      [claims.sub, plan.id, startsAt, endsAt],
    );
    await client.query('COMMIT');
    return { subscription: { ...subscription.rows[0], planCode: code, planName: plan.name }, walletBalance: Number(debit.rows[0].balance) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not activate subscription');
    return reply.code(500).send({ error: 'Could not activate subscription.' });
  } finally {
    client.release();
  }
});

app.get('/api/v1/admin/status', { onRequest: [requireMatchAuth] }, async (request) => {
  const ownerUserId = process.env.OWNER_USER_ID?.trim();
  const claims = request.user as { sub?: string };
  return { isOwner: Boolean(ownerUserId && isNumericId(ownerUserId) && claims.sub === ownerUserId) };
});

// Only the explicitly configured owner user ID may administer credits and subscription pricing.
const requireOwnerAuth = async (request: any, reply: any) => {
  await requireMatchAuth(request, reply);
  if (reply.sent) return;
  const ownerUserId = process.env.OWNER_USER_ID?.trim();
  const claims = request.user as { sub?: string };
  if (!ownerUserId || !isNumericId(ownerUserId) || claims.sub !== ownerUserId) {
    return reply.code(403).send({ error: 'Owner access is not configured or is not permitted.' });
  }
};

app.get<{ Params: { userId: string } }>('/api/v1/admin/users/:userId/profile', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { userId } = request.params;
  if (!isNumericId(userId)) return reply.code(400).send({ error: 'Invalid user ID.' });
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.full_name AS "fullName",
            u.phone, u.country, u.created_at AS "createdAt",
            COALESCE(w.balance, 0)::text AS "walletBalance"
       FROM users u
       LEFT JOIN wallet_accounts w ON w.user_id = u.id
      WHERE u.id = $1 LIMIT 1`,
    [userId],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'User not found.' });
  return { user: result.rows[0] };
});

app.post<{ Body: { userId?: string; amount?: number; description?: string } }>('/api/v1/admin/wallet/credit', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { userId, amount, description } = request.body ?? {};
  if (!isNumericId(userId) || !Number.isSafeInteger(amount) || Number(amount) <= 0 || Number(amount) > 1000000000 ||
      (description !== undefined && (typeof description !== 'string' || description.length > 200))) {
    return reply.code(400).send({ error: 'Provide a valid userId, positive credit amount, and short description.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!user.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'User not found.' });
    }
    await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const credited = await client.query(
      'UPDATE wallet_accounts SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2 RETURNING balance',
      [amount, userId],
    );
    await client.query(
      'INSERT INTO wallet_transactions (user_id, amount, balance_after, type, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, amount, credited.rows[0].balance, 'admin_credit', description?.trim() || 'اعتباردهی مدیر'],
    );
    await client.query('COMMIT');
    return { userId, credited: amount, balance: Number(credited.rows[0].balance) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not credit wallet');
    return reply.code(500).send({ error: 'Could not credit wallet.' });
  } finally {
    client.release();
  }
});

app.post<{ Params: { userId: string }; Body: { reason?: string } }>('/api/v1/users/:userId/report', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId } = request.params;
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!isNumericId(userId) || userId === claims.sub || reason.length < 3 || reason.length > 1000) {
    return reply.code(400).send({ error: 'A valid user and report reason (3-1000 characters) are required.' });
  }
  const target = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!target.rowCount) return reply.code(404).send({ error: 'Reported user not found.' });
  const recent = await pool.query(
    `SELECT id FROM user_reports
      WHERE reporter_id = $1 AND reported_user_id = $2 AND created_at >= NOW() - INTERVAL '7 days'
      LIMIT 1`,
    [claims.sub, userId],
  );
  if (recent.rowCount) return reply.code(409).send({ error: 'You have already reported this user in the last 7 days.' });
  const inserted = await pool.query(
    'INSERT INTO user_reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, $3) RETURNING id, created_at AS "createdAt"',
    [claims.sub, userId, reason],
  );
  const threshold = await pool.query(
    `SELECT COUNT(DISTINCT reporter_id)::int AS "uniqueReporters"
       FROM user_reports WHERE reported_user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
    [userId],
  );
  return reply.code(201).send({
    report: inserted.rows[0],
    moderationReviewTriggered: Number(threshold.rows[0]?.uniqueReporters ?? 0) >= 2,
  });
});

app.get('/api/v1/admin/reports', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(
    `SELECT r.id, r.reported_user_id AS "reportedUserId", target.email AS "reportedEmail",
            r.reporter_id AS "reporterId", reporter.email AS "reporterEmail",
            r.reason, r.status, r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt",
            (SELECT COUNT(DISTINCT recent.reporter_id)::int FROM user_reports recent
              WHERE recent.reported_user_id = r.reported_user_id
                AND recent.created_at >= NOW() - INTERVAL '7 days') AS "uniqueReportsLast7Days",
            (SELECT COUNT(*)::int FROM user_reports recent
              WHERE recent.reported_user_id = r.reported_user_id
                AND recent.created_at >= NOW() - INTERVAL '7 days') AS "reportsLast7Days"
       FROM user_reports r
       JOIN users target ON target.id = r.reported_user_id
       JOIN users reporter ON reporter.id = r.reporter_id
      ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC
      LIMIT 200`,
  );
  return { reports: result.rows };
});

app.patch<{ Params: { id: string }; Body: { status?: string } }>('/api/v1/admin/reports/:id', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { id } = request.params;
  const { status } = request.body ?? {};
  if (!isNumericId(id) || !['reviewed', 'dismissed', 'actioned'].includes(status ?? '')) {
    return reply.code(400).send({ error: 'Choose a valid report status.' });
  }
  const result = await pool.query(
    'UPDATE user_reports SET status = $1, reviewed_at = NOW() WHERE id = $2 RETURNING id, status, reviewed_at AS "reviewedAt"',
    [status, id],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Report not found.' });
  return { report: result.rows[0] };
});

app.post<{ Body: { userId?: string; title?: string; body?: string } }>('/api/v1/admin/notifications', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId, title, body } = request.body ?? {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanBody = typeof body === 'string' ? body.trim() : '';
  if (cleanTitle.length < 1 || cleanTitle.length > 120 || cleanBody.length > 1000 ||
      (userId !== undefined && !isNumericId(userId))) {
    return reply.code(400).send({ error: 'Provide a title (1-120 characters), body up to 1000 characters, and optional valid user ID.' });
  }
  if (userId !== undefined) {
    const recipient = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!recipient.rowCount) return reply.code(404).send({ error: 'Notification recipient not found.' });
  }
  const result = await pool.query(
    `INSERT INTO notifications (user_id, actor_user_id, type, title, body)
     SELECT id, $1, 'system', $2, $3 FROM users
      WHERE ($4::bigint IS NULL OR id = $4::bigint)`,
    [claims.sub, cleanTitle, cleanBody, userId ?? null],
  );
  return { sent: result.rowCount ?? 0, scope: userId ? 'user' : 'all' };
});

app.get('/api/v1/admin/subscription-plans', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(
    'SELECT code, name, duration_days AS "durationDays", price_credits AS "priceCredits", active FROM subscription_plans ORDER BY price_credits ASC',
  );
  return { plans: result.rows };
});

app.patch<{ Params: { code: string }; Body: { name?: string; durationDays?: number; priceCredits?: number; active?: boolean } }>('/api/v1/admin/subscription-plans/:code', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { code } = request.params;
  const { name, durationDays, priceCredits, active } = request.body ?? {};
  if (!/^[a-z0-9_]{2,40}$/.test(code) ||
      (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100)) ||
      (durationDays !== undefined && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) ||
      (priceCredits !== undefined && (!Number.isSafeInteger(priceCredits) || priceCredits < 0 || priceCredits > 1000000000)) ||
      (active !== undefined && typeof active !== 'boolean') ||
      (name === undefined && durationDays === undefined && priceCredits === undefined && active === undefined)) {
    return reply.code(400).send({ error: 'Invalid subscription plan update.' });
  }
  const result = await pool.query(
    `UPDATE subscription_plans SET
       name = COALESCE($1, name),
       duration_days = COALESCE($2, duration_days),
       price_credits = COALESCE($3, price_credits),
       active = COALESCE($4, active),
       updated_at = NOW()
     WHERE code = $5
     RETURNING code, name, duration_days AS "durationDays", price_credits AS "priceCredits", active`,
    [name?.trim() ?? null, durationDays ?? null, priceCredits ?? null, active ?? null, code],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Subscription plan not found.' });
  return { plan: result.rows[0] };
});

app.get('/api/v1/chat/conversations', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT u.id AS "userId", u.full_name AS "fullName", u.email,
            u.avatar_data_url AS "avatarDataUrl",
            latest.body AS "lastMessage", latest.created_at AS "lastMessageAt",
            COALESCE(unread.count, 0)::int AS "unreadCount"
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM private_messages
          WHERE (sender_id = $1 AND recipient_id = u.id) OR (sender_id = u.id AND recipient_id = $1)
          ORDER BY created_at DESC LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS count FROM private_messages
          WHERE sender_id = u.id AND recipient_id = $1 AND read_at IS NULL
       ) unread ON TRUE
      WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
      ORDER BY latest.created_at DESC NULLS LAST, u.full_name ASC`,
    [claims.sub],
  );
  return { conversations: result.rows };
});

app.get<{ Params: { userId: string } }>('/api/v1/chat/:userId/messages', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId } = request.params;
  if (!isNumericId(userId) || userId === claims.sub) return reply.code(400).send({ error: 'Invalid conversation.' });
  const friendship = await pool.query(
    'SELECT 1 FROM friendships WHERE status = $1 AND ((requester_id = $2 AND addressee_id = $3) OR (requester_id = $3 AND addressee_id = $2)) LIMIT 1',
    ['accepted', claims.sub, userId],
  );
  if (!friendship.rowCount) return reply.code(403).send({ error: 'Chat is available only between accepted friends.' });
  const messages = await pool.query(
    `SELECT id, sender_id AS "senderId", recipient_id AS "recipientId", body,
            created_at AS "createdAt", read_at AS "readAt"
       FROM private_messages
      WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
      ORDER BY created_at DESC LIMIT 100`,
    [claims.sub, userId],
  );
  await pool.query('UPDATE private_messages SET read_at = NOW() WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL', [userId, claims.sub]);
  return { messages: messages.rows.reverse() };
});

app.post<{ Params: { userId: string }; Body: { body?: string } }>('/api/v1/chat/:userId/messages', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId } = request.params;
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!isNumericId(userId) || userId === claims.sub || !body || body.length > 2000) {
    return reply.code(400).send({ error: 'Message must contain 1 to 2000 characters and a valid recipient.' });
  }
  const friendship = await pool.query(
    'SELECT 1 FROM friendships WHERE status = $1 AND ((requester_id = $2 AND addressee_id = $3) OR (requester_id = $3 AND addressee_id = $2)) LIMIT 1',
    ['accepted', claims.sub, userId],
  );
  if (!friendship.rowCount) return reply.code(403).send({ error: 'Chat is available only between accepted friends.' });
  const inserted = await pool.query(
    `INSERT INTO private_messages (sender_id, recipient_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id AS "senderId", recipient_id AS "recipientId", body, created_at AS "createdAt", read_at AS "readAt"`,
    [claims.sub, userId, body],
  );
  return reply.code(201).send({ message: inserted.rows[0] });
});

app.get('/api/v1/notifications', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT id, type, title, body, data, created_at AS "createdAt",
            read_at AS "readAt", actor_user_id AS "actorUserId"
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100`,
    [claims.sub],
  );
  return { notifications: result.rows };
});

app.post<{ Params: { id: string } }>('/api/v1/notifications/:id/read', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const id = request.params.id;
  if (!isNumericId(id)) return reply.code(400).send({ error: 'Invalid notification id.' });
  const result = await pool.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id, read_at AS "readAt"',
    [id, claims.sub],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Notification not found.' });
  return { notification: result.rows[0] };
});

app.post('/api/v1/notifications/read-all', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
    [claims.sub],
  );
  return { status: 'ok', updated: result.rowCount ?? 0 };
});

// Friend requests are server-owned and capped at 100 accepted friends per account.
app.get<{ Querystring: { username?: string } }>('/api/v1/users/search', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request) => {
  const claims = request.user as { sub: string };
  const username = request.query.username?.trim().replace(/^@/, '');
  if (!username || !/^[a-zA-Z0-9_.]{3,24}$/.test(username)) return { users: [] };
  // Do not expose full names in username-based friend search.
  const result = await pool.query(
    'SELECT id, username, avatar_data_url AS "avatarDataUrl" FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
    [username, claims.sub],
  );
  return { users: result.rows };
});

app.get('/api/v1/friends', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT f.id, f.status, f.requester_id AS "requesterId",
            f.addressee_id AS "addresseeId", f.created_at AS "createdAt",
            requester.username AS "requesterUsername",
            addressee.username AS "addresseeUsername",
            requester.avatar_data_url AS "requesterAvatarDataUrl",
            addressee.avatar_data_url AS "addresseeAvatarDataUrl"
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
    username: String(row.requesterId) === claims.sub ? row.addresseeUsername : row.requesterUsername,
    name: String(row.requesterId) === claims.sub ? row.addresseeUsername : row.requesterUsername,
    avatarDataUrl: String(row.requesterId) === claims.sub ? row.addresseeAvatarDataUrl : row.requesterAvatarDataUrl,
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
  let phase = 'begin';
  try {
    await client.query('BEGIN');
    phase = 'lock-users';
    const users = await client.query(
      'SELECT id FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
      [[claims.sub, targetId]],
    );
    if (users.rowCount !== 2) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'User not found.' });
    }

    phase = 'lookup-relation';
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
      phase = 'check-reciprocal-request-limits';
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
      await client.query(
        `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
         VALUES ($1, $2, 'friend_accepted', 'درخواست دوستی پذیرفته شد', 'درخواست دوستی شما پذیرفته شد.', jsonb_build_object('userId', $2::bigint))`,
        [targetId, claims.sub],
      );
      await client.query(
        `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
         VALUES ($1, $2, 'friend_accepted', 'دوستی برقرار شد', 'درخواست دوستی شما پذیرفته شد.', jsonb_build_object('userId', $2::bigint))`,
        [claims.sub, targetId],
      );
      await client.query('COMMIT');
      return { status: 'accepted', message: 'Friend request accepted.' };
    }
    if (relation) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'A friend request is already pending.' });
    }

    phase = 'check-friend-limits';
    const counts = await client.query(
      `SELECT id, (SELECT COUNT(*)::int FROM friendships f WHERE f.status = 'accepted' AND (f.requester_id = users.id OR f.addressee_id = users.id)) AS friend_count
         FROM users WHERE id = ANY($1::bigint[])`,
      [[claims.sub, targetId]],
    );
    if (counts.rows.some((row) => Number(row.friend_count) >= 100)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'One account has reached the 100-friend limit.' });
    }
    phase = 'insert-friendship';
    await client.query(
      'INSERT INTO friendships (requester_id, addressee_id) VALUES ($1, $2)',
      [claims.sub, targetId],
    );
    phase = 'insert-notification';
    await client.query(
      `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
       VALUES ($1, $2, 'friend_request', 'درخواست دوستی جدید', 'یک کاربر برای شما درخواست دوستی فرستاده است.', jsonb_build_object('userId', $2::bigint))`,
      [targetId, claims.sub],
    );
    phase = 'commit';
    await client.query('COMMIT');
    return reply.code(201).send({ status: 'pending', message: 'Friend request sent.' });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error?.code === '23505') return reply.code(409).send({ error: 'A friend request already exists.' });
    request.log.error({ err: error, phase }, 'Could not create friend request');
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
    await client.query(
      `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
       VALUES ($1, $2, 'friend_accepted', 'درخواست دوستی پذیرفته شد', 'درخواست دوستی شما پذیرفته شد.', jsonb_build_object('userId', $2::bigint))`,
      [requesterId, claims.sub],
    );
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


app.get('/api/v1/leaderboard', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT s.user_id AS "userId", u.username, u.avatar_data_url AS "avatarDataUrl", s.rating,
            s.games_played AS "gamesPlayed", s.wins, s.losses
       FROM backgammon_player_stats s
       JOIN users u ON u.id = s.user_id
      WHERE s.games_played > 0
      ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC, LOWER(u.username) ASC
      LIMIT 50`,
  );
  return { leaderboard: result.rows, currentUserId: claims.sub };
});

app.get('/api/v1/matches/history', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.host_user_id AS "hostUserId",
            m.guest_user_id AS "guestUserId", m.status,
            m.off_state AS "offState", m.created_at AS "createdAt", m.updated_at AS "finishedAt",
            CASE WHEN m.host_user_id = $1 THEN guest.full_name ELSE host.full_name END AS "opponentName",
            CASE WHEN m.host_user_id = $1 THEN guest.avatar_data_url ELSE host.avatar_data_url END AS "opponentAvatarDataUrl",
            CASE WHEN COALESCE((m.off_state->>'host')::int, 0) >= 15 THEN m.host_user_id
                 WHEN COALESCE((m.off_state->>'guest')::int, 0) >= 15 THEN m.guest_user_id
                 ELSE NULL END AS "winnerUserId",
            CASE WHEN COALESCE((m.off_state->>'host')::int, 0) >= 15
                   THEN CASE WHEN m.host_user_id = $1 THEN 'win' ELSE 'loss' END
                 WHEN COALESCE((m.off_state->>'guest')::int, 0) >= 15
                   THEN CASE WHEN m.guest_user_id = $1 THEN 'win' ELSE 'loss' END
                 ELSE 'unknown' END AS result
       FROM backgammon_matches m
       JOIN users host ON host.id = m.host_user_id
       LEFT JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.status = 'finished' AND ($1 = m.host_user_id OR $1 = m.guest_user_id)
      ORDER BY m.updated_at DESC
      LIMIT 30`,
    [claims.sub],
  );
  return { matches: result.rows };
});

app.get('/api/v1/matches/open', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status, m.created_at AS "createdAt", u.full_name AS "hostName", u.avatar_data_url AS "hostAvatarDataUrl"
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
      `UPDATE backgammon_matches SET guest_user_id = $1, status = 'waiting',
              guest_settings_accepted = FALSE, host_ready = FALSE, guest_ready = FALSE,
              cancellation_proposed_by = NULL, cancellation_accepted_by = NULL,
              updated_at = NOW()
         WHERE id = $2`,
      [claims.sub, match.id]);
    await client.query('COMMIT');
    const joined = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode", m.status, host.full_name AS "hostName",
              guest.full_name AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
              guest.avatar_data_url AS "guestAvatarDataUrl", m.created_at AS "createdAt"
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
            guest.full_name AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
            guest.avatar_data_url AS "guestAvatarDataUrl", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            (m.host_user_id = $2) AS "isHost", m.match_to_win AS "matchToWin",
            m.host_settings_accepted AS "hostSettingsAccepted", m.guest_settings_accepted AS "guestSettingsAccepted",
            m.host_ready AS "hostReady", m.guest_ready AS "guestReady",
            m.host_game_wins AS "hostGameWins", m.guest_game_wins AS "guestGameWins",
            m.cancellation_proposed_by AS "cancellationProposedBy", (m.cancellation_proposed_by = $2) AS "cancellationProposedByMe"
       FROM backgammon_matches m JOIN users host ON host.id = m.host_user_id
       LEFT JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.id = $1 AND (m.host_user_id = $2 OR m.guest_user_id = $2) AND m.expires_at > NOW()`,
    [request.params.id, claims.sub]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  return { match: result.rows[0] };
});

app.get('/api/v1/match-invites', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT i.id, i.match_id AS "matchId", i.status, i.created_at AS "createdAt",
            m.room_code AS "roomCode", m.status AS "matchStatus",
            inviter.username AS "inviterUsername", inviter.full_name AS "inviterName",
            inviter.avatar_data_url AS "inviterAvatarDataUrl"
       FROM backgammon_match_invites i
       JOIN backgammon_matches m ON m.id = i.match_id
       JOIN users inviter ON inviter.id = i.inviter_id
      WHERE i.invitee_id = $1 AND i.status = 'pending' AND m.status = 'waiting'
        AND m.guest_user_id IS NULL AND m.expires_at > NOW()
      ORDER BY i.created_at DESC LIMIT 50`,
    [claims.sub]);
  return { invites: result.rows };
});

app.post<{ Params: { id: string }; Body: { inviteeId?: string } }>(
  '/api/v1/matches/:id/invites', { onRequest: [requireMatchAuth] }, async (request, reply) => {
    const claims = request.user as { sub: string };
    const inviteeId = request.body?.inviteeId;
    if (!isNumericId(request.params.id) || !isNumericId(inviteeId) || inviteeId === claims.sub) {
      return reply.code(400).send({ error: 'Provide a valid friend to invite.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const matchResult = await client.query(
        `SELECT id, status, host_user_id, guest_user_id FROM backgammon_matches
          WHERE id = $1 AND expires_at > NOW() FOR UPDATE`, [request.params.id]);
      const match = matchResult.rows[0];
      if (!match || match.host_user_id !== claims.sub || match.status !== 'waiting' || match.guest_user_id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Only the host can invite a friend to an empty waiting room.' });
      }
      const friendship = await client.query(
        `SELECT 1 FROM friendships WHERE status = 'accepted'
          AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)) LIMIT 1`,
        [claims.sub, inviteeId]);
      if (!friendship.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'You can invite accepted friends only.' });
      }
      const inserted = await client.query(
        `INSERT INTO backgammon_match_invites (match_id, inviter_id, invitee_id)
          VALUES ($1, $2, $3) RETURNING id, match_id AS "matchId", status, created_at AS "createdAt"`,
        [request.params.id, claims.sub, inviteeId]);
      await client.query(
        `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
          VALUES ($1, $2, 'system', 'دعوت به تخته‌نرد', 'دوست شما را به یک مسابقه تخته‌نرد دعوت کرده است.',
                  jsonb_build_object('inviteId', $3::text, 'matchId', $4::text))
          ON CONFLICT DO NOTHING`,
        [inviteeId, claims.sub, inserted.rows[0].id, request.params.id]);
      await client.query('COMMIT');
      return reply.code(201).send({ invite: inserted.rows[0] });
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error?.code === '23505') return reply.code(409).send({ error: 'This friend has already been invited to this room.' });
      request.log.error({ err: error }, 'Could not send match invitation');
      return reply.code(500).send({ error: 'Could not send match invitation.' });
    } finally { client.release(); }
  });

app.post<{ Params: { id: string }; Body: { accept: boolean } }>(
  '/api/v1/match-invites/:id/respond', { onRequest: [requireMatchAuth] }, async (request, reply) => {
    const claims = request.user as { sub: string };
    if (!isNumericId(request.params.id) || typeof request.body?.accept !== 'boolean') {
      return reply.code(400).send({ error: 'Provide a valid invitation id and response.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT i.id, i.match_id, i.invitee_id, i.status, m.status AS "matchStatus", m.guest_user_id
           FROM backgammon_match_invites i JOIN backgammon_matches m ON m.id = i.match_id
          WHERE i.id = $1 FOR UPDATE OF i, m`, [request.params.id]);
      const invite = found.rows[0];
      if (!invite || invite.invitee_id !== claims.sub || invite.status !== 'pending') {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Pending invitation not found.' });
      }
      if (!request.body.accept) {
        await client.query(
          `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
          [request.params.id]);
        await client.query('COMMIT');
        return { response: 'rejected' };
      }
      if (invite.matchStatus !== 'waiting' || invite.guest_user_id) {
        await client.query(
          `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
          [request.params.id]);
        await client.query('COMMIT');
        return reply.code(409).send({ error: 'This room is no longer available.' });
      }
      await client.query(
        `UPDATE backgammon_matches SET guest_user_id = $1, guest_settings_accepted = FALSE,
           host_ready = FALSE, guest_ready = FALSE, cancellation_proposed_by = NULL,
           cancellation_accepted_by = NULL, updated_at = NOW() WHERE id = $2`,
        [claims.sub, invite.match_id]);
      await client.query(
        `UPDATE backgammon_match_invites SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'rejected' END,
           responded_at = NOW() WHERE match_id = $2 AND status = 'pending'`,
        [request.params.id, invite.match_id]);
      await client.query('COMMIT');
      const match = await pool.query(
        `SELECT m.id, m.room_code AS "roomCode", m.status, host.full_name AS "hostName",
                guest.full_name AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
                guest.avatar_data_url AS "guestAvatarDataUrl"
           FROM backgammon_matches m JOIN users host ON host.id = m.host_user_id
           JOIN users guest ON guest.id = m.guest_user_id WHERE m.id = $1`, [invite.match_id]);
      return { response: 'accepted', match: match.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not respond to match invitation');
      return reply.code(500).send({ error: 'Could not respond to match invitation.' });
    } finally { client.release(); }
  });

// Match setup is a server-authoritative two-player handshake. A match becomes active
// only after both players accept the same target and both are ready.
app.post<{ Params: { id: string }; Body: { matchToWin?: number; acceptSettings?: boolean; ready?: boolean } }>(
  '/api/v1/matches/:id/setup',
  { onRequest: [requireMatchAuth] },
  async (request, reply) => {
    const claims = request.user as { sub: string };
    const { matchToWin, acceptSettings, ready } = request.body ?? {};
    if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
    if (matchToWin !== undefined && ![1, 3, 5].includes(matchToWin)) {
      return reply.code(400).send({ error: 'Match to win must be 1, 3, or 5.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, host_user_id, guest_user_id, status, match_to_win,
                host_settings_accepted, guest_settings_accepted, host_ready, guest_ready
           FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
        [request.params.id]);
      const m = found.rows[0] as any;
      if (!m || ![m.host_user_id, m.guest_user_id].includes(claims.sub) || !m.guest_user_id) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Match with two players not found.' });
      }
      if (m.status !== 'waiting') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Match setup is already closed.' });
      }
      const isHost = m.host_user_id === claims.sub;
      if (matchToWin !== undefined && !isHost) {
        await client.query('ROLLBACK');
        return reply.code(403).send({ error: 'Only the host can change Match to Win.' });
      }
      if (matchToWin !== undefined && matchToWin !== m.match_to_win) {
        await client.query(
          `UPDATE backgammon_matches SET match_to_win = $1,
             host_settings_accepted = TRUE, guest_settings_accepted = FALSE,
             host_ready = FALSE, guest_ready = FALSE, updated_at = NOW()
           WHERE id = $2`, [matchToWin, request.params.id]);
      } else {
        const acceptedColumn = isHost ? 'host_settings_accepted' : 'guest_settings_accepted';
        const readyColumn = isHost ? 'host_ready' : 'guest_ready';
        const updates: string[] = [];
        const values: unknown[] = [];
        if (acceptSettings === true) updates.push(`${acceptedColumn} = TRUE`);
        if (ready !== undefined) {
          if (ready && !(isHost ? m.host_settings_accepted : m.guest_settings_accepted) && acceptSettings !== true) {
            await client.query('ROLLBACK');
            return reply.code(409).send({ error: 'Accept the match settings before becoming ready.' });
          }
          values.push(Boolean(ready));
          updates.push(`${readyColumn} = $${values.length}`);
        }
        if (updates.length) {
          updates.push('updated_at = NOW()');
          values.push(request.params.id);
          await client.query(`UPDATE backgammon_matches SET ${updates.join(', ')} WHERE id = ${values.length}`, values);
        }
      }
      const current = await client.query(
        `SELECT match_to_win, host_settings_accepted, guest_settings_accepted, host_ready, guest_ready
           FROM backgammon_matches WHERE id = $1 FOR UPDATE`, [request.params.id]);
      const setup = current.rows[0];
      let status = 'waiting';
      if (setup.host_settings_accepted && setup.guest_settings_accepted && setup.host_ready && setup.guest_ready) {
        await client.query(
          `UPDATE backgammon_matches SET status = 'active', current_turn_user_id = host_user_id,
             dice = '[]'::jsonb, remaining_dice = '[]'::jsonb, state_version = 0,
             updated_at = NOW() WHERE id = $1 AND status = 'waiting'`, [request.params.id]);
        status = 'active';
      }
      await client.query('COMMIT');
      return { setup: { ...setup, status } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not update match setup');
      return reply.code(500).send({ error: 'Could not update match setup.' });
    } finally { client.release(); }
  });

app.post<{ Params: { id: string }; Body: { accept: boolean } }>(
  '/api/v1/matches/:id/cancellation',
  { onRequest: [requireMatchAuth] },
  async (request, reply) => {
    const claims = request.user as { sub: string };
    if (!isNumericId(request.params.id) || typeof request.body?.accept !== 'boolean') {
      return reply.code(400).send({ error: 'Provide a valid match id and accept boolean.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, host_user_id, guest_user_id, status, cancellation_proposed_by, cancellation_accepted_by
           FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
        [request.params.id]);
      const m = found.rows[0] as any;
      if (!m || ![m.host_user_id, m.guest_user_id].includes(claims.sub) || !m.guest_user_id) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Match not found.' });
      }
      if (!['waiting', 'active'].includes(m.status)) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'This match cannot be cancelled.' });
      }
      if (m.cancellation_proposed_by == null) {
        await client.query(
          'UPDATE backgammon_matches SET cancellation_proposed_by = $1, cancellation_accepted_by = NULL, updated_at = NOW() WHERE id = $2',
          [claims.sub, request.params.id]);
        await client.query('COMMIT');
        return { cancellation: { status: 'proposed', proposedBy: claims.sub } };
      }
      if (m.cancellation_proposed_by === claims.sub) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Your cancellation proposal is awaiting the other player.' });
      }
      if (!request.body.accept) {
        await client.query(
          'UPDATE backgammon_matches SET cancellation_proposed_by = NULL, cancellation_accepted_by = NULL, updated_at = NOW() WHERE id = $1',
          [request.params.id]);
        await client.query('COMMIT');
        return { cancellation: { status: 'rejected' } };
      }
      await client.query(
        `UPDATE backgammon_matches SET status = 'cancelled', cancellation_accepted_by = $1,
           cancellation_proposed_by = NULL, updated_at = NOW() WHERE id = $2`,
        [claims.sub, request.params.id]);
      await client.query('COMMIT');
      return { cancellation: { status: 'cancelled' } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not process match cancellation');
      return reply.code(500).send({ error: 'Could not process match cancellation.' });
    } finally { client.release(); }
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
              board_state, bar_state, off_state, dice, remaining_dice, state_version,
              match_to_win, host_game_wins, guest_game_wins
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const game = result.rows[0] as {
      id: string; status: string; host_user_id: string; guest_user_id: string | null;
      current_turn_user_id: string | null; board_state: number[];
      bar_state: { host: number; guest: number }; off_state: { host: number; guest: number };
      dice: number[]; remaining_dice: number[]; state_version: number;
      match_to_win: number; host_game_wins: number; guest_game_wins: number;
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
    const gameFinished = simulated.off.host >= 15 || simulated.off.guest >= 15;
    const hostWonGame = simulated.off.host >= 15;
    const nextHostWins = Number(game.host_game_wins ?? 0) + (gameFinished && hostWonGame ? 1 : 0);
    const nextGuestWins = Number(game.guest_game_wins ?? 0) + (gameFinished && !hostWonGame ? 1 : 0);
    const matchFinished = gameFinished && Math.max(nextHostWins, nextGuestWins) >= Number(game.match_to_win ?? 1);
    const nextBoard = gameFinished && !matchFinished ? INITIAL_BACKGAMMON_BOARD : simulated.board;
    const nextBar = gameFinished && !matchFinished ? { host: 0, guest: 0 } : simulated.bar;
    const nextOff = gameFinished && !matchFinished ? { host: 0, guest: 0 } : simulated.off;
    const updated = await client.query(
      `UPDATE backgammon_matches SET board_state = $1::jsonb, bar_state = $2::jsonb,
              off_state = $3::jsonb, current_turn_user_id = $4, dice = $5::jsonb,
              remaining_dice = $6::jsonb, status = $7,
              host_game_wins = $8, guest_game_wins = $9,
              state_version = state_version + 1, updated_at = NOW()
         WHERE id = $10
         RETURNING id, status, board_state AS board, bar_state AS bar, off_state AS off,
                   current_turn_user_id AS "currentTurnUserId", dice,
                   remaining_dice AS "remainingDice", state_version AS version,
                   match_to_win AS "matchToWin", host_game_wins AS "hostGameWins",
                   guest_game_wins AS "guestGameWins"`,
      [JSON.stringify(nextBoard), JSON.stringify(nextBar), JSON.stringify(nextOff),
       gameFinished ? game.host_user_id : nextTurn, JSON.stringify(gameFinished ? [] : nextDice),
       JSON.stringify(gameFinished ? [] : nextRemaining), matchFinished ? 'finished' : 'active',
       nextHostWins, nextGuestWins, game.id]);
    if (matchFinished && game.guest_user_id) {
      const winnerId = nextHostWins >= Number(game.match_to_win ?? 1) ? game.host_user_id : game.guest_user_id;
      const loserId = winnerId === game.host_user_id ? game.guest_user_id : game.host_user_id;
      await updateBackgammonRatings(client, winnerId, loserId);
    }
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
              board_state, bar_state, off_state, dice, remaining_dice, state_version,
              match_to_win, host_game_wins, guest_game_wins
         FROM backgammon_matches WHERE id = $1 AND expires_at > NOW() FOR UPDATE`,
      [request.params.id]);
    const game = result.rows[0] as {
      id: string; status: string; host_user_id: string; guest_user_id: string | null;
      current_turn_user_id: string | null; board_state: number[];
      bar_state: { host: number; guest: number }; off_state: { host: number; guest: number };
      dice: number[]; remaining_dice: number[]; state_version: number;
      match_to_win: number; host_game_wins: number; guest_game_wins: number;
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
    const gameFinished = off.host >= 15 || off.guest >= 15;
    const hostWonGame = off.host >= 15;
    const nextHostWins = Number(game.host_game_wins ?? 0) + (gameFinished && hostWonGame ? 1 : 0);
    const nextGuestWins = Number(game.guest_game_wins ?? 0) + (gameFinished && !hostWonGame ? 1 : 0);
    const matchFinished = gameFinished && Math.max(nextHostWins, nextGuestWins) >= Number(game.match_to_win ?? 1);
    const nextBoard = gameFinished && !matchFinished ? INITIAL_BACKGAMMON_BOARD : board;
    const nextBar = gameFinished && !matchFinished ? { host: 0, guest: 0 } : bar;
    const nextOff = gameFinished && !matchFinished ? { host: 0, guest: 0 } : off;
    const updated = await client.query(
      `UPDATE backgammon_matches SET board_state = $1::jsonb, bar_state = $2::jsonb,
              off_state = $3::jsonb, current_turn_user_id = $4, dice = $5::jsonb,
              remaining_dice = $6::jsonb, status = $7,
              host_game_wins = $8, guest_game_wins = $9,
              state_version = state_version + 1, updated_at = NOW()
         WHERE id = $10
         RETURNING id, status, board_state AS board, bar_state AS bar, off_state AS off,
                   current_turn_user_id AS "currentTurnUserId", dice,
                   remaining_dice AS "remainingDice", state_version AS version,
                   match_to_win AS "matchToWin", host_game_wins AS "hostGameWins",
                   guest_game_wins AS "guestGameWins"`,
      [JSON.stringify(nextBoard), JSON.stringify(nextBar), JSON.stringify(nextOff),
       gameFinished ? game.host_user_id : nextTurn, JSON.stringify(gameFinished ? [] : nextDice),
       JSON.stringify(gameFinished ? [] : nextRemaining), matchFinished ? 'finished' : 'active',
       nextHostWins, nextGuestWins, game.id]);
    if (matchFinished && game.guest_user_id) {
      const winnerId = nextHostWins >= Number(game.match_to_win ?? 1) ? game.host_user_id : game.guest_user_id;
      const loserId = winnerId === game.host_user_id ? game.guest_user_id : game.host_user_id;
      await updateBackgammonRatings(client, winnerId, loserId);
    }
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
    if (!Number.isInteger(request.body?.expectedVersion) || request.body.expectedVersion !== match.state_version) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Game state changed or expectedVersion is missing. Refresh the board and try again.' });
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

export { app };

// Neon Functions invoke a Fetch-compatible handler; traditional hosts keep the normal listener.
if (process.env.NEON_FUNCTION_RUNTIME !== '1') {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exit(1);
  }
}
