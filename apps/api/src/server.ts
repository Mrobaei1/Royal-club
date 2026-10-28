import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Pool, type PoolClient } from 'pg';
import { createCipheriv, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isNumericId, isValidRegistrationPassword } from './validation.js';
import { createOtpCode, digestOtp, normalizeIranianMobile, verifyOtpDigest } from './otp-security.js';
import { getAllowedCorsOrigins } from './cors-config.js';
import { INITIAL_BACKGAMMON_BOARD, applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';
import { calculateEloRatings } from './backgammon-rating.js';
import { hasRoyalPermission, isRoyalPermission } from './permissions.js';
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



  CREATE TABLE IF NOT EXISTS sms_otp_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_mode TEXT NOT NULL DEFAULT 'disabled' CHECK (delivery_mode IN ('disabled', 'development_simulator', 'real_provider')),
    provider TEXT NOT NULL DEFAULT '',
    sender_id TEXT NOT NULL DEFAULT '',
    template_id TEXT NOT NULL DEFAULT '',
    encrypted_api_key TEXT NOT NULL DEFAULT '',
    otp_ttl_seconds INTEGER NOT NULL DEFAULT 120 CHECK (otp_ttl_seconds BETWEEN 60 AND 600),
    resend_cooldown_seconds INTEGER NOT NULL DEFAULT 60 CHECK (resend_cooldown_seconds BETWEEN 30 AND 600),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 3 AND 10),
    daily_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 0 AND 100000),
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO sms_otp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  CREATE TABLE IF NOT EXISTS sms_otp_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS sms_otp_audit_log_created_idx ON sms_otp_audit_log (created_at DESC);

  CREATE TABLE IF NOT EXISTS sms_otp_challenges (
    id BIGSERIAL PRIMARY KEY,
    phone_e164 TEXT NOT NULL,
    otp_salt TEXT NOT NULL,
    otp_digest TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 3 AND 10),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS sms_otp_challenges_phone_created_idx
    ON sms_otp_challenges (phone_e164, created_at DESC);
  CREATE INDEX IF NOT EXISTS sms_otp_challenges_expiry_idx
    ON sms_otp_challenges (expires_at) WHERE consumed_at IS NULL;

  -- Dormant delegated permissions: no grants are seeded and all grant management
  -- remains protected by the existing owner identity until explicitly assigned.
  CREATE TABLE IF NOT EXISTS admin_permission_grants (
    id BIGSERIAL PRIMARY KEY,
    grantee_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    scope JSONB,
    reason TEXT NOT NULL,
    approval_reference TEXT NOT NULL DEFAULT '',
    granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX IF NOT EXISTS admin_permission_grants_active_unique_idx
    ON admin_permission_grants (grantee_user_id, permission) WHERE revoked_at IS NULL;
  CREATE INDEX IF NOT EXISTS admin_permission_grants_user_idx
    ON admin_permission_grants (grantee_user_id, permission) WHERE revoked_at IS NULL;
  CREATE TABLE IF NOT EXISTS admin_permission_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    grant_id BIGINT,
    action TEXT NOT NULL CHECK (action IN ('grant_created', 'grant_revoked', 'grant_rejected')),
    permission TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error')),
    reason TEXT NOT NULL DEFAULT '',
    approval_reference TEXT NOT NULL DEFAULT '',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS admin_permission_audit_time_idx
    ON admin_permission_audit_log (created_at DESC);

  CREATE TABLE IF NOT EXISTS app_contact_methods (
    id BIGSERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

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
    edited_at TIMESTAMPTZ,
    deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_for_sender BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_for_recipient BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (sender_id <> recipient_id)
  );
  -- Image messages are data URLs; the API separately enforces 2,000 characters
  -- for text and a bounded image payload. Widen the legacy table constraint so
  -- valid image messages are not rejected by PostgreSQL.
  -- Image body constraint is migrated idempotently after schema setup.
  ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
  ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS hidden_for_sender BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE private_messages ADD COLUMN IF NOT EXISTS hidden_for_recipient BOOLEAN NOT NULL DEFAULT FALSE;
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
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
    CHECK (guest_user_id IS NULL OR guest_user_id <> host_user_id)
  );
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS board_state JSONB NOT NULL DEFAULT '${JSON.stringify(INITIAL_BACKGAMMON_BOARD)}'::jsonb;
  ALTER TABLE backgammon_matches ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '60 seconds');
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
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS winner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS spectators_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE backgammon_matches ADD COLUMN IF NOT EXISTS finish_reason TEXT CHECK (finish_reason IS NULL OR finish_reason IN ('bear_off', 'resignation'));
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

const messageBodyConstraint = await pool.query(
  'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = \'private_messages\'::regclass AND conname = \'private_messages_body_check\'',
);
if (!String(messageBodyConstraint.rows[0]?.definition ?? '').includes('680000')) {
  await pool.query('ALTER TABLE private_messages DROP CONSTRAINT IF EXISTS private_messages_body_check');
  await pool.query('ALTER TABLE private_messages ADD CONSTRAINT private_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 680000)');
}


// Waiting rooms expire even if the lobby is never reopened. The timer is
// useful on persistent hosts; the request hook provides best-effort cleanup in
// warm/serverless runtimes where background timers may be suspended.
let lastExpiredRoomCleanupAt = 0;
const cleanupExpiredWaitingRooms = async () => {
  const now = Date.now();
  if (now - lastExpiredRoomCleanupAt < 5_000) return;
  lastExpiredRoomCleanupAt = now;
  try {
    await pool.query(`
      WITH expired AS (
        SELECT id FROM backgammon_matches
         WHERE status = 'waiting' AND guest_user_id IS NULL AND expires_at <= NOW()
      ), notices AS (
        DELETE FROM notifications
         WHERE data->>'matchId' IN (SELECT id::text FROM expired)
         RETURNING id
      )
      DELETE FROM backgammon_matches WHERE id IN (SELECT id FROM expired)
    `);
  } catch (error: unknown) {
    lastExpiredRoomCleanupAt = 0;
    app.log.error({ err: error }, 'Expired waiting-room cleanup failed');
  }
};
const expiredWaitingRoomCleanup = setInterval(() => {
  void cleanupExpiredWaitingRooms();
}, 5_000);
expiredWaitingRoomCleanup.unref();
app.addHook('onRequest', async () => {
  await cleanupExpiredWaitingRooms();
});

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
  {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        // Parse the body before choosing a key; registration limits follow the
        // submitted account identity, not the caller's IP or VPN exit node.
        hook: 'preHandler',
        keyGenerator: (request) => {
          const body = request.body as { email?: unknown } | undefined;
          const email = body?.email;
          return typeof email === 'string' && email.trim()
            ? `register:${email.trim().toLowerCase()}`
            : 'register:missing-email';
        },
      },
    },
  },
  async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const password = request.body?.password;
    const fullName = request.body?.fullName?.trim();
    const phone = request.body?.phone?.trim();
    const country = typeof request.body?.country === 'string' ? request.body.country.trim() : '';

    if (!fullName || fullName.length > 120 || !phone || phone.length > 32 ||
        !/^[+0-9() .-]{6,32}$/.test(phone) || country.length > 80 ||
        !email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !isValidRegistrationPassword(password)) {
      return reply.code(400).send({
        error: 'Enter a name, valid phone number, valid email, and a password of at least 6 characters (maximum 128 UTF-8 bytes).'
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
  {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        // Run after body parsing so the key is the account email, never the IP.
        hook: 'preHandler',
        // Login throttling follows the account, not the network/IP, so VPN changes
        // do not alter the identity or login allowance for a user.
        keyGenerator: (request) => {
          const body = request.body as { email?: unknown } | undefined;
          const email = body?.email;
          return typeof email === 'string' && email.trim()
            ? `login:${email.trim().toLowerCase()}`
            : 'login:missing-email';
        },
      },
    },
  },
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

// Delegated grants are dormant until explicitly created by the configured owner.
// Sensitive owner-only endpoints (wallet credit, SMS configuration, role management)
// are intentionally not reachable through delegated grants.
const requirePermission = (
  permission: string,
  resourceIdOf?: (request: any) => string | undefined | Promise<string | undefined>,
) => async (request: any, reply: any) => {
  await requireMatchAuth(request, reply);
  if (reply.sent) return;
  const claims = request.user as { sub?: string };
  if (!claims.sub || !isRoyalPermission(permission)) {
    return reply.code(403).send({ error: 'Permission denied.' });
  }
  const result = await pool.query(
    'SELECT permission, scope, revoked_at FROM admin_permission_grants WHERE grantee_user_id = $1 AND permission = $2 AND revoked_at IS NULL',
    [claims.sub, permission],
  );
  const grants = result.rows.map((row) => ({
    permission: String(row.permission),
    active: row.revoked_at === null,
    scope: row.scope,
  }));
  const resourceId = await resourceIdOf?.(request);
  if (!hasRoyalPermission(grants, permission, resourceId)) {
    return reply.code(403).send({ error: 'Permission denied.' });
  }
};

const requireOwnerOrPermission = (
  permission: string,
  resourceIdOf?: (request: any) => string | undefined | Promise<string | undefined>,
) => async (request: any, reply: any) => {
  await requireMatchAuth(request, reply);
  if (reply.sent) return;
  const ownerUserId = process.env.OWNER_USER_ID?.trim();
  const claims = request.user as { sub?: string };
  if (ownerUserId && isNumericId(ownerUserId) && claims.sub === ownerUserId) return;
  await requirePermission(permission, resourceIdOf)(request, reply);
};

app.get('/api/v1/admin/permissions/grants', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`
    SELECT g.id, g.grantee_user_id AS "userId", u.username,
           g.permission, g.scope, g.reason, g.approval_reference AS "approvalReference",
           g.created_at AS "createdAt", grantor.username AS "grantedBy"
      FROM admin_permission_grants g
      JOIN users u ON u.id = g.grantee_user_id
      LEFT JOIN users grantor ON grantor.id = g.granted_by
     WHERE g.revoked_at IS NULL
     ORDER BY g.created_at DESC, g.id DESC
     LIMIT 500
  `);
  return { grants: result.rows };
});

app.post<{ Body: { userId?: string; permission?: string; scope?: unknown; reason?: string; approvalReference?: string } }>(
  '/api/v1/admin/permissions/grants',
  { onRequest: [requireOwnerAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const body = request.body ?? {};
    const userId = body.userId;
    const permission = body.permission;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const approvalReference = typeof body.approvalReference === 'string' ? body.approvalReference.trim() : '';
    let scope: { resourceIds: string[] } | null = null;
    if (body.scope !== undefined && body.scope !== null) {
      const value = body.scope as { resourceIds?: unknown };
      if (typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.resourceIds) ||
          value.resourceIds.length < 1 || value.resourceIds.length > 100 ||
          !value.resourceIds.every((id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 100)) {
        return reply.code(400).send({ error: 'Scope must contain 1-100 valid resource IDs.' });
      }
      scope = { resourceIds: [...new Set(value.resourceIds as string[])] };
    }
    if (!isNumericId(userId) || !isRoyalPermission(permission) ||
        reason.length < 5 || reason.length > 500 || approvalReference.length > 200) {
      return reply.code(400).send({ error: 'Provide a valid user ID, allowlisted permission, reason, and optional approval reference.' });
    }

    const claims = request.user as { sub?: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize the ceiling check so concurrent grants cannot exceed 50 distinct delegates.
      await client.query('SELECT pg_advisory_xact_lock($1)', [721005]);
      const user = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (!user.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'User not found.' });
      }
      const existing = await client.query(
        'SELECT id FROM admin_permission_grants WHERE grantee_user_id = $1 AND permission = $2 AND revoked_at IS NULL',
        [userId, permission],
      );
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'An active grant for this permission already exists.' });
      }
      const count = await client.query(
        'SELECT COUNT(DISTINCT grantee_user_id)::int AS count FROM admin_permission_grants WHERE revoked_at IS NULL',
      );
      const alreadyHasGrant = await client.query(
        'SELECT 1 FROM admin_permission_grants WHERE grantee_user_id = $1 AND revoked_at IS NULL LIMIT 1',
        [userId],
      );
      if (!alreadyHasGrant.rowCount && Number(count.rows[0]?.count ?? 0) >= 50) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'The planned limit of 50 delegated users has been reached.' });
      }
      const inserted = await client.query(
        `INSERT INTO admin_permission_grants
          (grantee_user_id, permission, scope, reason, approval_reference, granted_by)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6)
         RETURNING id, grantee_user_id AS "userId", permission, scope,
                   reason, approval_reference AS "approvalReference", created_at AS "createdAt"`,
        [userId, permission, scope ? JSON.stringify(scope) : null, reason, approvalReference, claims.sub ?? null],
      );
      await client.query(
        `INSERT INTO admin_permission_audit_log
          (actor_user_id, target_user_id, grant_id, action, permission, result, reason, approval_reference)
         VALUES ($1, $2, $3, 'grant_created', $4, 'success', $5, $6)`,
        [claims.sub ?? null, userId, inserted.rows[0].id, permission, reason, approvalReference],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ grant: inserted.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not create permission grant');
      return reply.code(500).send({ error: 'Could not create permission grant.' });
    } finally {
      client.release();
    }
  },
);

app.delete<{ Params: { id: string } }>('/api/v1/admin/permissions/grants/:id', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid grant ID.' });
  const claims = request.user as { sub?: string };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const revoked = await client.query(
      `UPDATE admin_permission_grants SET revoked_at = NOW(), revoked_by = $1
        WHERE id = $2 AND revoked_at IS NULL
        RETURNING id, grantee_user_id AS "userId", permission, reason, approval_reference AS "approvalReference"`,
      [claims.sub ?? null, request.params.id],
    );
    if (!revoked.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Active permission grant not found.' });
    }
    const grant = revoked.rows[0];
    await client.query(
      `INSERT INTO admin_permission_audit_log
        (actor_user_id, target_user_id, grant_id, action, permission, result, reason, approval_reference)
       VALUES ($1, $2, $3, 'grant_revoked', $4, 'success', $5, $6)`,
      [claims.sub ?? null, grant.userId, grant.id, grant.permission, grant.reason, grant.approvalReference],
    );
    await client.query('COMMIT');
    return { ok: true, revokedGrantId: grant.id };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not revoke permission grant');
    return reply.code(500).send({ error: 'Could not revoke permission grant.' });
  } finally {
    client.release();
  }
});

app.get('/api/v1/admin/permissions/audit', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`
    SELECT a.id, a.actor_user_id AS "actorUserId", actor.username AS "actorUsername",
           a.target_user_id AS "targetUserId", target.username AS "targetUsername",
           a.grant_id AS "grantId", a.action, a.permission, a.result, a.reason,
           a.approval_reference AS "approvalReference", a.details, a.created_at AS "createdAt"
      FROM admin_permission_audit_log a
      LEFT JOIN users actor ON actor.id = a.actor_user_id
      LEFT JOIN users target ON target.id = a.target_user_id
     ORDER BY a.created_at DESC, a.id DESC LIMIT 200
  `);
  return { entries: result.rows };
});

app.get('/api/v1/contact-methods', { onRequest: [requireMatchAuth] }, async () => {
  const result = await pool.query('SELECT id, label, value FROM app_contact_methods ORDER BY sort_order ASC, id ASC');
  return { methods: result.rows };
});

app.patch<{ Body: { methods?: Array<{ label?: string; value?: string }> } }>('/api/v1/admin/contact-methods', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const methods = request.body?.methods;
  if (!Array.isArray(methods) || methods.length > 20) return reply.code(400).send({ error: 'Provide at most 20 contact methods.' });
  const clean = methods.map((item) => ({
    label: typeof item.label === 'string' ? item.label.trim() : '',
    value: typeof item.value === 'string' ? item.value.trim() : '',
  })).filter((item) => item.label && item.value);
  if (clean.some((item) => item.label.length > 60 || item.value.length > 500)) {
    return reply.code(400).send({ error: 'Contact labels must be up to 60 characters and values up to 500 characters.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app_contact_methods');
    for (let i = 0; i < clean.length; i++) {
      await client.query('INSERT INTO app_contact_methods (label, value, sort_order) VALUES ($1, $2, $3)', [clean[i].label, clean[i].value, i]);
    }
    await client.query('COMMIT');
    return { methods: clean };
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error }, 'Could not save contact methods');
    return reply.code(500).send({ error: 'Could not save contact methods.' });
  } finally {
    client.release();
  }
});

app.get<{ Params: { userId: string } }>('/api/v1/admin/users/:userId/profile', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { userId } = request.params;
  if (!isNumericId(userId)) return reply.code(400).send({ error: 'Invalid user ID.' });
  const result = await pool.query(
    `SELECT u.id, u.username, u.email,
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



// SMS OTP configuration is owner-only and disabled by default. This endpoint only
// manages settings; it deliberately does not send messages or switch authentication flows.
app.get('/api/v1/admin/security/sms-otp', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`SELECT enabled, delivery_mode AS "deliveryMode", provider, sender_id AS "senderId",
      template_id AS "templateId", (encrypted_api_key <> '') AS "apiKeyConfigured",
      otp_ttl_seconds AS "otpTtlSeconds", resend_cooldown_seconds AS "resendCooldownSeconds",
      max_attempts AS "maxAttempts", daily_limit AS "dailyLimit", updated_at AS "updatedAt"
    FROM sms_otp_settings WHERE id = 1`);
  return { settings: result.rows[0] ?? { enabled: false, deliveryMode: 'disabled', provider: '', senderId: '', templateId: '', apiKeyConfigured: false, otpTtlSeconds: 120, resendCooldownSeconds: 60, maxAttempts: 5, dailyLimit: 100 } };
});

app.patch<{ Body: { enabled?: boolean; deliveryMode?: string; provider?: string; senderId?: string; templateId?: string; apiKey?: string; clearApiKey?: boolean; otpTtlSeconds?: number; resendCooldownSeconds?: number; maxAttempts?: number; dailyLimit?: number } }>('/api/v1/admin/security/sms-otp', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const body = request.body ?? {};
  const currentResult = await pool.query('SELECT * FROM sms_otp_settings WHERE id = 1');
  const current = currentResult.rows[0];
  const mode = body.deliveryMode ?? current.delivery_mode;
  const provider = typeof body.provider === 'string' ? body.provider.trim() : current.provider;
  const senderId = typeof body.senderId === 'string' ? body.senderId.trim() : current.sender_id;
  const templateId = typeof body.templateId === 'string' ? body.templateId.trim() : current.template_id;
  const ttl = body.otpTtlSeconds ?? current.otp_ttl_seconds;
  const cooldown = body.resendCooldownSeconds ?? current.resend_cooldown_seconds;
  const attempts = body.maxAttempts ?? current.max_attempts;
  const dailyLimit = body.dailyLimit ?? current.daily_limit;
  if (typeof mode !== 'string' || !['disabled', 'development_simulator', 'real_provider'].includes(mode) ||
      (body.enabled !== undefined && typeof body.enabled !== 'boolean') || provider.length > 80 || senderId.length > 120 || templateId.length > 120 ||
      !Number.isInteger(ttl) || ttl < 60 || ttl > 600 || !Number.isInteger(cooldown) || cooldown < 30 || cooldown > 600 ||
      !Number.isInteger(attempts) || attempts < 3 || attempts > 10 || !Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 100000 ||
      (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 2048))) {
    return reply.code(400).send({ error: 'Invalid SMS OTP settings.' });
  }
  // Enabling real delivery is intentionally blocked until a provider adapter and
  // connection/test workflow are implemented and reviewed.
  if (body.enabled === true || mode === 'real_provider') {
    return reply.code(409).send({ error: 'SMS delivery remains disabled. Real-provider activation is not available yet.' });
  }
  let encryptedKey = body.clearApiKey === true ? '' : current.encrypted_api_key;
  if (body.apiKey) {
    const keyText = process.env.SMS_CREDENTIALS_ENCRYPTION_KEY?.trim() ?? '';
    let key: Buffer;
    try { key = Buffer.from(keyText, 'base64'); } catch { key = Buffer.alloc(0); }
    if (key.length !== 32) return reply.code(503).send({ error: 'Server-side SMS credentials encryption is not configured.' });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(body.apiKey, 'utf8'), cipher.final()]);
    encryptedKey = [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
  }
  const claims = request.user as { sub?: string };
  await pool.query(`UPDATE sms_otp_settings SET enabled = FALSE, delivery_mode = $1, provider = $2, sender_id = $3,
      template_id = $4, encrypted_api_key = $5, otp_ttl_seconds = $6, resend_cooldown_seconds = $7,
      max_attempts = $8, daily_limit = $9, updated_by = $10, updated_at = NOW() WHERE id = 1`,
    [mode === 'real_provider' ? 'disabled' : mode, provider, senderId, templateId, encryptedKey, ttl, cooldown, attempts, dailyLimit, claims.sub ?? null]);
  await pool.query('INSERT INTO sms_otp_audit_log (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
    [claims.sub ?? null, 'settings_updated', JSON.stringify({ enabled: false, deliveryMode: mode === 'real_provider' ? 'disabled' : mode, provider, apiKeyChanged: Boolean(body.apiKey) || body.clearApiKey === true })]);
  return { ok: true, settings: { enabled: false, deliveryMode: mode === 'real_provider' ? 'disabled' : mode, provider, senderId, templateId,
    apiKeyConfigured: Boolean(encryptedKey), otpTtlSeconds: ttl, resendCooldownSeconds: cooldown, maxAttempts: attempts, dailyLimit } };
});

app.get('/api/v1/admin/security/sms-otp/audit', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`SELECT l.id, l.action, l.details, l.created_at AS "createdAt", u.username AS "actorUsername"
    FROM sms_otp_audit_log l LEFT JOIN users u ON u.id = l.actor_user_id ORDER BY l.created_at DESC LIMIT 100`);
  return { entries: result.rows };
});


/**
 * Development-only OTP simulator. It deliberately does not authenticate users,
 * issue JWTs, or send real SMS. Production requests are rejected even if the
 * database settings are accidentally changed.
 */
app.post<{ Body: { phone?: string } }>('/api/v1/auth/phone-otp/request', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const phone = normalizeIranianMobile(request.body?.phone);
  if (!phone) return reply.code(400).send({ error: 'Enter a valid Iranian mobile number.' });
  if (process.env.NODE_ENV === 'production') {
    return reply.code(503).send({ error: 'Phone OTP is not available.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent sends for the same normalized phone so requests cannot
    // race around the cooldown/daily-limit checks.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    const settingsResult = await client.query(
      'SELECT delivery_mode, otp_ttl_seconds, resend_cooldown_seconds, max_attempts, daily_limit FROM sms_otp_settings WHERE id = 1',
    );
    const settings = settingsResult.rows[0];
    if (settings?.delivery_mode !== 'development_simulator') {
      await client.query('ROLLBACK');
      return reply.code(503).send({ error: 'Phone OTP simulator is disabled.' });
    }
    const usage = await client.query(
      `SELECT COUNT(*)::int AS daily_count,
              MAX(created_at) AS last_created_at
         FROM sms_otp_challenges
        WHERE phone_e164 = $1 AND created_at >= NOW() - INTERVAL '1 day'`,
      [phone],
    );
    const row = usage.rows[0] ?? {};
    if (Number(row.daily_count ?? 0) >= Number(settings.daily_limit ?? 0)) {
      await client.query('ROLLBACK');
      return reply.code(429).send({ error: 'OTP request limit reached. Try again later.' });
    }
    if (row.last_created_at &&
        Date.now() - new Date(row.last_created_at).getTime() < Number(settings.resend_cooldown_seconds) * 1000) {
      await client.query('ROLLBACK');
      return reply.code(429).send({ error: 'Please wait before requesting another code.' });
    }

    // Supersede every previous outstanding challenge before issuing a new one.
    await client.query(
      'UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE phone_e164 = $1 AND consumed_at IS NULL',
      [phone],
    );
    const code = createOtpCode();
    const digest = digestOtp(code);
    await client.query(
      `INSERT INTO sms_otp_challenges
         (phone_e164, otp_salt, otp_digest, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))`,
      [phone, digest.salt, digest.digest, settings.max_attempts, settings.otp_ttl_seconds],
    );
    await client.query('COMMIT');
    // Do not log the phone number or OTP. The code is exposed only by this
    // development-only simulator response and can never be returned in production.
    return reply.code(202).send({
      ok: true,
      message: 'If the number is eligible, a verification code is available in the development simulator.',
      testCode: code,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Phone OTP simulator request failed');
    return reply.code(500).send({ error: 'Could not request a verification code.' });
  } finally {
    client.release();
  }
});

app.post<{ Body: { phone?: string; code?: string } }>('/api/v1/auth/phone-otp/verify', {
  config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const phone = normalizeIranianMobile(request.body?.phone);
  const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
  if (!phone || !/^\d{6}$/.test(code)) {
    return reply.code(400).send({ error: 'Enter a valid Iranian mobile number and six-digit code.' });
  }
  if (process.env.NODE_ENV === 'production') {
    return reply.code(503).send({ error: 'Phone OTP is not available.' });
  }
  const settingsResult = await pool.query('SELECT delivery_mode FROM sms_otp_settings WHERE id = 1');
  if (settingsResult.rows[0]?.delivery_mode !== 'development_simulator') {
    return reply.code(503).send({ error: 'Phone OTP simulator is disabled.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, otp_salt, otp_digest, attempts, max_attempts, expires_at, consumed_at
         FROM sms_otp_challenges
        WHERE phone_e164 = $1 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone],
    );
    const challenge = found.rows[0];
    if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now() ||
        Number(challenge.attempts) >= Number(challenge.max_attempts)) {
      if (challenge) {
        await client.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
      }
      await client.query('COMMIT');
      return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
    }
    const matches = verifyOtpDigest(code, { salt: challenge.otp_salt, digest: challenge.otp_digest });
    if (!matches) {
      const nextAttempts = Number(challenge.attempts) + 1;
      await client.query(
        'UPDATE sms_otp_challenges SET attempts = $1, consumed_at = CASE WHEN $1 >= max_attempts THEN NOW() ELSE consumed_at END WHERE id = $2',
        [nextAttempts, challenge.id],
      );
      await client.query('COMMIT');
      return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
    }
    await client.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
    await client.query('COMMIT');
    // This endpoint proves only possession of the simulator code. It does not
    // create/link an account or issue an access token.
    return { verified: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Phone OTP simulator verification failed');
    return reply.code(500).send({ error: 'Could not verify the code.' });
  } finally {
    client.release();
  }
});

app.get('/api/v1/admin/reports', { onRequest: [requireOwnerOrPermission('reports.read')] }, async () => {
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

app.patch<{ Params: { id: string }; Body: { status?: string } }>('/api/v1/admin/reports/:id', { onRequest: [requireOwnerOrPermission('reports.manage', async (request) => {
  if (!isNumericId(request.params?.id)) return undefined;
  const target = await pool.query('SELECT reported_user_id::text AS id FROM user_reports WHERE id = $1', [request.params.id]);
  return target.rows[0]?.id;
})] }, async (request, reply) => {
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
    `SELECT u.id AS "userId", u.username,
            u.avatar_data_url AS "avatarDataUrl",
            latest.body AS "lastMessage", latest.deleted_for_all AS "lastMessageDeleted",
            latest.created_at AS "lastMessageAt",
            COALESCE(unread.count, 0)::int AS "unreadCount"
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN LATERAL (
         SELECT body, deleted_for_all, created_at FROM private_messages
          WHERE (sender_id = $1 AND recipient_id = u.id) OR (sender_id = u.id AND recipient_id = $1)
          ORDER BY created_at DESC LIMIT 1
       ) latest ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS count FROM private_messages
          WHERE sender_id = u.id AND recipient_id = $1 AND read_at IS NULL
       ) unread ON TRUE
      WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
      ORDER BY latest.created_at DESC NULLS LAST, LOWER(u.username) ASC`,
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
    `SELECT id, sender_id AS "senderId", recipient_id AS "recipientId",
            CASE WHEN deleted_for_all THEN '[پیام حذف شده]' ELSE body END AS body,
            deleted_for_all AS "deletedForAll", edited_at AS "editedAt",
            created_at AS "createdAt", read_at AS "readAt"
       FROM private_messages
      WHERE ((sender_id = $1 AND recipient_id = $2 AND hidden_for_sender = FALSE)
         OR (sender_id = $2 AND recipient_id = $1 AND hidden_for_recipient = FALSE))
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
  const isImage = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body);
  if (!isNumericId(userId) || userId === claims.sub || !body || (isImage ? body.length > 680000 : body.length > 2000)) {
    return reply.code(400).send({ error: 'Message must be text up to 2000 characters or a supported image up to 500 KB.' });
  }
  const friendship = await pool.query(
    'SELECT 1 FROM friendships WHERE status = $1 AND ((requester_id = $2 AND addressee_id = $3) OR (requester_id = $3 AND addressee_id = $2)) LIMIT 1',
    ['accepted', claims.sub, userId],
  );
  if (!friendship.rowCount) return reply.code(403).send({ error: 'Chat is available only between accepted friends.' });
  const inserted = await pool.query(
    `INSERT INTO private_messages (sender_id, recipient_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id AS "senderId", recipient_id AS "recipientId", body,
       deleted_for_all AS "deletedForAll", edited_at AS "editedAt", created_at AS "createdAt", read_at AS "readAt"`,
    [claims.sub, userId, body],
  );
  return reply.code(201).send({ message: inserted.rows[0] });
});

app.patch<{ Params: { userId: string; messageId: string }; Body: { body?: string } }>('/api/v1/chat/:userId/messages/:messageId', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId, messageId } = request.params;
  const body = typeof request.body?.body === 'string' ? request.body.body.trim() : '';
  if (!isNumericId(userId) || !isNumericId(messageId) || !body || body.length > 2000 || body.startsWith('data:image/')) {
    return reply.code(400).send({ error: 'Only text messages up to 2000 characters can be edited.' });
  }
  const result = await pool.query(
    `UPDATE private_messages SET body = $1, edited_at = NOW()
      WHERE id = $2 AND sender_id = $3 AND recipient_id = $4 AND deleted_for_all = FALSE
      RETURNING id, body, edited_at AS "editedAt"`,
    [body, messageId, claims.sub, userId],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Only your own existing messages can be edited.' });
  return { message: result.rows[0] };
});

app.delete<{ Params: { userId: string }; Body: { messageIds?: string[]; scope?: 'me' | 'both' } }>('/api/v1/chat/:userId/messages', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const { userId } = request.params;
  const ids = Array.isArray(request.body?.messageIds) ? [...new Set(request.body.messageIds.filter((id) => isNumericId(id)))] : [];
  const scope = request.body?.scope;
  if (!isNumericId(userId) || userId === claims.sub || ids.length < 1 || ids.length > 100 || !['me', 'both'].includes(String(scope))) {
    return reply.code(400).send({ error: 'Provide message IDs and a valid deletion scope.' });
  }
  if (scope === 'both') {
    const result = await pool.query(
      `UPDATE private_messages SET deleted_for_all = TRUE, body = '[پیام حذف شده]'
        WHERE id = ANY($1::bigint[]) AND sender_id = $2 AND recipient_id = $3 AND deleted_for_all = FALSE
        RETURNING id`,
      [ids, claims.sub, userId],
    );
    return { deleted: result.rowCount ?? 0, scope };
  }
  const result = await pool.query(
    `UPDATE private_messages
        SET hidden_for_sender = CASE WHEN sender_id = $2 THEN TRUE ELSE hidden_for_sender END,
            hidden_for_recipient = CASE WHEN recipient_id = $2 THEN TRUE ELSE hidden_for_recipient END
      WHERE id = ANY($1::bigint[]) AND ((sender_id = $2 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $2))
      RETURNING id`,
    [ids, claims.sub, userId],
  );
  return { deleted: result.rowCount ?? 0, scope };
});

app.get('/api/v1/notifications', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  // Invite notifications are intentionally ephemeral: clear expired cards even
  // when the user visits Notifications rather than the game lobby.
  await pool.query(
    `DELETE FROM notifications
      WHERE user_id = $1 AND data ? 'inviteId'
        AND created_at <= NOW() - INTERVAL '10 seconds'`,
    [claims.sub],
  );
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
  const clearedInvite = await pool.query(
    `DELETE FROM notifications
      WHERE id = $1 AND user_id = $2 AND data ? 'inviteId'
      RETURNING id`,
    [id, claims.sub],
  );
  if (clearedInvite.rowCount) {
    return { notification: { id: clearedInvite.rows[0].id, readAt: new Date().toISOString() }, cleared: true };
  }
  const result = await pool.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id, read_at AS "readAt"',
    [id, claims.sub],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Notification not found.' });
  return { notification: result.rows[0], cleared: false };
});

app.post('/api/v1/notifications/read-all', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
    [claims.sub],
  );
  return { status: 'ok', updated: result.rowCount ?? 0 };
});
app.delete('/api/v1/notifications', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    'DELETE FROM notifications WHERE user_id = $1',
    [claims.sub],
  );
  return { deleted: result.rowCount ?? 0 };
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


// Backgammon level is derived from Elo rating: level 1 below 1100,
// then one level per 100 rating points, capped at level 10 from 1900 onward.
app.get('/api/v1/leaderboard', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT s.user_id AS "userId", u.username, u.avatar_data_url AS "avatarDataUrl", s.rating,
            GREATEST(1, LEAST(10, FLOOR((s.rating - 1000) / 100.0)::int + 1))::int AS level,
            s.games_played AS "gamesPlayed", s.wins, s.losses
       FROM backgammon_player_stats s
       JOIN users u ON u.id = s.user_id
      WHERE s.games_played > 0
      ORDER BY s.rating DESC, s.wins DESC, s.games_played ASC, LOWER(u.username) ASC
      LIMIT 50`,
  );
  return { leaderboard: result.rows, currentUserId: claims.sub };
});

app.get('/api/v1/leaderboard/weekly', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `WITH completed AS (
       SELECT id, host_user_id, guest_user_id,
              COALESCE(winner_user_id,
                CASE WHEN COALESCE((off_state->>'host')::int, 0) >= 15 THEN host_user_id
                     WHEN COALESCE((off_state->>'guest')::int, 0) >= 15 THEN guest_user_id
                     ELSE NULL END) AS winner_user_id
         FROM backgammon_matches
        WHERE status = 'finished' AND updated_at >= NOW() - INTERVAL '7 days'
     ), participants AS (
       SELECT host_user_id AS user_id, winner_user_id
         FROM completed WHERE winner_user_id IS NOT NULL
       UNION ALL
       SELECT guest_user_id AS user_id, winner_user_id
         FROM completed WHERE winner_user_id IS NOT NULL
     )
     SELECT p.user_id AS "userId", u.username,
            u.avatar_data_url AS "avatarDataUrl",
            COALESCE(s.rating, 1000)::int AS rating,
            GREATEST(1, LEAST(10, FLOOR((COALESCE(s.rating, 1000) - 1000) / 100.0)::int + 1))::int AS level,
            COUNT(*)::int AS "gamesPlayed",
            COUNT(*) FILTER (WHERE p.winner_user_id = p.user_id)::int AS wins,
            COUNT(*) FILTER (WHERE p.winner_user_id <> p.user_id)::int AS losses,
            (COUNT(*) FILTER (WHERE p.winner_user_id = p.user_id) * 3)::int AS score
       FROM participants p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN backgammon_player_stats s ON s.user_id = p.user_id
      GROUP BY p.user_id, u.username, u.avatar_data_url, s.rating
      ORDER BY score DESC, wins DESC, "gamesPlayed" ASC, LOWER(u.username) ASC
      LIMIT 50`,
  );
  return { leaderboard: result.rows, currentUserId: claims.sub, period: '7d', pointsPerWin: 3 };
});

app.get('/api/v1/matches/history', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.host_user_id AS "hostUserId",
            m.guest_user_id AS "guestUserId", m.status,
            m.off_state AS "offState", m.created_at AS "createdAt", m.updated_at AS "finishedAt",
            CASE WHEN m.host_user_id = $1 THEN guest.username ELSE host.username END AS "opponentName",
            CASE WHEN m.host_user_id = $1 THEN guest.avatar_data_url ELSE host.avatar_data_url END AS "opponentAvatarDataUrl",
            COALESCE(m.winner_user_id,
              CASE WHEN COALESCE((m.off_state->>'host')::int, 0) >= 15 THEN m.host_user_id
                   WHEN COALESCE((m.off_state->>'guest')::int, 0) >= 15 THEN m.guest_user_id
                   ELSE NULL END) AS "winnerUserId",
            CASE WHEN COALESCE(m.winner_user_id,
                    CASE WHEN COALESCE((m.off_state->>'host')::int, 0) >= 15 THEN m.host_user_id
                         WHEN COALESCE((m.off_state->>'guest')::int, 0) >= 15 THEN m.guest_user_id
                         ELSE NULL END) = $1 THEN 'win'
                 WHEN COALESCE(m.winner_user_id,
                    CASE WHEN COALESCE((m.off_state->>'host')::int, 0) >= 15 THEN m.host_user_id
                         WHEN COALESCE((m.off_state->>'guest')::int, 0) >= 15 THEN m.guest_user_id
                         ELSE NULL END) IS NOT NULL THEN 'loss'
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

app.get('/api/v1/matches/live', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status, m.updated_at AS "updatedAt",
            host.username AS "hostName", host.avatar_data_url AS "hostAvatarDataUrl",
            guest.username AS "guestName", guest.avatar_data_url AS "guestAvatarDataUrl"
       FROM backgammon_matches m
       JOIN users host ON host.id = m.host_user_id
       JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.status = 'active' AND m.spectators_enabled = TRUE
        AND $1 NOT IN (m.host_user_id, m.guest_user_id)
        AND (
          EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
            AND LEAST(f.requester_id, f.addressee_id) = LEAST($1::bigint, m.host_user_id)
            AND GREATEST(f.requester_id, f.addressee_id) = GREATEST($1::bigint, m.host_user_id))
          OR EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
            AND LEAST(f.requester_id, f.addressee_id) = LEAST($1::bigint, m.guest_user_id)
            AND GREATEST(f.requester_id, f.addressee_id) = GREATEST($1::bigint, m.guest_user_id))
        )
      ORDER BY m.updated_at DESC LIMIT 30`,
    [claims.sub],
  );
  return { matches: result.rows };
});

app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>('/api/v1/matches/:id/spectators', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id) || typeof request.body?.enabled !== 'boolean') {
    return reply.code(400).send({ error: 'A valid match id and enabled flag are required.' });
  }
  const result = await pool.query(
    `UPDATE backgammon_matches
        SET spectators_enabled = $3, updated_at = NOW()
      WHERE id = $1 AND host_user_id = $2 AND status IN ('waiting', 'active')
      RETURNING id, spectators_enabled AS "spectatorsEnabled"`,
    [request.params.id, claims.sub, request.body.enabled],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Only the host can change spectator access for an available match.' });
  return { settings: result.rows[0] };
});
app.get('/api/v1/matches/open', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status, m.created_at AS "createdAt", u.username AS "hostName", u.avatar_data_url AS "hostAvatarDataUrl"
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
              expires_at = NOW() + INTERVAL '30 minutes', updated_at = NOW()
         WHERE id = $2`,
      [claims.sub, match.id]);
    await client.query('COMMIT');
    const joined = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode", m.status, host.username AS "hostName",
              guest.username AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
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
    `SELECT m.id, m.room_code AS "roomCode", m.status, host.username AS "hostName",
            guest.username AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
            guest.avatar_data_url AS "guestAvatarDataUrl", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            (m.host_user_id = $2) AS "isHost", m.match_to_win AS "matchToWin",
            m.host_settings_accepted AS "hostSettingsAccepted", m.guest_settings_accepted AS "guestSettingsAccepted",
            m.host_ready AS "hostReady", m.guest_ready AS "guestReady",
            m.host_game_wins AS "hostGameWins", m.guest_game_wins AS "guestGameWins",
            COALESCE(h2h.matches_played, 0)::int AS "headToHeadMatches",
            COALESCE(h2h.host_game_points, 0)::int AS "headToHeadHostPoints",
            COALESCE(h2h.guest_game_points, 0)::int AS "headToHeadGuestPoints",
            COALESCE(h2h.host_match_wins, 0)::int AS "headToHeadHostWins",
            COALESCE(h2h.guest_match_wins, 0)::int AS "headToHeadGuestWins",
            m.cancellation_proposed_by AS "cancellationProposedBy", (m.cancellation_proposed_by = $2) AS "cancellationProposedByMe",
            m.spectators_enabled AS "spectatorsEnabled"
       FROM backgammon_matches m JOIN users host ON host.id = m.host_user_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS matches_played,
                COALESCE(SUM(CASE WHEN h.host_user_id = m.host_user_id THEN h.host_game_wins ELSE h.guest_game_wins END), 0) AS host_game_points,
                COALESCE(SUM(CASE WHEN h.host_user_id = m.host_user_id THEN h.guest_game_wins ELSE h.host_game_wins END), 0) AS guest_game_points,
                COALESCE(SUM(CASE WHEN h.winner_user_id = m.host_user_id THEN 1 ELSE 0 END), 0) AS host_match_wins,
                COALESCE(SUM(CASE WHEN h.winner_user_id = m.guest_user_id THEN 1 ELSE 0 END), 0) AS guest_match_wins
           FROM backgammon_matches h
          WHERE m.guest_user_id IS NOT NULL AND h.status = 'finished'
            AND h.guest_user_id IS NOT NULL
            AND ((h.host_user_id = m.host_user_id AND h.guest_user_id = m.guest_user_id)
              OR (h.host_user_id = m.guest_user_id AND h.guest_user_id = m.host_user_id))
       ) h2h ON TRUE
       LEFT JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.id = $1 AND (m.host_user_id = $2 OR m.guest_user_id = $2) AND m.expires_at > NOW()`,
    [request.params.id, claims.sub]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  return { match: result.rows[0] };
});

app.get('/api/v1/match-invites', { onRequest: [requireMatchAuth] }, async (request) => {
  const claims = request.user as { sub: string };
  // Hard-delete expired waiting rooms, their invitation rows, and invitation notices.
  await pool.query(`
    WITH expired AS (
      SELECT id FROM backgammon_matches WHERE status = 'waiting' AND guest_user_id IS NULL AND expires_at <= NOW()
    ), notices AS (
      DELETE FROM notifications
       WHERE data->>'matchId' IN (SELECT id::text FROM expired)
       RETURNING id
    )
    DELETE FROM backgammon_matches WHERE id IN (SELECT id FROM expired)
  `);
  // Invitation cards expire after 10 seconds. Mark them responded without
  // deleting the waiting room, so the host can invite the same friend again.
  await pool.query(
    `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW()
      WHERE invitee_id = $1 AND status = 'pending'
        AND created_at <= NOW() - INTERVAL '10 seconds'`,
    [claims.sub]);
  await pool.query(
    `DELETE FROM notifications
      WHERE user_id = $1 AND data ? 'inviteId'
        AND data->>'inviteId' IN (
          SELECT id::text FROM backgammon_match_invites
           WHERE invitee_id = $1 AND status = 'rejected'
             AND responded_at >= NOW() - INTERVAL '1 minute'
        )`,
    [claims.sub]);
  const result = await pool.query(
    `SELECT i.id, i.match_id AS "matchId", i.status, i.created_at AS "createdAt",
            (i.created_at + INTERVAL '10 seconds') AS "expiresAt",
            m.room_code AS "roomCode", m.status AS "matchStatus",
            inviter.username AS "inviterUsername",
            inviter.avatar_data_url AS "inviterAvatarDataUrl"
       FROM backgammon_match_invites i
       JOIN backgammon_matches m ON m.id = i.match_id
       JOIN users inviter ON inviter.id = i.inviter_id
      WHERE i.invitee_id = $1 AND i.status = 'pending' AND m.status = 'waiting'
        AND m.guest_user_id IS NULL AND m.expires_at > NOW()
        AND i.created_at > NOW() - INTERVAL '10 seconds'
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
      // Expire this friend's old invitation before inserting a replacement.
      // This lets the host re-invite after the 10-second card timeout even if
      // the invitee has not reopened the lobby to trigger its cleanup endpoint.
      await client.query(
        `UPDATE backgammon_match_invites
            SET status = 'rejected', responded_at = NOW()
          WHERE match_id = $1 AND invitee_id = $2 AND status = 'pending'
            AND created_at <= NOW() - INTERVAL '10 seconds'`,
        [request.params.id, inviteeId]);
      await client.query(
        `DELETE FROM notifications
          WHERE user_id = $1 AND data->>'inviteId' IN (
            SELECT id::text FROM backgammon_match_invites
             WHERE match_id = $2 AND invitee_id = $1 AND status = 'rejected'
               AND responded_at >= NOW() - INTERVAL '1 minute'
          )`,
        [inviteeId, request.params.id]);

      // Keep the waiting room available for 60 seconds, while each invitation
      // card itself remains valid for only 10 seconds.
      await client.query(
        `UPDATE backgammon_matches SET expires_at = NOW() + INTERVAL '60 seconds', updated_at = NOW()
          WHERE id = $1`,
        [request.params.id]);
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
      const freshInvite = await client.query(
        `SELECT created_at > NOW() - INTERVAL '10 seconds' AS fresh
           FROM backgammon_match_invites WHERE id = $1`,
        [request.params.id]);
      if (!freshInvite.rows[0]?.fresh) {
        await client.query(
          `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
          [request.params.id]);
        await client.query(
          `DELETE FROM notifications WHERE data->>'inviteId' = $1`,
          [request.params.id]);
        await client.query('COMMIT');
        return reply.code(410).send({ error: 'This invitation has expired.' });
      }
      if (!request.body.accept) {
        await client.query(
          `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
          [request.params.id]);
        await client.query(
          `DELETE FROM notifications WHERE data->>'inviteId' = $1`,
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
           cancellation_accepted_by = NULL, expires_at = NOW() + INTERVAL '30 minutes',
           updated_at = NOW() WHERE id = $2`,
        [claims.sub, invite.match_id]);
      await client.query(
        `UPDATE backgammon_match_invites SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'rejected' END,
           responded_at = NOW() WHERE match_id = $2 AND status = 'pending'`,
        [request.params.id, invite.match_id]);
      // Remove the in-app invitation notice as soon as it is accepted.
      await client.query(`DELETE FROM notifications WHERE data->>'inviteId' = $1 OR data->>'matchId' = $2`,
        [request.params.id, invite.match_id.toString()]);
      await client.query('COMMIT');
      const match = await pool.query(
        `SELECT m.id, m.room_code AS "roomCode", m.status, host.username AS "hostName",
                guest.username AS "guestName", host.avatar_data_url AS "hostAvatarDataUrl",
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
          await client.query(`UPDATE backgammon_matches SET ${updates.join(', ')} WHERE id = $${values.length}`, values);
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
             expires_at = NOW() + INTERVAL '30 minutes', updated_at = NOW() WHERE id = $1 AND status = 'waiting'`, [request.params.id]);
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

// A player can resign an active online match. The server records the winner and rating atomically.
app.post<{ Params: { id: string }; Body: { scope?: 'game' | 'match' } }>(
  '/api/v1/matches/:id/resign',
  { onRequest: [requireMatchAuth] },
  async (request, reply) => {
    const claims = request.user as { sub: string };
    const scope = request.body?.scope;
    if (!isNumericId(request.params.id) || !['game', 'match'].includes(String(scope))) {
      return reply.code(400).send({ error: "Provide a valid match id and scope ('game' or 'match')." });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, status, host_user_id, guest_user_id, winner_user_id,
                match_to_win, host_game_wins, guest_game_wins
           FROM backgammon_matches
          WHERE id = $1 AND expires_at > NOW()
          FOR UPDATE`,
        [request.params.id],
      );
      const match = found.rows[0] as {
        id: string; status: string; host_user_id: string;
        guest_user_id: string | null; winner_user_id: string | null;
        match_to_win: number; host_game_wins: number; guest_game_wins: number;
      } | undefined;
      if (!match || ![match.host_user_id, match.guest_user_id].includes(claims.sub)) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Match not found.' });
      }
      if (match.status !== 'active' || !match.guest_user_id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Only an active online match can be resigned.' });
      }
      if (match.winner_user_id) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'This match already has a recorded winner.' });
      }
      const winnerUserId = match.host_user_id === claims.sub
        ? match.guest_user_id
        : match.host_user_id;

      if (scope === 'match') {
        await client.query(
          `UPDATE backgammon_matches
              SET status = 'finished', winner_user_id = $1, finish_reason = 'resignation',
                  dice = '[]'::jsonb, remaining_dice = '[]'::jsonb,
                  cancellation_proposed_by = NULL, cancellation_accepted_by = NULL,
                  state_version = state_version + 1, updated_at = NOW()
            WHERE id = $2`,
          [winnerUserId, match.id],
        );
        await updateBackgammonRatings(client, winnerUserId, claims.sub);
        await client.query('COMMIT');
        return { result: { status: 'finished', scope, winnerUserId, loserUserId: claims.sub, reason: 'resignation' } };
      }

      const hostWonGame = winnerUserId === match.host_user_id;
      const nextHostWins = Number(match.host_game_wins ?? 0) + (hostWonGame ? 1 : 0);
      const nextGuestWins = Number(match.guest_game_wins ?? 0) + (hostWonGame ? 0 : 1);
      const matchFinished = Math.max(nextHostWins, nextGuestWins) >= Number(match.match_to_win ?? 1);
      await client.query(
        `UPDATE backgammon_matches
            SET status = $1,
                winner_user_id = CASE WHEN $1 = 'finished' THEN $2 ELSE NULL END,
                finish_reason = CASE WHEN $1 = 'finished' THEN 'resignation' ELSE NULL END,
                host_game_wins = $3, guest_game_wins = $4,
                board_state = CASE WHEN $1 = 'active' THEN $5::jsonb ELSE board_state END,
                bar_state = CASE WHEN $1 = 'active' THEN '{"host":0,"guest":0}'::jsonb ELSE bar_state END,
                off_state = CASE WHEN $1 = 'active' THEN '{"host":0,"guest":0}'::jsonb ELSE off_state END,
                current_turn_user_id = CASE WHEN $1 = 'active' THEN $6 ELSE NULL END,
                dice = '[]'::jsonb, remaining_dice = '[]'::jsonb,
                cancellation_proposed_by = NULL, cancellation_accepted_by = NULL,
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $7`,
        [matchFinished ? 'finished' : 'active', winnerUserId, nextHostWins, nextGuestWins,
         JSON.stringify(INITIAL_BACKGAMMON_BOARD), winnerUserId, match.id],
      );
      if (matchFinished) {
        await updateBackgammonRatings(client, winnerUserId, claims.sub);
      }
      await client.query('COMMIT');
      return { result: {
        status: matchFinished ? 'finished' : 'active',
        scope, winnerUserId, loserUserId: claims.sub, reason: 'resignation',
        hostGameWins: nextHostWins, guestGameWins: nextGuestWins,
        matchToWin: Number(match.match_to_win ?? 1),
      } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not resign online match');
      return reply.code(500).send({ error: 'Could not resign online match.' });
    } finally {
      client.release();
    }
  },
);

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
app.get<{ Params: { id: string } }>('/api/v1/matches/:id/spectate', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const result = await pool.query(
    `SELECT m.id, m.room_code AS "roomCode", m.status,
            host.username AS "hostName", host.avatar_data_url AS "hostAvatarDataUrl",
            guest.username AS "guestName", guest.avatar_data_url AS "guestAvatarDataUrl",
            m.board_state AS board, m.bar_state AS bar, m.off_state AS off,
            m.current_turn_user_id AS "currentTurnUserId",
            m.dice, m.remaining_dice AS "remainingDice", m.state_version AS version,
            m.updated_at AS "updatedAt", m.spectators_enabled AS "spectatorsEnabled"
       FROM backgammon_matches m
       JOIN users host ON host.id = m.host_user_id
       JOIN users guest ON guest.id = m.guest_user_id
      WHERE m.id = $1 AND m.status = 'active' AND m.spectators_enabled = TRUE
        AND $2::bigint NOT IN (m.host_user_id, m.guest_user_id)
        AND (
          EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
            AND LEAST(f.requester_id, f.addressee_id) = LEAST($2::bigint, m.host_user_id)
            AND GREATEST(f.requester_id, f.addressee_id) = GREATEST($2::bigint, m.host_user_id))
          OR EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted'
            AND LEAST(f.requester_id, f.addressee_id) = LEAST($2::bigint, m.guest_user_id)
            AND GREATEST(f.requester_id, f.addressee_id) = GREATEST($2::bigint, m.guest_user_id))
        ) AND m.expires_at > NOW()`,
    [request.params.id, claims.sub],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'This match is not available for your spectator access.' });
  const row = result.rows[0];
  return {
    match: {
      id: row.id, roomCode: row.roomCode, status: row.status,
      hostName: row.hostName, hostAvatarDataUrl: row.hostAvatarDataUrl,
      guestName: row.guestName, guestAvatarDataUrl: row.guestAvatarDataUrl,
      spectatorsEnabled: row.spectatorsEnabled,
    },
    state: {
      id: row.id, status: row.status, board: row.board, bar: row.bar, off: row.off,
      currentTurnUserId: row.currentTurnUserId, isMyTurn: false, isHost: false,
      dice: row.dice, remainingDice: row.remainingDice, version: row.version, updatedAt: row.updatedAt,
    },
  };
});
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
