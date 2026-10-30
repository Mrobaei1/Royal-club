import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { Pool, type PoolClient } from 'pg';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { isNumericId, isValidRegistrationPassword } from './validation.js';
import { createOtpCode, digestOtp, normalizeIranianMobile, verifyOtpDigest } from './otp-security.js';
import { createKavenegarProvider } from './sms-provider.js';
import { getAllowedCorsOrigins } from './cors-config.js';
import { normalizeDatabaseConnectionString } from './database-config.js';
import { INITIAL_BACKGAMMON_BOARD, applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';
import { calculateEloRatings } from './backgammon-rating.js';
import { nextProgressionState } from './player-progression.js';
import { chooseTemporaryAiTurn } from './disconnect-takeover.js';
import { hasRoyalPermission, isRoyalPermission } from './permissions.js';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

function decryptSmsApiKey(encrypted: string): string | null {
  const keyText = process.env.SMS_CREDENTIALS_ENCRYPTION_KEY?.trim() ?? '';
  const key = Buffer.from(keyText, 'base64');
  const [ivText, tagText, ciphertextText] = encrypted.split('.');
  if (key.length !== 32 || !ivText || !tagText || !ciphertextText) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}
// Derive a domain-separated OTP pepper so OTP digests do not reuse the JWT key directly.
const otpPepper = secret ? createHmac('sha256', secret).update('royal-club:otp-pepper:v1').digest('hex') : '';

function otpRuntimeAllowed(settings: { enabled?: boolean; delivery_mode?: string; provider?: string } | undefined): { simulator: boolean; live: boolean } {
  const development = ['development', 'test'].includes(process.env.NODE_ENV ?? '');
  const simulator = development && settings?.delivery_mode === 'development_simulator';
  const live = process.env.NODE_ENV === 'production' &&
    settings?.enabled === true &&
    settings?.delivery_mode === 'real_provider' &&
    settings?.provider === 'kavenegar';
  return { simulator, live };
}

async function consumeOtpChallenge(
  client: PoolClient,
  phone: string,
  code: string,
  purpose: 'verify' | 'register' | 'login' | 'link',
): Promise<boolean> {
  const found = await client.query(
    `SELECT id, otp_salt, otp_digest, attempts, max_attempts, expires_at, consumed_at
       FROM sms_otp_challenges
      WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [phone, purpose],
  );
  const challenge = found.rows[0];
  if (!challenge) return false;
  if (new Date(challenge.expires_at).getTime() <= Date.now() ||
      Number(challenge.attempts) >= Number(challenge.max_attempts)) {
    await client.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
    return false;
  }
  if (!verifyOtpDigest(code, { salt: challenge.otp_salt, digest: challenge.otp_digest }, otpPepper)) {
    const nextAttempts = Number(challenge.attempts) + 1;
    await client.query(
      'UPDATE sms_otp_challenges SET attempts = $1, consumed_at = CASE WHEN $1 >= max_attempts THEN NOW() ELSE consumed_at END WHERE id = $2',
      [nextAttempts, challenge.id],
    );
    return false;
  }
  await client.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
  return true;
}

const app = Fastify({ logger: true, trustProxy: false });
const pool = new Pool({ connectionString: normalizeDatabaseConnectionString(process.env.DATABASE_URL) });

// Expire empty waiting rooms after 60 seconds and remove their related notices.
// The lazy calls also cover serverless runtimes where a persistent timer is not guaranteed.
async function cleanupExpiredEmptyRooms(): Promise<number> {
  const result = await pool.query(`
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
  return result.rowCount ?? 0;
}

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
// Keep integration suites from exhausting the production IP budget while preserving the production limit.
await app.register(rateLimit, { max: process.env.NODE_ENV === 'test' ? 500 : 120, timeWindow: '1 minute' });
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
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique_idx ON users (phone_e164) WHERE phone_e164 IS NOT NULL;



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
    purpose TEXT NOT NULL DEFAULT 'verify' CHECK (purpose IN ('verify', 'register', 'login', 'link')),
    otp_salt TEXT NOT NULL,
    otp_digest TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 3 AND 10),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE sms_otp_challenges ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'verify';
  CREATE INDEX IF NOT EXISTS sms_otp_challenges_phone_created_idx
    ON sms_otp_challenges (phone_e164, created_at DESC);
  CREATE INDEX IF NOT EXISTS sms_otp_challenges_expiry_idx
    ON sms_otp_challenges (expires_at) WHERE consumed_at IS NULL;

  -- Dormant delegated permissions: no grants are seeded and all grant management
  -- remains protected by the existing owner identity until explicitly assigned.
  CREATE TABLE IF NOT EXISTS admin_permission_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO admin_permission_settings (id, enabled) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;

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
  ALTER TABLE admin_permission_audit_log DROP CONSTRAINT IF EXISTS admin_permission_audit_log_action_check;
  ALTER TABLE admin_permission_audit_log ADD CONSTRAINT admin_permission_audit_log_action_check
    CHECK (action IN ('grant_created', 'grant_revoked', 'grant_rejected', 'kill_switch_changed'));
  -- Dormant Phase 4 agent control plane. Definitions are plans only; no runtime executes them.
  CREATE TABLE IF NOT EXISTS agent_task_definitions (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
    domain TEXT NOT NULL CHECK (domain IN (
      'membership', 'marketing', 'deposits', 'leagues', 'moderation',
      'operations', 'social', 'advertising', 'analytics'
    )),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    requested_capabilities JSONB NOT NULL DEFAULT '["read"]'::jsonb
      CHECK (jsonb_typeof(requested_capabilities) = 'array'),
    requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paused')),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS agent_task_proposals (
    id BIGSERIAL PRIMARY KEY,
    task_definition_id BIGINT NOT NULL REFERENCES agent_task_definitions(id) ON DELETE RESTRICT,
    requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    input JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object'),
    status TEXT NOT NULL DEFAULT 'awaiting_review'
      CHECK (status IN ('awaiting_review', 'rejected', 'cancelled')),
    review_reason TEXT NOT NULL DEFAULT '',
    reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS agent_task_proposals_status_created_idx
    ON agent_task_proposals (status, created_at DESC);
  CREATE TABLE IF NOT EXISTS agent_task_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    task_definition_id BIGINT REFERENCES agent_task_definitions(id) ON DELETE SET NULL,
    proposal_id BIGINT REFERENCES agent_task_proposals(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('definition_created', 'proposal_created', 'proposal_rejected', 'proposal_cancelled')),
    result TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error')),
    reason TEXT NOT NULL DEFAULT '',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS agent_task_audit_created_idx
    ON agent_task_audit_log (created_at DESC);


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

  -- League entry is free by default. Subscription-day consumption is opt-in per league
  -- and is kept separate from the wallet-credit ledger.
  CREATE TABLE IF NOT EXISTS leagues (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    entry_mode TEXT NOT NULL DEFAULT 'free'
      CHECK (entry_mode IN ('free', 'subscription_days')),
    subscription_days_cost INTEGER NOT NULL DEFAULT 0
      CHECK (subscription_days_cost BETWEEN 0 AND 30),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (entry_mode = 'free' AND subscription_days_cost = 0) OR
      (entry_mode = 'subscription_days' AND subscription_days_cost BETWEEN 1 AND 30)
    ),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
  );
  ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE TABLE IF NOT EXISTS league_entries (
    id BIGSERIAL PRIMARY KEY,
    league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, user_id),
    UNIQUE (user_id, idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS league_entries_league_created_idx
    ON league_entries (league_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS league_entitlement_ledger (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES user_subscriptions(id),
    league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    entry_id BIGINT NOT NULL UNIQUE REFERENCES league_entries(id) ON DELETE CASCADE,
    days_consumed INTEGER NOT NULL CHECK (days_consumed BETWEEN 1 AND 30),
    ends_at_before TIMESTAMPTZ NOT NULL,
    ends_at_after TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS league_entitlement_ledger_user_created_idx
    ON league_entitlement_ledger (user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS league_admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    league_id BIGINT REFERENCES leagues(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS league_rounds (
    id BIGSERIAL PRIMARY KEY,
    league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number > 0),
    stage TEXT NOT NULL DEFAULT 'regular' CHECK (stage IN ('regular', 'final')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
    starts_at TIMESTAMPTZ,
    manager_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (league_id, stage, round_number)
  );
  CREATE TABLE IF NOT EXISTS league_matches (
    id BIGSERIAL PRIMARY KEY,
    league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    round_id BIGINT NOT NULL REFERENCES league_rounds(id) ON DELETE CASCADE,
    player_one_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    player_two_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'scheduled'
      CHECK (status IN ('scheduled', 'in_progress', 'completed', 'bye', 'double_absent', 'technical_issue', 'rescheduled')),
    scheduled_at TIMESTAMPTZ,
    replacement_at TIMESTAMPTZ,
    winner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    score JSONB NOT NULL DEFAULT '{}'::jsonb,
    incident_note TEXT,
    completed_at TIMESTAMPTZ,
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (player_one_id IS NULL OR player_two_id IS NULL OR player_one_id <> player_two_id)
  );
  CREATE INDEX IF NOT EXISTS league_matches_league_round_idx ON league_matches (league_id, round_id);
  CREATE INDEX IF NOT EXISTS league_matches_players_idx ON league_matches (player_one_id, player_two_id, status);
  ALTER TABLE league_matches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS league_appeals (
    id BIGSERIAL PRIMARY KEY,
    league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    match_id BIGINT NOT NULL REFERENCES league_matches(id) ON DELETE CASCADE,
    appellant_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 2000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
    manager_note TEXT,
    resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    UNIQUE (match_id, appellant_user_id)
  );
  CREATE INDEX IF NOT EXISTS league_appeals_deadline_idx ON league_appeals (status, deadline_at);
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
  CREATE TABLE IF NOT EXISTS backgammon_match_presence (
    match_id BIGINT NOT NULL REFERENCES backgammon_matches(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    takeover_active BOOLEAN NOT NULL DEFAULT FALSE,
    takeover_started_at TIMESTAMPTZ,
    last_ai_action_at TIMESTAMPTZ,
    PRIMARY KEY (match_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS backgammon_match_presence_heartbeat_idx
    ON backgammon_match_presence (last_heartbeat_at, match_id);
  CREATE TABLE IF NOT EXISTS game_disconnect_policies (
    game_type TEXT PRIMARY KEY CHECK (game_type IN ('backgammon', 'cards', 'chess')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    grace_seconds INTEGER NOT NULL DEFAULT 18 CHECK (grace_seconds BETWEEN 5 AND 120),
    takeover_mode TEXT NOT NULL DEFAULT 'temporary_ai'
      CHECK (takeover_mode IN ('temporary_ai', 'wait_until_game_end', 'disabled')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO game_disconnect_policies (game_type, enabled, grace_seconds, takeover_mode)
  VALUES ('backgammon', TRUE, 18, 'temporary_ai'),
         ('cards', TRUE, 18, 'temporary_ai'),
         ('chess', TRUE, 18, 'wait_until_game_end')
  ON CONFLICT (game_type) DO NOTHING;
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
    xp_points INTEGER NOT NULL DEFAULT 0 CHECK (xp_points >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE backgammon_player_stats ADD COLUMN IF NOT EXISTS xp_points INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE backgammon_player_stats ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE IF NOT EXISTS backgammon_progression_events (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES backgammon_matches(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'quit')),
    points_delta INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, event_key, user_id)
  );
  CREATE INDEX IF NOT EXISTS backgammon_progression_user_idx
    ON backgammon_progression_events (user_id, created_at DESC);
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
    `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.country,
            u.avatar_data_url, u.created_at,
            COALESCE(s.xp_points, 0)::int AS "xpPoints",
            COALESCE(s.level, 1)::int AS level
       FROM users u LEFT JOIN backgammon_player_stats s ON s.user_id = u.id
      WHERE u.id = $1`,
    [claims.sub]
  );
  if (!result.rowCount) return reply.code(401).send({ error: 'Account not found.' });
  const user = result.rows[0] as { id: string; username: string | null; email: string; full_name: string; phone: string; country: string; avatar_data_url: string | null; created_at: Date; xpPoints: number; level: number };
  return { user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, avatarDataUrl: user.avatar_data_url ?? null, createdAt: user.created_at, xpPoints: user.xpPoints, level: user.level } };
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


/** Apply XP exactly once per match event and participant, inside the caller's transaction. */
async function awardProgression(
  client: PoolClient,
  matchId: string,
  eventKey: string,
  winnerUserId: string,
  loserUserId: string,
  loserOutcome: 'loss' | 'quit',
): Promise<void> {
  if (winnerUserId === loserUserId) throw new Error('Progression participants must differ.');
  const orderedIds = [winnerUserId, loserUserId].sort((left, right) => {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  await client.query(
    'INSERT INTO backgammon_player_stats (user_id) VALUES ($1), ($2) ON CONFLICT (user_id) DO NOTHING',
    orderedIds,
  );
  const locked = await client.query(
    `SELECT user_id, xp_points, level FROM backgammon_player_stats
      WHERE user_id = ANY($1::bigint[]) ORDER BY user_id FOR UPDATE`,
    [orderedIds],
  );
  const stats = new Map(locked.rows.map((row) => [String(row.user_id), row]));
  const entries = [
    { userId: winnerUserId, outcome: 'win' as const },
    { userId: loserUserId, outcome: loserOutcome },
  ];
  for (const entry of entries) {
    const inserted = await client.query(
      `INSERT INTO backgammon_progression_events
        (match_id, event_key, user_id, outcome, points_delta)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, event_key, user_id) DO NOTHING
       RETURNING user_id`,
      [matchId, eventKey, entry.userId, entry.outcome,
       entry.outcome === 'win' ? 20 : entry.outcome === 'loss' ? 5 : -5],
    );
    if (!inserted.rowCount) continue;
    const current = stats.get(entry.userId);
    if (!current) throw new Error('Could not lock progression stats.');
    const next = nextProgressionState(Number(current.xp_points), Number(current.level), entry.outcome);
    await client.query(
      `UPDATE backgammon_player_stats
          SET xp_points = $1, level = $2, updated_at = NOW()
        WHERE user_id = $3`,
      [next.xp, next.level, entry.userId],
    );
    current.xp_points = next.xp;
    current.level = next.level;
  }
}


/** Returns true when the player has lost control to the temporary AI. Must be called while the match row is locked. */
async function isTemporaryAiControlActive(client: PoolClient, matchId: string, userId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT p.takeover_active, p.last_heartbeat_at, d.enabled, d.takeover_mode, d.grace_seconds,
            p.last_heartbeat_at <= NOW() - make_interval(secs => d.grace_seconds) AS overdue
       FROM backgammon_match_presence p
       JOIN game_disconnect_policies d ON d.game_type = 'backgammon'
      WHERE p.match_id = $1 AND p.user_id = $2
      FOR UPDATE OF p`,
    [matchId, userId],
  );
  const presence = result.rows[0];
  if (!presence || presence.takeover_mode === 'disabled' || !presence.enabled) return false;
  if (presence.takeover_active || (presence.takeover_mode === 'temporary_ai' && presence.overdue)) {
    await client.query(
      `UPDATE backgammon_match_presence
          SET takeover_active = TRUE,
              disconnected_at = COALESCE(disconnected_at, last_heartbeat_at),
              takeover_started_at = COALESCE(takeover_started_at, NOW())
        WHERE match_id = $1 AND user_id = $2`,
      [matchId, userId],
    );
    return true;
  }
  return false;
}

/** Process one overdue disconnected turn. The match row lock serializes AI, human moves and reconnects. */
async function processTemporaryAiTakeover(matchId: string, requesterId?: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, status, host_user_id, guest_user_id, current_turn_user_id,
              board_state, bar_state, off_state, dice, remaining_dice,
              match_to_win, host_game_wins, guest_game_wins
         FROM backgammon_matches
        WHERE id = $1 AND expires_at > NOW()
        FOR UPDATE`,
      [matchId],
    );
    const game = found.rows[0];
    if (!game || game.status !== 'active' || !game.guest_user_id ||
        !game.current_turn_user_id ||
        (requesterId && ![String(game.host_user_id), String(game.guest_user_id)].includes(requesterId))) {
      await client.query('ROLLBACK');
      return false;
    }
    const policyResult = await client.query(
      `SELECT enabled, grace_seconds, takeover_mode FROM game_disconnect_policies
        WHERE game_type = 'backgammon'`,
    );
    const policy = policyResult.rows[0];
    if (!policy?.enabled || policy.takeover_mode !== 'temporary_ai') {
      await client.query('ROLLBACK');
      return false;
    }
    const presenceResult = await client.query(
      `SELECT last_heartbeat_at, takeover_active,
              last_heartbeat_at <= NOW() - make_interval(secs => $3::int) AS overdue
         FROM backgammon_match_presence
        WHERE match_id = $1 AND user_id = $2
        FOR UPDATE`,
      [matchId, game.current_turn_user_id, policy.grace_seconds],
    );
    const presence = presenceResult.rows[0];
    if (!presence || (!presence.takeover_active && !presence.overdue)) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE backgammon_match_presence
          SET takeover_active = TRUE,
              disconnected_at = COALESCE(disconnected_at, last_heartbeat_at),
              takeover_started_at = COALESCE(takeover_started_at, NOW())
        WHERE match_id = $1 AND user_id = $2`,
      [matchId, game.current_turn_user_id],
    );

    const hostTurn = String(game.current_turn_user_id) === String(game.host_user_id);
    let dice = Array.isArray(game.remaining_dice) ? [...game.remaining_dice] : [];
    let rolledDice = Array.isArray(game.dice) ? [...game.dice] : [];
    if (dice.length === 0 && rolledDice.length === 0) {
      const first = randomInt(1, 7);
      const second = randomInt(1, 7);
      rolledDice = [first, second];
      dice = first === second ? [first, first, first, first] : [...rolledDice];
    }

    const selected = chooseTemporaryAiTurn({
      board: [...game.board_state],
      bar: { host: Number(game.bar_state?.host ?? 0), guest: Number(game.bar_state?.guest ?? 0) },
      off: { host: Number(game.off_state?.host ?? 0), guest: Number(game.off_state?.guest ?? 0) },
    }, dice, hostTurn);

    const finalState = selected.state;
    const gameFinished = finalState.off.host >= 15 || finalState.off.guest >= 15;
    const hostWonGame = finalState.off.host >= 15;
    const nextHostWins = Number(game.host_game_wins ?? 0) + (gameFinished && hostWonGame ? 1 : 0);
    const nextGuestWins = Number(game.guest_game_wins ?? 0) + (gameFinished && !hostWonGame ? 1 : 0);
    const matchFinished = gameFinished && Math.max(nextHostWins, nextGuestWins) >= Number(game.match_to_win ?? 1);
    const winnerId = gameFinished
      ? (hostWonGame ? String(game.host_user_id) : String(game.guest_user_id))
      : null;
    const loserId = winnerId
      ? (winnerId === String(game.host_user_id) ? String(game.guest_user_id) : String(game.host_user_id))
      : null;
    const nextBoard = gameFinished && !matchFinished ? INITIAL_BACKGAMMON_BOARD : finalState.board;
    const nextBar = gameFinished && !matchFinished ? { host: 0, guest: 0 } : finalState.bar;
    const nextOff = gameFinished && !matchFinished ? { host: 0, guest: 0 } : finalState.off;

    await client.query(
      `UPDATE backgammon_matches
          SET board_state = $1::jsonb, bar_state = $2::jsonb, off_state = $3::jsonb,
              current_turn_user_id = $4, dice = '[]'::jsonb, remaining_dice = '[]'::jsonb,
              status = $5, winner_user_id = $6, finish_reason = $7,
              host_game_wins = $8, guest_game_wins = $9,
              state_version = state_version + 1, updated_at = NOW()
        WHERE id = $10`,
      [JSON.stringify(nextBoard), JSON.stringify(nextBar), JSON.stringify(nextOff),
       gameFinished ? game.host_user_id : (hostTurn ? game.guest_user_id : game.host_user_id),
       matchFinished ? 'finished' : 'active',
       matchFinished ? winnerId : null, matchFinished ? 'bear_off' : null,
       nextHostWins, nextGuestWins, matchId],
    );
    if (gameFinished && winnerId && loserId) {
      const gameNumber = Number(game.host_game_wins ?? 0) + Number(game.guest_game_wins ?? 0) + 1;
      await awardProgression(client, matchId, `game:${gameNumber}`, winnerId, loserId, 'loss');
      if (matchFinished) await updateBackgammonRatings(client, winnerId, loserId);
    }
    await client.query(
      `UPDATE backgammon_match_presence SET last_ai_action_at = NOW()
        WHERE match_id = $1 AND user_id = $2`,
      [matchId, game.current_turn_user_id],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    app.log.error({ err: error, matchId }, 'Temporary AI takeover failed');
    throw error;
  } finally {
    client.release();
  }
}

async function processDueTemporaryAiTakeovers(): Promise<void> {
  const due = await pool.query(
    `SELECT m.id
       FROM backgammon_matches m
       JOIN backgammon_match_presence p
         ON p.match_id = m.id AND p.user_id = m.current_turn_user_id
       JOIN game_disconnect_policies d ON d.game_type = 'backgammon'
      WHERE m.status = 'active' AND d.enabled = TRUE
        AND d.takeover_mode = 'temporary_ai'
        AND (p.takeover_active OR
             p.last_heartbeat_at <= NOW() - make_interval(secs => d.grace_seconds))
      ORDER BY p.last_heartbeat_at ASC
      LIMIT 25`,
  );
  for (const row of due.rows) {
    try { await processTemporaryAiTakeover(String(row.id)); }
    catch (error) { app.log.error({ err: error, matchId: row.id }, 'Could not process due temporary AI turn'); }
  }
}

app.get('/api/v1/admin/game-disconnect-policies', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query('SELECT game_type AS "gameType", enabled, grace_seconds AS "graceSeconds", takeover_mode AS "takeoverMode", updated_at AS "updatedAt" FROM game_disconnect_policies ORDER BY game_type');
  return { policies: result.rows };
});

app.patch<{ Params: { gameType: string }; Body: { enabled?: boolean; graceSeconds?: number; takeoverMode?: string } }>('/api/v1/admin/game-disconnect-policies/:gameType', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const { gameType } = request.params;
  const { enabled, graceSeconds, takeoverMode } = request.body ?? {};
  if (!['backgammon', 'cards', 'chess'].includes(gameType) ||
      (enabled !== undefined && typeof enabled !== 'boolean') ||
      (graceSeconds !== undefined && (!Number.isInteger(graceSeconds) || graceSeconds < 5 || graceSeconds > 120)) ||
      (takeoverMode !== undefined && !['temporary_ai', 'wait_until_game_end', 'disabled'].includes(takeoverMode))) {
    return reply.code(400).send({ error: 'Invalid disconnect policy.' });
  }
  const result = await pool.query(
    `UPDATE game_disconnect_policies SET enabled = COALESCE($2, enabled),
       grace_seconds = COALESCE($3, grace_seconds), takeover_mode = COALESCE($4, takeover_mode),
       updated_at = NOW() WHERE game_type = $1
       RETURNING game_type AS "gameType", enabled, grace_seconds AS "graceSeconds", takeover_mode AS "takeoverMode", updated_at AS "updatedAt"`,
    [gameType, enabled ?? null, graceSeconds ?? null, takeoverMode ?? null],
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Disconnect policy not found.' });
  return { policy: result.rows[0] };
});

app.patch<{ Body: { fullName?: string; phone?: string; country?: string } }>('/api/v1/me/profile', { onRequest: [requireMatchAuth], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const fullName = typeof request.body?.fullName === 'string' ? request.body.fullName.trim() : '';
  const phone = typeof request.body?.phone === 'string' ? request.body.phone.trim() : '';
  const country = typeof request.body?.country === 'string' ? request.body.country.trim() : '';
  if (!fullName || fullName.length > 120 || !phone || !/^[+0-9() .-]{6,32}$/.test(phone) || !country || country.length > 80) {
    return reply.code(400).send({ error: 'نام، شماره تلفن معتبر و کشور را وارد کنید.' });
  }
  const current = await pool.query('SELECT phone_e164 FROM users WHERE id = $1 LIMIT 1', [claims.sub]);
  if (!current.rowCount) return reply.code(404).send({ error: 'Account not found.' });
  const verifiedPhone = current.rows[0].phone_e164 as string | null;
  if (verifiedPhone && normalizeIranianMobile(phone) !== verifiedPhone) {
    return reply.code(409).send({ error: 'Verify the new phone number with an OTP before changing the linked phone.' });
  }
  const storedPhone = verifiedPhone ?? phone;
  const result = await pool.query(
    'UPDATE users SET full_name = $1, phone = $2, country = $3 WHERE id = $4 RETURNING id, username, email, full_name AS "fullName", phone, country',
    [fullName, storedPhone, country, claims.sub],
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

// Weekly league rules are server-owned and audited.
type WeeklyLeagueRules = {
  format: 'round_robin' | 'swiss' | 'knockout' | 'groups_then_knockout';
  minimumParticipants: number | null;
  restPolicy: 'balanced_report_actual_games';
  finalStagePolicy: 'manager_decides_by_format';
  appealDeadlineHours: 24;
  doubleAbsencePolicy: 'reschedule_if_possible';
  technicalIssuePolicy: 'reschedule_if_possible';
};
const defaultWeeklyLeagueRules: WeeklyLeagueRules = {
  format: 'round_robin', minimumParticipants: null,
  restPolicy: 'balanced_report_actual_games', finalStagePolicy: 'manager_decides_by_format',
  appealDeadlineHours: 24, doubleAbsencePolicy: 'reschedule_if_possible',
  technicalIssuePolicy: 'reschedule_if_possible',
};
function normalizeWeeklyLeagueRules(value: unknown, enabled: boolean): WeeklyLeagueRules | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const format = raw.format ?? defaultWeeklyLeagueRules.format;
  const minimum = raw.minimumParticipants ?? null;
  if (!['round_robin', 'swiss', 'knockout', 'groups_then_knockout'].includes(String(format)) ||
      (minimum !== null && (!Number.isInteger(minimum) || Number(minimum) < 2 || Number(minimum) > 512)) ||
      (enabled && minimum === null) ||
      (raw.restPolicy !== undefined && raw.restPolicy !== defaultWeeklyLeagueRules.restPolicy) ||
      (raw.finalStagePolicy !== undefined && raw.finalStagePolicy !== defaultWeeklyLeagueRules.finalStagePolicy) ||
      (raw.appealDeadlineHours !== undefined && raw.appealDeadlineHours !== 24) ||
      (raw.doubleAbsencePolicy !== undefined && raw.doubleAbsencePolicy !== defaultWeeklyLeagueRules.doubleAbsencePolicy) ||
      (raw.technicalIssuePolicy !== undefined && raw.technicalIssuePolicy !== defaultWeeklyLeagueRules.technicalIssuePolicy)) return null;
  return { ...defaultWeeklyLeagueRules, format: format as WeeklyLeagueRules['format'], minimumParticipants: minimum as number | null };
}
// League management and entry are server-authoritative. League entry never debits wallet credits.
app.get('/api/v1/leagues', { onRequest: [requireMatchAuth] }, async () => {
  const result = await pool.query(
    `SELECT id, code, name, entry_mode AS "entryMode",
            subscription_days_cost AS "subscriptionDaysCost", starts_at AS "startsAt",
            ends_at AS "endsAt", rules
       FROM leagues
      WHERE enabled = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY starts_at NULLS FIRST, id ASC`,
  );
  return { leagues: result.rows };
});

app.get('/api/v1/admin/leagues', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(
    `SELECT id, code, name, enabled, entry_mode AS "entryMode",
            subscription_days_cost AS "subscriptionDaysCost",
            starts_at AS "startsAt", ends_at AS "endsAt", rules,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM leagues ORDER BY id DESC`,
  );
  return { leagues: result.rows };
});

app.post<{
  Body: {
    code?: string; name?: string; enabled?: boolean; entryMode?: string;
    subscriptionDaysCost?: number; startsAt?: string | null; endsAt?: string | null; rules?: unknown;
  };
}>('/api/v1/admin/leagues', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const body = request.body ?? {};
  const code = body.code?.trim();
  const name = body.name?.trim();
  const entryMode = body.entryMode ?? 'free';
  const days = body.subscriptionDaysCost ?? 0;
  if (!code || !/^[a-z0-9][a-z0-9_-]{1,39}$/.test(code) ||
      !name || name.length > 120 ||
      typeof (body.enabled ?? false) !== 'boolean' ||
      !['free', 'subscription_days'].includes(entryMode) ||
      !Number.isInteger(days) || days < 0 || days > 30 ||
      (entryMode === 'free' && days !== 0) ||
      (entryMode === 'subscription_days' && days < 1)) {
    return reply.code(400).send({ error: 'Invalid league configuration.' });
  }
  const startsAt = body.startsAt ?? null;
  const endsAt = body.endsAt ?? null;
  const rules = normalizeWeeklyLeagueRules(body.rules, body.enabled ?? false);
  if (!rules) return reply.code(400).send({ error: 'Invalid weekly league rules; set a valid minimum before enabling.' });
  if (
      (startsAt !== null && !Number.isFinite(Date.parse(startsAt))) ||
      (endsAt !== null && !Number.isFinite(Date.parse(endsAt))) ||
      (startsAt !== null && endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt))
  ) {
    return reply.code(400).send({ error: 'Invalid league schedule.' });
  }
  const claims = request.user as { sub: string };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO leagues
         (code, name, enabled, entry_mode, subscription_days_cost, starts_at, ends_at, rules, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
       RETURNING id, code, name, enabled, entry_mode AS "entryMode",
                 subscription_days_cost AS "subscriptionDaysCost",
                 starts_at AS "startsAt", ends_at AS "endsAt", rules`,
      [code, name, body.enabled ?? false, entryMode, days, startsAt, endsAt, JSON.stringify(rules), claims.sub],
    );
    await client.query(
      `INSERT INTO league_admin_audit_log (actor_user_id, league_id, action, details)
       VALUES ($1, $2, 'league_created', $3::jsonb)`,
      [claims.sub, created.rows[0].id, JSON.stringify({ code, enabled: body.enabled ?? false, entryMode, subscriptionDaysCost: days, rules })],
    );
    await client.query('COMMIT');
    return reply.code(201).send({ league: created.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.code(409).send({ error: 'A league with that code already exists.' });
    }
    request.log.error({ err: error }, 'Could not create league');
    return reply.code(500).send({ error: 'Could not create league.' });
  } finally {
    client.release();
  }
});

app.patch<{
  Params: { id: string };
  Body: {
    name?: string; enabled?: boolean; entryMode?: string;
    subscriptionDaysCost?: number; startsAt?: string | null; endsAt?: string | null; rules?: unknown;
  };
}>('/api/v1/admin/leagues/:id', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid league id.' });
  const body = request.body ?? {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (has('name') && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) ||
      has('enabled') && typeof body.enabled !== 'boolean' ||
      has('entryMode') && !['free', 'subscription_days'].includes(body.entryMode ?? '') ||
      has('subscriptionDaysCost') && (!Number.isInteger(body.subscriptionDaysCost) || (body.subscriptionDaysCost ?? -1) < 0 || (body.subscriptionDaysCost ?? 31) > 30) ||
      has('startsAt') && body.startsAt !== null && (typeof body.startsAt !== 'string' || !Number.isFinite(Date.parse(body.startsAt))) ||
      has('endsAt') && body.endsAt !== null && (typeof body.endsAt !== 'string' || !Number.isFinite(Date.parse(body.endsAt)))) {
    return reply.code(400).send({ error: 'Invalid league configuration.' });
  }
  const client = await pool.connect();
  const claims = request.user as { sub: string };
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM leagues WHERE id = $1 FOR UPDATE', [request.params.id]);
    if (!existing.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'League not found.' });
    }
    const current = existing.rows[0];
    const rules = normalizeWeeklyLeagueRules(has('rules') ? body.rules : current.rules, has('enabled') ? body.enabled === true : current.enabled === true);
    if (!rules) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Invalid weekly league rules; set a valid minimum before enabling.' }); }
    const entryMode = body.entryMode ?? current.entry_mode;
    const days = body.subscriptionDaysCost ?? Number(current.subscription_days_cost);
    if ((entryMode === 'free' && days !== 0) || (entryMode === 'subscription_days' && (days < 1 || days > 30))) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Entry mode and subscription-day cost do not match.' });
    }
    const startsAt = has('startsAt') ? body.startsAt ?? null : current.starts_at;
    const endsAt = has('endsAt') ? body.endsAt ?? null : current.ends_at;
    if (startsAt !== null && endsAt !== null && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'Invalid league schedule.' });
    }
    const updated = await client.query(
      `UPDATE leagues SET
          name = $1, enabled = $2, entry_mode = $3, subscription_days_cost = $4,
          starts_at = $5, ends_at = $6, rules = $7::jsonb, updated_by = $8, updated_at = NOW()
        WHERE id = $9
        RETURNING id, code, name, enabled, entry_mode AS "entryMode",
                  subscription_days_cost AS "subscriptionDaysCost",
                  starts_at AS "startsAt", ends_at AS "endsAt", rules`,
      [has('name') ? body.name!.trim() : current.name,
       has('enabled') ? body.enabled : current.enabled, entryMode, days,
       startsAt, endsAt, JSON.stringify(rules), claims.sub, request.params.id],
    );
    await client.query(
      `INSERT INTO league_admin_audit_log (actor_user_id, league_id, action, details)
       VALUES ($1, $2, 'league_updated', $3::jsonb)`,
      [claims.sub, request.params.id, JSON.stringify({ fields: Object.keys(body), ...(has('rules') ? { rules } : {}) })],
    );
    await client.query('COMMIT');
    return { league: updated.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not update league');
    return reply.code(500).send({ error: 'Could not update league.' });
  } finally {
    client.release();
  }
});

app.post<{
  Params: { id: string };
  Body: { idempotencyKey?: string };
}>('/api/v1/leagues/:id/entries', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  const key = request.body?.idempotencyKey;
  if (!isNumericId(request.params.id) || typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
    return reply.code(400).send({ error: 'A valid league id and idempotency key are required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const leagueResult = await client.query(
      `SELECT id, code, name, entry_mode, subscription_days_cost
         FROM leagues
        WHERE id = $1 AND enabled = TRUE
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at > NOW())
        FOR UPDATE`,
      [request.params.id],
    );
    const league = leagueResult.rows[0] as {
      id: string; code: string; name: string; entry_mode: string; subscription_days_cost: number;
    } | undefined;
    if (!league) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'League is not open for entry.' });
    }
    const existing = await client.query(
      `SELECT id, league_id AS "leagueId", user_id AS "userId", created_at AS "createdAt"
         FROM league_entries WHERE league_id = $1 AND user_id = $2`,
      [league.id, claims.sub],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { entry: existing.rows[0], alreadyEntered: true };
    }
    const reusedKey = await client.query(
      'SELECT id FROM league_entries WHERE user_id = $1 AND idempotency_key = $2',
      [claims.sub, key],
    );
    if (reusedKey.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Idempotency key has already been used for another entry.' });
    }

    let subscription: { id: string; ends_at: Date | string } | undefined;
    let endsAtBefore: Date | null = null;
    let endsAtAfter: Date | null = null;
    const days = Number(league.subscription_days_cost);
    if (league.entry_mode === 'subscription_days') {
      const subResult = await client.query(
        `SELECT id, ends_at FROM user_subscriptions
          WHERE user_id = $1 AND status = 'active' AND ends_at > NOW()
          ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`,
        [claims.sub],
      );
      subscription = subResult.rows[0] as { id: string; ends_at: Date | string } | undefined;
      if (!subscription) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'An active subscription is required for this league.' });
      }
      endsAtBefore = new Date(subscription.ends_at);
      const availableDays = Math.floor((endsAtBefore.getTime() - Date.now()) / 86400000);
      if (availableDays < days) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Insufficient subscription days.', requiredDays: days, availableDays: Math.max(0, availableDays) });
      }
      endsAtAfter = new Date(endsAtBefore.getTime() - days * 86400000);
      if (endsAtAfter.getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Insufficient subscription days.', requiredDays: days, availableDays: Math.max(0, availableDays) });
      }
      await client.query(
        'UPDATE user_subscriptions SET ends_at = $1 WHERE id = $2',
        [endsAtAfter, subscription.id],
      );
    }

    const inserted = await client.query(
      `INSERT INTO league_entries (league_id, user_id, idempotency_key)
       VALUES ($1, $2, $3)
       RETURNING id, league_id AS "leagueId", user_id AS "userId", created_at AS "createdAt"`,
      [league.id, claims.sub, key],
    );
    if (subscription && endsAtBefore && endsAtAfter) {
      await client.query(
        `INSERT INTO league_entitlement_ledger
           (user_id, subscription_id, league_id, entry_id, days_consumed, ends_at_before, ends_at_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [claims.sub, subscription.id, league.id, inserted.rows[0].id, days, endsAtBefore, endsAtAfter],
      );
    }
    await client.query('COMMIT');
    return reply.code(201).send({ entry: inserted.rows[0], subscriptionEndsAt: endsAtAfter });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.code(409).send({ error: 'This league entry conflicts with an existing request.' });
    }
    request.log.error({ err: error }, 'Could not enter league');
    return reply.code(500).send({ error: 'Could not enter league.' });
  } finally {
    client.release();
  }
});

app.get('/api/v1/leagues/:id/entries/me', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId((request.params as { id?: string }).id ?? '')) {
    return reply.code(400).send({ error: 'Invalid league id.' });
  }
  const result = await pool.query(
    `SELECT e.id, e.league_id AS "leagueId", e.created_at AS "createdAt",
            l.code, l.name
       FROM league_entries e JOIN leagues l ON l.id = e.league_id
      WHERE e.league_id = $1 AND e.user_id = $2`,
    [(request.params as { id: string }).id, claims.sub],
  );
  return { entry: result.rows[0] ?? null };
});

// Weekly league execution: schedule generation, participant game counts, match outcomes, and appeals.
app.post<{ Params: { id: string }; Body: { roundNumber?: number; stage?: string; startsAt?: string | null; managerApproved?: boolean; matches?: Array<{ playerOneId?: string | number; playerTwoId?: string | number | null }> } }>('/api/v1/admin/leagues/:id/rounds', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const leagueId = request.params.id, body = request.body ?? {};
  const roundNumber = body.roundNumber, stage = body.stage ?? 'regular';
  const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
  if (!isNumericId(leagueId) || !Number.isInteger(roundNumber) || Number(roundNumber) < 1 || Number(roundNumber) > 1000 ||
      !['regular','final'].includes(stage) || !Number.isFinite(startsAt.getTime()) || !Array.isArray(body.matches) || body.matches.length < 1 || body.matches.length > 256 ||
      (body.managerApproved !== undefined && typeof body.managerApproved !== 'boolean')) return reply.code(400).send({ error: 'Invalid round configuration.' });
  const client = await pool.connect(), claims = request.user as { sub: string };
  try {
    await client.query('BEGIN');
    const lr = await client.query('SELECT id,rules FROM leagues WHERE id=$1 FOR UPDATE', [leagueId]);
    if (!lr.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'League not found.' }); }
    const rules = lr.rows[0].rules as WeeklyLeagueRules, format = rules?.format ?? 'round_robin';
    if (stage === 'final' && (!['knockout','groups_then_knockout'].includes(format) || body.managerApproved !== true)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'A final stage requires a compatible league format and explicit manager approval.' });
    }
    const entries = await client.query('SELECT user_id FROM league_entries WHERE league_id=$1', [leagueId]);
    const registered = new Set((entries.rows as { user_id: string }[]).map(x => String(x.user_id)));
    if (registered.size < Number(rules?.minimumParticipants ?? 2)) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'The configured minimum participant count has not been reached.' }); }
    const seen = new Set<string>();
    const normalized: Array<{ a: string; b: string | null }> = [];
    for (const fixture of body.matches) {
      const a = fixture?.playerOneId == null ? '' : String(fixture.playerOneId);
      const b = fixture?.playerTwoId == null ? null : String(fixture.playerTwoId);
      if (!isNumericId(a) || !registered.has(a) || (b !== null && (!isNumericId(b) || !registered.has(b) || b === a)) || seen.has(a) || (b !== null && seen.has(b))) {
        await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Every fixture must use registered participants, with no duplicate participant within a round.' });
      }
      seen.add(a); if (b !== null) seen.add(b); normalized.push({ a, b });
    }
    const createdRound = await client.query("INSERT INTO league_rounds (league_id,round_number,stage,status,starts_at,manager_approved,created_by) VALUES ($1,$2,$3,'scheduled',$4,$5,$6) RETURNING id,round_number AS \"roundNumber\",stage,status,starts_at AS \"startsAt\",manager_approved AS \"managerApproved\"", [leagueId,roundNumber,stage,startsAt,stage === 'final' && body.managerApproved === true,claims.sub]);
    for (const fixture of normalized) {
      if (fixture.b === null) await client.query("INSERT INTO league_matches (league_id,round_id,player_one_id,status,winner_id,scheduled_at,completed_at) VALUES ($1,$2,$3,'bye',$3,$4,$4)", [leagueId,createdRound.rows[0].id,fixture.a,startsAt]);
      else await client.query("INSERT INTO league_matches (league_id,round_id,player_one_id,player_two_id,status,scheduled_at) VALUES ($1,$2,$3,$4,'scheduled',$5)", [leagueId,createdRound.rows[0].id,fixture.a,fixture.b,startsAt]);
    }
    await client.query("INSERT INTO league_admin_audit_log (actor_user_id,league_id,action,details) VALUES ($1,$2,'league_round_created',$3::jsonb)", [claims.sub,leagueId,JSON.stringify({ roundNumber,stage,managerApproved:body.managerApproved === true,fixtureCount:normalized.length,startsAt:startsAt.toISOString() })]);
    await client.query('COMMIT');
    return reply.code(201).send({ round: createdRound.rows[0], fixtureCount: normalized.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'That round already exists.' });
    request.log.error({ err: error }, 'Could not create weekly league round');
    return reply.code(500).send({ error: 'Could not create weekly league round.' });
  } finally { client.release(); }
});

app.post<{ Params: { id: string }; Body: { startsAt?: string | null; intervalDays?: number } }>('/api/v1/admin/leagues/:id/schedule', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const leagueId = request.params.id;
  const start = request.body?.startsAt ? new Date(request.body.startsAt) : new Date();
  const interval = request.body?.intervalDays ?? 7;
  if (!isNumericId(leagueId) || !Number.isFinite(start.getTime()) || !Number.isInteger(interval) || interval < 1 || interval > 30) return reply.code(400).send({ error: 'Invalid league schedule request.' });
  const client = await pool.connect();
  const claims = request.user as { sub: string };
  try {
    await client.query('BEGIN');
    const lr = await client.query('SELECT id, rules FROM leagues WHERE id = $1 FOR UPDATE', [leagueId]);
    if (!lr.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'League not found.' }); }
    const rules = lr.rows[0].rules as WeeklyLeagueRules;
    const rosterResult = await client.query('SELECT user_id AS id FROM league_entries WHERE league_id = $1 ORDER BY created_at, user_id', [leagueId]);
    const players = (rosterResult.rows as { id: string }[]).map(x => String(x.id));
    if (!Number.isInteger(rules?.minimumParticipants) || players.length < Number(rules.minimumParticipants)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'League minimum participant count has not been reached.', minimumParticipants: rules?.minimumParticipants ?? null, currentParticipants: players.length });
    }
    if (!['round_robin', 'swiss', 'knockout'].includes(rules?.format ?? 'round_robin')) { await client.query('ROLLBACK'); return reply.code(422).send({ error: 'This league format requires manager-created rounds.' }); }
    const prior = await client.query('SELECT id FROM league_rounds WHERE league_id = $1', [leagueId]);
    if (prior.rowCount) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Schedule already exists for this league.' }); }
    const roster: (string | null)[] = [...players];
    if (roster.length % 2) roster.push(null);
    const n = roster.length;
    const rounds = (rules?.format ?? 'round_robin') === 'round_robin' ? n - 1 : 1;
    let rotation = [...roster];
    const created: unknown[] = [];
    for (let r = 0; r < rounds; r++) {
      const when = new Date(start.getTime() + r * interval * 86400000);
      const round = await client.query("INSERT INTO league_rounds (league_id, round_number, stage, status, starts_at, created_by) VALUES ($1,$2,'regular','scheduled',$3,$4) RETURNING id, round_number AS \"roundNumber\", starts_at AS \"startsAt\"", [leagueId, r + 1, when, claims.sub]);
      for (let i = 0; i < n / 2; i++) {
        const a = (rules?.format ?? 'round_robin') === 'round_robin' ? rotation[i] : roster[i * 2];
        const b = (rules?.format ?? 'round_robin') === 'round_robin' ? rotation[n - i - 1] : roster[i * 2 + 1];
        if (a === null || b === null) {
          const bye = a ?? b;
          if (bye !== null) await client.query("INSERT INTO league_matches (league_id, round_id, player_one_id, status, winner_id, scheduled_at, completed_at) VALUES ($1,$2,$3,'bye',$3,$4,$4)", [leagueId, round.rows[0].id, bye, when]);
        } else {
          await client.query("INSERT INTO league_matches (league_id, round_id, player_one_id, player_two_id, status, scheduled_at) VALUES ($1,$2,$3,$4,'scheduled',$5)", [leagueId, round.rows[0].id, a, b, when]);
        }
      }
      created.push(round.rows[0]);
      if ((rules?.format ?? 'round_robin') === 'round_robin') rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
    }
    await client.query("INSERT INTO league_admin_audit_log (actor_user_id, league_id, action, details) VALUES ($1,$2,'league_schedule_generated',$3::jsonb)", [claims.sub, leagueId, JSON.stringify({ format: rules.format, participantCount: players.length, rounds, intervalDays: interval, startsAt: start.toISOString() })]);
    await client.query('COMMIT');
    return reply.code(201).send({ leagueId, participantCount: players.length, rounds: created });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not generate weekly league schedule');
    return reply.code(500).send({ error: 'Could not generate weekly league schedule.' });
  } finally { client.release(); }
});

app.get<{ Params: { id: string } }>('/api/v1/admin/leagues/:id/report', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const id = request.params.id;
  if (!isNumericId(id)) return reply.code(400).send({ error: 'Invalid league id.' });
  const league = await pool.query('SELECT id, code, name, rules FROM leagues WHERE id = $1', [id]);
  if (!league.rowCount) return reply.code(404).send({ error: 'League not found.' });
  const participants = await pool.query("SELECT u.id AS \"userId\", u.username, COUNT(m.id) FILTER (WHERE m.status = 'completed')::int AS \"gamesPlayed\", COUNT(m.id) FILTER (WHERE m.status = 'bye')::int AS \"restRounds\", COUNT(m.id) FILTER (WHERE m.status = 'double_absent' OR (m.status = 'rescheduled' AND m.incident_note LIKE 'double_absent:%'))::int AS \"doubleAbsenceIncidents\", COUNT(m.id) FILTER (WHERE m.status = 'technical_issue' OR (m.status = 'rescheduled' AND m.incident_note LIKE 'technical_issue:%'))::int AS \"technicalIncidents\" FROM league_entries e JOIN users u ON u.id=e.user_id LEFT JOIN league_matches m ON m.league_id=e.league_id AND (m.player_one_id=e.user_id OR m.player_two_id=e.user_id) WHERE e.league_id=$1 GROUP BY u.id,u.username ORDER BY \"gamesPlayed\" DESC,u.username ASC", [id]);
  const rounds = await pool.query("SELECT r.id,r.round_number AS \"roundNumber\",r.stage,r.status,r.starts_at AS \"startsAt\",COUNT(m.id)::int AS \"matchesTotal\",COUNT(m.id) FILTER (WHERE m.status IN ('completed','bye'))::int AS \"matchesResolved\" FROM league_rounds r LEFT JOIN league_matches m ON m.round_id=r.id WHERE r.league_id=$1 GROUP BY r.id ORDER BY r.round_number", [id]);
  const appeals = await pool.query("SELECT a.id,a.match_id AS \"matchId\",a.status,a.reason,a.deadline_at AS \"deadlineAt\",a.created_at AS \"createdAt\",u.username AS \"appellantUsername\" FROM league_appeals a JOIN users u ON u.id=a.appellant_user_id WHERE a.league_id=$1 ORDER BY CASE WHEN a.status='open' THEN 0 ELSE 1 END,a.created_at DESC", [id]);
  const matches = await pool.query("SELECT m.id,m.round_id AS \"roundId\",m.status,m.player_one_id AS \"playerOneId\",p1.username AS \"playerOneUsername\",m.player_two_id AS \"playerTwoId\",p2.username AS \"playerTwoUsername\",m.winner_id AS \"winnerId\",m.scheduled_at AS \"scheduledAt\",m.replacement_at AS \"replacementAt\",m.completed_at AS \"completedAt\",m.incident_note AS \"incidentNote\",m.score FROM league_matches m LEFT JOIN users p1 ON p1.id=m.player_one_id LEFT JOIN users p2 ON p2.id=m.player_two_id WHERE m.league_id=$1 ORDER BY m.round_id,m.id", [id]);
  return { league: league.rows[0], participants: participants.rows, rounds: rounds.rows, appeals: appeals.rows, matches: matches.rows };
});

app.patch<{ Params: { id: string }; Body: { status?: string; winnerId?: string | number | null; score?: unknown; incidentNote?: string; replacementAt?: string | null } }>('/api/v1/admin/league-matches/:id', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const id = request.params.id, body = request.body ?? {};
  if (!isNumericId(id) || !['completed','double_absent','technical_issue','rescheduled','in_progress'].includes(body.status ?? '')) return reply.code(400).send({ error: 'Invalid league match update.' });
  if (body.incidentNote !== undefined && (typeof body.incidentNote !== 'string' || body.incidentNote.length > 2000)) return reply.code(400).send({ error: 'Incident note must be 2000 characters or fewer.' });
  if (body.replacementAt != null && (typeof body.replacementAt !== 'string' || !Number.isFinite(Date.parse(body.replacementAt)) || Date.parse(body.replacementAt) <= Date.now())) return reply.code(400).send({ error: 'Replacement time must be in the future.' });
  const client = await pool.connect(), claims = request.user as { sub: string };
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM league_matches WHERE id=$1 FOR UPDATE', [id]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'League match not found.' }); }
    const match = current.rows[0];
    const winner = body.winnerId == null ? null : String(body.winnerId);
    if (body.status === 'completed' && (!winner || ![match.player_one_id, match.player_two_id].includes(winner))) { await client.query('ROLLBACK'); return reply.code(400).send({ error: 'Winner must be one of the match participants.' }); }
    const updated = await client.query("UPDATE league_matches SET status=$1,winner_id=$2,score=$3::jsonb,incident_note=$4,replacement_at=$5,scheduled_at=CASE WHEN $1='rescheduled' THEN $5 ELSE scheduled_at END,completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END,resolved_by=$6,resolved_at=NOW() WHERE id=$7 RETURNING id,league_id AS \"leagueId\",round_id AS \"roundId\",status,player_one_id AS \"playerOneId\",player_two_id AS \"playerTwoId\",winner_id AS \"winnerId\",scheduled_at AS \"scheduledAt\",replacement_at AS \"replacementAt\",completed_at AS \"completedAt\",incident_note AS \"incidentNote\"", [body.status,winner,JSON.stringify(body.score ?? {}),body.incidentNote ?? null,body.replacementAt ?? null,claims.sub,id]);
    await client.query("INSERT INTO league_admin_audit_log (actor_user_id,league_id,action,details) VALUES ($1,$2,'league_match_updated',$3::jsonb)", [claims.sub,match.league_id,JSON.stringify({ matchId:id,status:body.status,winnerId:winner,replacementAt:body.replacementAt ?? null })]);
    await client.query('COMMIT');
    return { match: updated.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not update weekly league match');
    return reply.code(500).send({ error: 'Could not update weekly league match.' });
  } finally { client.release(); }
});

app.post<{ Params: { id: string; matchId: string }; Body: { reason?: string } }>('/api/v1/leagues/:id/matches/:matchId/appeals', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const { id, matchId } = request.params, claims = request.user as { sub: string }, reason = request.body?.reason?.trim();
  if (!isNumericId(id) || !isNumericId(matchId) || !reason || reason.length < 5 || reason.length > 2000) return reply.code(400).send({ error: 'A valid match and appeal reason (5–2000 characters) are required.' });
  const result = await pool.query('SELECT id,player_one_id,player_two_id,status,completed_at FROM league_matches WHERE id=$1 AND league_id=$2', [matchId,id]);
  const match = result.rows[0] as { id: string; player_one_id: string | null; player_two_id: string | null; status: string; completed_at: Date | string | null } | undefined;
  if (!match || ![match.player_one_id,match.player_two_id].includes(String(claims.sub))) return reply.code(404).send({ error: 'League match not found for this participant.' });
  if (match.status !== 'completed' || !match.completed_at) return reply.code(409).send({ error: 'Appeals are available only after match completion.' });
  const deadline = new Date(new Date(match.completed_at).getTime() + 24 * 60 * 60 * 1000);
  if (deadline.getTime() < Date.now()) return reply.code(410).send({ error: 'The 24-hour appeal window has expired.', deadlineAt: deadline.toISOString() });
  try {
    const appeal = await pool.query("INSERT INTO league_appeals (league_id,match_id,appellant_user_id,reason,deadline_at) VALUES ($1,$2,$3,$4,$5) RETURNING id,league_id AS \"leagueId\",match_id AS \"matchId\",status,reason,deadline_at AS \"deadlineAt\",created_at AS \"createdAt\"", [id,matchId,claims.sub,reason,deadline]);
    return reply.code(201).send({ appeal: appeal.rows[0] });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'An appeal has already been submitted for this match.' });
    request.log.error({ err: error }, 'Could not submit league appeal');
    return reply.code(500).send({ error: 'Could not submit league appeal.' });
  }
});

app.patch<{ Params: { id: string }; Body: { status?: 'accepted' | 'rejected'; managerNote?: string } }>('/api/v1/admin/league-appeals/:id', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const id = request.params.id, status = request.body?.status, note = request.body?.managerNote?.trim() ?? null;
  if (!isNumericId(id) || !['accepted','rejected'].includes(status ?? '') || (note !== null && note.length > 2000)) return reply.code(400).send({ error: 'Invalid appeal decision.' });
  const claims = request.user as { sub: string };
  const result = await pool.query("UPDATE league_appeals SET status=$1,manager_note=$2,resolved_by=$3,resolved_at=NOW() WHERE id=$4 AND status='open' RETURNING id,league_id AS \"leagueId\",match_id AS \"matchId\",status,manager_note AS \"managerNote\",resolved_at AS \"resolvedAt\"", [status,note,claims.sub,id]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Open appeal not found.' });
  await pool.query("INSERT INTO league_admin_audit_log (actor_user_id,league_id,action,details) VALUES ($1,$2,'league_appeal_resolved',$3::jsonb)", [claims.sub,result.rows[0].leagueId,JSON.stringify({ appealId:id,status })]);
  return { appeal: result.rows[0] };
});

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
  const switchResult = await pool.query('SELECT enabled FROM admin_permission_settings WHERE id = 1');
  if (switchResult.rows[0]?.enabled !== true) {
    return reply.code(403).send({ error: 'Delegated permissions are disabled by the owner.' });
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

// Phase 4 agent control plane: plans and proposals only. There is intentionally no execution endpoint.
const agentTaskDomains = new Set([
  'membership', 'marketing', 'deposits', 'leagues', 'moderation',
  'operations', 'social', 'advertising', 'analytics',
]);
const agentTaskCapabilities = new Set(['read', 'recommend', 'execute', 'approve']);

app.get('/api/v1/admin/agent-tasks', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`
    SELECT id, code, title, domain, description,
           requested_capabilities AS "requestedCapabilities",
           requires_human_approval AS "requiresHumanApproval", status,
           created_at AS "createdAt", updated_at AS "updatedAt"
      FROM agent_task_definitions
     ORDER BY created_at DESC, id DESC LIMIT 200
  `);
  return { tasks: result.rows, runtimeEnabled: false };
});

app.post<{ Body: { code?: string; title?: string; domain?: string; description?: string; requestedCapabilities?: string[]; requiresHumanApproval?: boolean } }>(
  '/api/v1/admin/agent-tasks',
  { onRequest: [requireOwnerAuth], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const body = request.body ?? {};
    const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const domain = typeof body.domain === 'string' ? body.domain : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const capabilities = body.requestedCapabilities ?? ['read'];
    const requiresHumanApproval = body.requiresHumanApproval ?? true;
    if (!/^[a-z0-9_]{2,48}$/.test(code) || title.length < 3 || title.length > 120 ||
        !agentTaskDomains.has(domain) || description.length > 2000 ||
        !Array.isArray(capabilities) || capabilities.length < 1 || capabilities.length > 4 ||
        !capabilities.every((capability) => typeof capability === 'string' && agentTaskCapabilities.has(capability)) ||
        new Set(capabilities).size !== capabilities.length || typeof requiresHumanApproval !== 'boolean') {
      return reply.code(400).send({ error: 'Provide a valid dormant task definition and allowlisted capabilities.' });
    }
    const claims = request.user as { sub?: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO agent_task_definitions
          (code, title, domain, description, requested_capabilities, requires_human_approval, status, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'draft', $7, $7)
         RETURNING id, code, title, domain, description,
                   requested_capabilities AS "requestedCapabilities",
                   requires_human_approval AS "requiresHumanApproval", status,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [code, title, domain, description, JSON.stringify(capabilities), requiresHumanApproval, claims.sub ?? null],
      );
      await client.query(
        `INSERT INTO agent_task_audit_log (actor_user_id, task_definition_id, action, result, reason, details)
         VALUES ($1, $2, 'definition_created', 'success', 'Owner created a dormant task definition', $3::jsonb)`,
        [claims.sub ?? null, inserted.rows[0].id, JSON.stringify({ code, domain, requestedCapabilities: capabilities })],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ task: inserted.rows[0], runtimeEnabled: false });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return reply.code(409).send({ error: 'A task definition with this code already exists.' });
      }
      request.log.error({ err: error }, 'Could not create dormant agent task definition');
      return reply.code(500).send({ error: 'Could not create task definition.' });
    } finally {
      client.release();
    }
  },
);

app.get('/api/v1/admin/agent-task-proposals', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`
    SELECT p.id, p.task_definition_id AS "taskDefinitionId", t.code AS "taskCode",
           t.title AS "taskTitle", p.input, p.status, p.review_reason AS "reviewReason",
           p.created_at AS "createdAt", p.reviewed_at AS "reviewedAt"
      FROM agent_task_proposals p
      JOIN agent_task_definitions t ON t.id = p.task_definition_id
     ORDER BY p.created_at DESC, p.id DESC LIMIT 200
  `);
  return { proposals: result.rows, runtimeEnabled: false };
});

app.post<{ Params: { id: string }; Body: { input?: Record<string, unknown> } }>(
  '/api/v1/admin/agent-tasks/:id/proposals',
  { onRequest: [requireOwnerAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
  async (request, reply) => {
    if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid task definition ID.' });
    const input = request.body?.input ?? {};
    if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input), 'utf8') > 8000) {
      return reply.code(400).send({ error: 'Proposal input must be an object no larger than 8 KB.' });
    }
    const claims = request.user as { sub?: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const task = await client.query(
        'SELECT id, status FROM agent_task_definitions WHERE id = $1 FOR SHARE',
        [request.params.id],
      );
      if (!task.rowCount || task.rows[0].status !== 'draft') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Task definition is missing or not available for proposals.' });
      }
      const inserted = await client.query(
        `INSERT INTO agent_task_proposals (task_definition_id, requested_by, input, status)
         VALUES ($1, $2, $3::jsonb, 'awaiting_review')
         RETURNING id, task_definition_id AS "taskDefinitionId", input, status, created_at AS "createdAt"`,
        [request.params.id, claims.sub ?? null, JSON.stringify(input)],
      );
      await client.query(
        `INSERT INTO agent_task_audit_log (actor_user_id, task_definition_id, proposal_id, action, result, reason, details)
         VALUES ($1, $2, $3, 'proposal_created', 'success', 'Proposal queued for human review; execution is disabled', $4::jsonb)`,
        [claims.sub ?? null, request.params.id, inserted.rows[0].id, JSON.stringify({ runtimeEnabled: false })],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ proposal: inserted.rows[0], runtimeEnabled: false, requiresHumanReview: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not create agent task proposal');
      return reply.code(500).send({ error: 'Could not create task proposal.' });
    } finally {
      client.release();
    }
  },
);

app.post<{ Params: { id: string }; Body: { reason?: string } }>(
  '/api/v1/admin/agent-task-proposals/:id/reject',
  { onRequest: [requireOwnerAuth], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
  async (request, reply) => {
    if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid proposal ID.' });
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) {
      return reply.code(400).send({ error: 'Provide a review reason between 5 and 500 characters.' });
    }
    const claims = request.user as { sub?: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rejected = await client.query(
        `UPDATE agent_task_proposals
            SET status = 'rejected', review_reason = $1, reviewed_by = $2, reviewed_at = NOW()
          WHERE id = $3 AND status = 'awaiting_review'
          RETURNING id, task_definition_id AS "taskDefinitionId", status,
                    review_reason AS "reviewReason", reviewed_at AS "reviewedAt"`,
        [reason, claims.sub ?? null, request.params.id],
      );
      if (!rejected.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'Proposal is missing or no longer awaiting review.' });
      }
      await client.query(
        `INSERT INTO agent_task_audit_log
          (actor_user_id, task_definition_id, proposal_id, action, result, reason, details)
         VALUES ($1, $2, $3, 'proposal_rejected', 'success', $4, $5::jsonb)`,
        [claims.sub ?? null, rejected.rows[0].taskDefinitionId, rejected.rows[0].id, reason,
          JSON.stringify({ runtimeEnabled: false, decision: 'rejected' })],
      );
      await client.query('COMMIT');
      return { proposal: rejected.rows[0], runtimeEnabled: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not reject agent task proposal');
      return reply.code(500).send({ error: 'Could not reject task proposal.' });
    } finally {
      client.release();
    }
  },
);

app.get('/api/v1/admin/permissions/settings', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(
    'SELECT enabled, updated_at AS "updatedAt", u.username AS "updatedBy" FROM admin_permission_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1',
  );
  return { settings: result.rows[0] ?? { enabled: false } };
});

app.patch<{ Body: { enabled?: boolean } }>('/api/v1/admin/permissions/settings', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const enabled = request.body?.enabled;
  if (typeof enabled !== 'boolean') return reply.code(400).send({ error: 'Provide an enabled boolean.' });
  const claims = request.user as { sub?: string };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE admin_permission_settings SET enabled = $1, updated_by = $2, updated_at = NOW() WHERE id = 1 RETURNING enabled, updated_at AS "updatedAt"',
      [enabled, claims.sub ?? null],
    );
    await client.query(
      `INSERT INTO admin_permission_audit_log (actor_user_id, action, permission, result, reason, details)
       VALUES ($1, 'kill_switch_changed', '*', 'success', $2, $3::jsonb)`,
      [claims.sub ?? null, enabled ? 'Owner enabled delegated permissions' : 'Owner disabled delegated permissions', JSON.stringify({ enabled })],
    );
    await client.query('COMMIT');
    return { ok: true, settings: result.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not update delegated permission switch');
    return reply.code(500).send({ error: 'Could not update delegated permission settings.' });
  } finally {
    client.release();
  }
});

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
        reason.length < 5 || reason.length > 500 || approvalReference.length > 200 || (permission === 'reports.manage' && !scope)) {
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
  // Activation is a separate owner decision. Provider configuration may be saved
  // while delivery remains off, so connection checks can be performed without
  // enabling OTP authentication or automatically sending a message.
  if (body.enabled === true) {
    return reply.code(409).send({ error: 'SMS delivery remains disabled. Enabling OTP authentication is not available through this configuration endpoint.' });
  }
  if (mode === 'real_provider' && provider !== 'kavenegar') {
    return reply.code(400).send({ error: 'The selected SMS provider is not supported.' });
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
    [mode, provider, senderId, templateId, encryptedKey, ttl, cooldown, attempts, dailyLimit, claims.sub ?? null]);
  await pool.query('INSERT INTO sms_otp_audit_log (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
    [claims.sub ?? null, 'settings_updated', JSON.stringify({ enabled: false, deliveryMode: mode, provider, apiKeyChanged: Boolean(body.apiKey) || body.clearApiKey === true })]);
  return { ok: true, settings: { enabled: false, deliveryMode: mode, provider, senderId, templateId,
    apiKeyConfigured: Boolean(encryptedKey), otpTtlSeconds: ttl, resendCooldownSeconds: cooldown, maxAttempts: attempts, dailyLimit } };
});


app.post('/api/v1/admin/security/sms-otp/test-connection', { onRequest: [requireOwnerAuth] }, async (request, reply) => {
  const settings = await pool.query(
    'SELECT delivery_mode, provider, encrypted_api_key FROM sms_otp_settings WHERE id = 1',
  );
  const current = settings.rows[0];
  if (current?.delivery_mode !== 'real_provider' || current.provider !== 'kavenegar') {
    return reply.code(409).send({ ok: false, error: 'Configure the Kavenegar provider in disabled mode before testing the connection.' });
  }
  const apiKey = decryptSmsApiKey(String(current.encrypted_api_key ?? ''));
  if (!apiKey) return reply.code(409).send({ ok: false, error: 'Provider credentials are not configured or could not be decrypted.' });
  const result = await createKavenegarProvider().checkConnection(apiKey);
  const claims = request.user as { sub?: string };
  await pool.query(
    'INSERT INTO sms_otp_audit_log (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
    [claims.sub ?? null, 'connection_check', JSON.stringify({ provider: 'kavenegar', result: result.ok ? 'success' : 'failed' })],
  );
  return { ok: result.ok, checkedAt: new Date().toISOString(), message: result.ok ? 'Provider connection succeeded.' : 'Provider connection failed. Check configuration in the provider dashboard.' };
});

app.post<{ Body: { phone?: string; confirmCost?: boolean } }>('/api/v1/admin/security/sms-otp/test-message', {
  onRequest: [requireOwnerAuth],
  config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
}, async (request, reply) => {
  const phone = normalizeIranianMobile(request.body?.phone);
  if (!phone || request.body?.confirmCost !== true) {
    return reply.code(400).send({ error: 'Provide a valid Iranian test number and explicitly confirm that a real SMS may incur a charge.' });
  }
  const settings = await pool.query(
    'SELECT delivery_mode, provider, template_id, encrypted_api_key FROM sms_otp_settings WHERE id = 1',
  );
  const current = settings.rows[0];
  if (current?.delivery_mode !== 'real_provider' || current.provider !== 'kavenegar' || !String(current.template_id ?? '').trim()) {
    return reply.code(409).send({ error: 'Configure a supported provider and approved verification template before testing.' });
  }
  const apiKey = decryptSmsApiKey(String(current.encrypted_api_key ?? ''));
  if (!apiKey) return reply.code(409).send({ error: 'Provider credentials are not configured or could not be decrypted.' });
  const code = createOtpCode();
  const result = await createKavenegarProvider().sendOtp({
    apiKey,
    phoneE164: phone,
    code,
    template: String(current.template_id),
  });
  const claims = request.user as { sub?: string };
  const maskedPhone = `***${phone.slice(-4)}`;
  await pool.query(
    'INSERT INTO sms_otp_audit_log (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
    [claims.sub ?? null, 'test_message', JSON.stringify({ provider: 'kavenegar', phone: maskedPhone, result: result.ok ? 'success' : 'failed' })],
  );
  if (!result.ok) return reply.code(502).send({ ok: false, error: 'The provider did not accept the test message. Provider details were withheld from logs.' });
  return { ok: true, message: 'The provider accepted the test message. No OTP value was returned by the API.' };
});

app.get('/api/v1/admin/security/sms-otp/audit', { onRequest: [requireOwnerAuth] }, async () => {
  const result = await pool.query(`SELECT l.id, l.action, l.details, l.created_at AS "createdAt", u.username AS "actorUsername"
    FROM sms_otp_audit_log l LEFT JOIN users u ON u.id = l.actor_user_id ORDER BY l.created_at DESC LIMIT 100`);
  return { entries: result.rows };
});


app.get('/api/v1/auth/phone-otp/status', async () => {
  const settings = await pool.query('SELECT enabled, delivery_mode, provider FROM sms_otp_settings WHERE id = 1');
  const runtime = otpRuntimeAllowed(settings.rows[0]);
  return { available: runtime.simulator || runtime.live, simulator: runtime.simulator };
});

/**
 * Development-only OTP simulator. It deliberately does not authenticate users,
 * issue JWTs, or send real SMS. Production requests are rejected even if the
 * database settings are accidentally changed.
 */
app.post<{ Body: { phone?: string; purpose?: string } }>('/api/v1/auth/phone-otp/request', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
}, async (request, reply) => {
  const phone = normalizeIranianMobile(request.body?.phone);
  const purpose = request.body?.purpose ?? 'verify';
  if (!phone) return reply.code(400).send({ error: 'Enter a valid Iranian mobile number.' });
  if (!['verify', 'register', 'login', 'link'].includes(purpose)) {
    return reply.code(400).send({ error: 'Invalid verification purpose.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent sends for the same normalized phone so requests cannot
    // race around the cooldown/daily-limit checks.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    await client.query(
      `DELETE FROM sms_otp_challenges
        WHERE phone_e164 = $1
          AND (created_at < NOW() - INTERVAL '2 days'
               OR (consumed_at IS NOT NULL AND consumed_at < NOW() - INTERVAL '1 day'))`,
      [phone],
    );
    const settingsResult = await client.query(
      'SELECT enabled, delivery_mode, provider, template_id, encrypted_api_key, otp_ttl_seconds, resend_cooldown_seconds, max_attempts, daily_limit FROM sms_otp_settings WHERE id = 1',
    );
    const settings = settingsResult.rows[0];
    const runtime = otpRuntimeAllowed(settings);
    if (!runtime.simulator && !runtime.live) {
      await client.query('ROLLBACK');
      return reply.code(503).send({ error: 'Phone OTP is not available.' });
    }
    if (runtime.live && !String(settings.template_id ?? '').trim()) {
      await client.query('ROLLBACK');
      return reply.code(503).send({ error: 'Phone verification provider is not fully configured.' });
    }
    const usage = await client.query(
      `SELECT COUNT(*)::int AS global_daily_count,
              COUNT(*) FILTER (WHERE phone_e164 = $1)::int AS phone_daily_count,
              MAX(created_at) FILTER (WHERE phone_e164 = $1) AS last_created_at
         FROM sms_otp_challenges
        WHERE created_at >= NOW() - INTERVAL '1 day'`,
      [phone],
    );
    const row = usage.rows[0] ?? {};
    const dailyLimit = Number(settings.daily_limit ?? 0);
    if (Number(row.global_daily_count ?? 0) >= dailyLimit ||
        Number(row.phone_daily_count ?? 0) >= dailyLimit) {
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
    const digest = digestOtp(code, otpPepper);
    const inserted = await client.query(
      `INSERT INTO sms_otp_challenges
         (phone_e164, purpose, otp_salt, otp_digest, max_attempts, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 * INTERVAL '1 second'))
       RETURNING id`,
      [phone, purpose, digest.salt, digest.digest, settings.max_attempts, settings.otp_ttl_seconds],
    );
    const challengeId = inserted.rows[0].id;
    await client.query('COMMIT');

    if (runtime.live) {
      const apiKey = decryptSmsApiKey(String(settings.encrypted_api_key ?? ''));
      if (!apiKey) {
        await pool.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challengeId]);
        return reply.code(503).send({ error: 'Phone verification provider credentials are unavailable.' });
      }
      const delivery = await createKavenegarProvider().sendOtp({
        apiKey,
        phoneE164: phone,
        code,
        template: String(settings.template_id),
      });
      await pool.query(
        'INSERT INTO sms_otp_audit_log (action, details) VALUES ($1, $2::jsonb)',
        ['otp_delivery', JSON.stringify({ purpose, phone: `***${phone.slice(-4)}`, result: delivery.ok ? 'accepted' : 'failed' })],
      );
      if (!delivery.ok) {
        await pool.query('UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE id = $1', [challengeId]);
        return reply.code(502).send({ error: 'The verification message could not be delivered.' });
      }
      return reply.code(202).send({ ok: true, message: 'If the number is eligible, a verification code has been sent.' });
    }

    // The test code is only returned by the non-production simulator.
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
  const settingsResult = await pool.query(
    'SELECT enabled, delivery_mode, provider FROM sms_otp_settings WHERE id = 1',
  );
  const runtime = otpRuntimeAllowed(settingsResult.rows[0]);
  if (!runtime.simulator && !runtime.live) {
    return reply.code(503).send({ error: 'Phone OTP is not available.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const verified = await consumeOtpChallenge(client, phone, code, 'verify');
    await client.query('COMMIT');
    if (!verified) return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
    return { verified: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Phone OTP verification failed');
    return reply.code(500).send({ error: 'Could not verify the code.' });
  } finally {
    client.release();
  }
});


app.post<{ Body: { phone?: string; code?: string; email?: string; password?: string; fullName?: string; country?: string } }>(
  '/api/v1/auth/phone-otp/register',
  { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const phone = normalizeIranianMobile(request.body?.phone);
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const fullName = typeof request.body?.fullName === 'string' ? request.body.fullName.trim() : '';
    const country = typeof request.body?.country === 'string' ? request.body.country.trim() : '';
    const password = request.body?.password;
    if (!phone || !/^\d{6}$/.test(code) || !email || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !fullName || fullName.length > 120 || country.length > 80 ||
        !isValidRegistrationPassword(password)) {
      return reply.code(400).send({ error: 'Provide a valid Iranian phone, verification code, name, email, and password of at least six characters.' });
    }
    const settingsResult = await pool.query('SELECT enabled, delivery_mode, provider FROM sms_otp_settings WHERE id = 1');
    const runtime = otpRuntimeAllowed(settingsResult.rows[0]);
    if (!runtime.simulator && !runtime.live) return reply.code(503).send({ error: 'Phone OTP registration is not available.' });

    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    const passwordHash = `${salt.toString('hex')}:${derived.toString('hex')}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const verified = await consumeOtpChallenge(client, phone, code, 'register');
      if (!verified) {
        await client.query('COMMIT');
        return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
      }
      const existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 OR phone_e164 = $2 LIMIT 1',
        [email, phone],
      );
      if (existing.rowCount) {
        await client.query('COMMIT');
        return reply.code(409).send({ error: 'An account with this email or verified phone already exists.' });
      }
      const created = await client.query(
        'INSERT INTO users (email, password_hash, full_name, phone, phone_e164, country) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, phone, phone_e164, country, created_at',
        [email, passwordHash, fullName, phone, phone, country],
      );
      const userId = String(created.rows[0].id);
      const usernameResult = await client.query(
        'UPDATE users SET username = $1 WHERE id = $2 RETURNING username',
        [`p${userId}${randomInt(1000, 9999)}`, userId],
      );
      const user = { ...created.rows[0], username: usernameResult.rows[0]?.username ?? null };
      const accessToken = app.jwt.sign({ sub: userId, email }, { expiresIn: '1h' });
      await client.query('COMMIT');
      return reply.code(201).send({
        user: { id: userId, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at },
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        await pool.query(
          'UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL',
          [phone, 'register'],
        ).catch(() => undefined);
        return reply.code(409).send({ error: 'An account with this email or verified phone already exists.' });
      }
      request.log.error({ err: error }, 'Phone OTP registration failed');
      return reply.code(500).send({ error: 'Could not create account.' });
    } finally {
      client.release();
    }
  },
);

app.post<{ Body: { phone?: string; code?: string } }>(
  '/api/v1/auth/phone-otp/login',
  { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const phone = normalizeIranianMobile(request.body?.phone);
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    if (!phone || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({ error: 'Enter a valid Iranian mobile number and six-digit code.' });
    }
    const settingsResult = await pool.query('SELECT enabled, delivery_mode, provider FROM sms_otp_settings WHERE id = 1');
    const runtime = otpRuntimeAllowed(settingsResult.rows[0]);
    if (!runtime.simulator && !runtime.live) return reply.code(503).send({ error: 'Phone OTP login is not available.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const verified = await consumeOtpChallenge(client, phone, code, 'login');
      if (!verified) {
        await client.query('COMMIT');
        return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
      }
      const found = await client.query(
        'SELECT id, email, username, full_name, phone, country, created_at FROM users WHERE phone_e164 = $1 LIMIT 1',
        [phone],
      );
      if (!found.rowCount) {
        await client.query('COMMIT');
        return reply.code(401).send({ error: 'Phone number or verification code is invalid.' });
      }
      const user = found.rows[0];
      const accessToken = app.jwt.sign({ sub: String(user.id), email: user.email }, { expiresIn: '1h' });
      await client.query('COMMIT');
      return {
        user: { id: String(user.id), username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, country: user.country, createdAt: user.created_at },
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Phone OTP login failed');
      return reply.code(500).send({ error: 'Could not log in with phone.' });
    } finally {
      client.release();
    }
  },
);

app.post<{ Body: { phone?: string; code?: string } }>(
  '/api/v1/auth/phone-otp/link',
  { onRequest: [requireMatchAuth], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const claims = request.user as { sub: string };
    const phone = normalizeIranianMobile(request.body?.phone);
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    if (!phone || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({ error: 'Enter a valid Iranian mobile number and six-digit code.' });
    }
    const settingsResult = await pool.query('SELECT enabled, delivery_mode, provider FROM sms_otp_settings WHERE id = 1');
    const runtime = otpRuntimeAllowed(settingsResult.rows[0]);
    if (!runtime.simulator && !runtime.live) return reply.code(503).send({ error: 'Phone verification is not available.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const verified = await consumeOtpChallenge(client, phone, code, 'link');
      if (!verified) {
        await client.query('COMMIT');
        return reply.code(400).send({ error: 'The verification code is invalid or expired.' });
      }
      const existing = await client.query('SELECT id FROM users WHERE phone_e164 = $1 AND id <> $2 LIMIT 1', [phone, claims.sub]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        return reply.code(409).send({ error: 'This verified phone number is already linked to another account.' });
      }
      const updated = await client.query(
        'UPDATE users SET phone = $1, phone_e164 = $1 WHERE id = $2 RETURNING id, phone_e164 AS "phoneE164"',
        [phone, claims.sub],
      );
      if (!updated.rowCount) {
        await client.query('COMMIT');
        return reply.code(404).send({ error: 'Account not found.' });
      }
      await client.query('COMMIT');
      return { ok: true, phoneE164: updated.rows[0].phoneE164 };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        await pool.query(
          'UPDATE sms_otp_challenges SET consumed_at = NOW() WHERE phone_e164 = $1 AND purpose = $2 AND consumed_at IS NULL',
          [phone, 'link'],
        ).catch(() => undefined);
        return reply.code(409).send({ error: 'This verified phone number is already linked to another account.' });
      }
      request.log.error({ err: error }, 'Phone verification linking failed');
      return reply.code(500).send({ error: 'Could not link phone number.' });
    } finally {
      client.release();
    }
  },
);

app.get('/api/v1/admin/reports', { onRequest: [requireOwnerOrPermission('reports.read')] }, async () => {
  const result = await pool.query(
    `SELECT r.id, r.reported_user_id AS "reportedUserId", target.username AS "reportedUsername",
            r.reporter_id AS "reporterId", reporter.username AS "reporterUsername",
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
        AND created_at <= NOW() - INTERVAL '60 seconds'`,
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
            s.level, s.xp_points AS "xpPoints",
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
            COALESCE(s.level, 1)::int AS level,
            COALESCE(s.xp_points, 0)::int AS "xpPoints",
            COUNT(*)::int AS "gamesPlayed",
            COUNT(*) FILTER (WHERE p.winner_user_id = p.user_id)::int AS wins,
            COUNT(*) FILTER (WHERE p.winner_user_id <> p.user_id)::int AS losses,
            (COUNT(*) FILTER (WHERE p.winner_user_id = p.user_id) * 3)::int AS score
       FROM participants p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN backgammon_player_stats s ON s.user_id = p.user_id
      GROUP BY p.user_id, u.username, u.avatar_data_url, s.rating, s.level, s.xp_points
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
  await cleanupExpiredEmptyRooms();
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
        `INSERT INTO backgammon_matches (room_code, host_user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '60 seconds')
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
  // Also clean up expired rooms when the notifications screen is polling.
  await cleanupExpiredEmptyRooms();
  // Invitation cards expire after 60 seconds. Mark them responded without
  // deleting the waiting room, so the host can invite the same friend again.
  await pool.query(
    `UPDATE backgammon_match_invites SET status = 'rejected', responded_at = NOW()
      WHERE invitee_id = $1 AND status = 'pending'
        AND created_at <= NOW() - INTERVAL '60 seconds'`,
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
            (i.created_at + INTERVAL '60 seconds') AS "expiresAt",
            m.room_code AS "roomCode", m.status AS "matchStatus",
            inviter.username AS "inviterUsername",
            inviter.avatar_data_url AS "inviterAvatarDataUrl"
       FROM backgammon_match_invites i
       JOIN backgammon_matches m ON m.id = i.match_id
       JOIN users inviter ON inviter.id = i.inviter_id
      WHERE i.invitee_id = $1 AND i.status = 'pending' AND m.status = 'waiting'
        AND m.guest_user_id IS NULL AND m.expires_at > NOW()
        AND i.created_at > NOW() - INTERVAL '60 seconds'
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
      // This lets the host re-invite after the 60-second invitation expiry even if
      // the invitee has not reopened the lobby to trigger its cleanup endpoint.
      await client.query(
        `UPDATE backgammon_match_invites
            SET status = 'rejected', responded_at = NOW()
          WHERE match_id = $1 AND invitee_id = $2 AND status = 'pending'
            AND created_at <= NOW() - INTERVAL '60 seconds'`,
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
      // card remains valid for 60 seconds.
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
        `SELECT created_at > NOW() - INTERVAL '60 seconds' AS fresh
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
        await client.query(
          `INSERT INTO backgammon_match_presence (match_id, user_id)
           VALUES ($1, $2), ($1, $3)
           ON CONFLICT (match_id, user_id) DO UPDATE
             SET last_heartbeat_at = NOW(), disconnected_at = NULL,
                 takeover_active = FALSE, takeover_started_at = NULL`,
          [request.params.id, m.host_user_id, m.guest_user_id],
        );
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
        await awardProgression(client, match.id, 'match-resignation', winnerUserId, claims.sub, 'quit');
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
                winner_user_id = CASE WHEN $1 = 'finished' THEN $2::bigint ELSE NULL END,
                finish_reason = CASE WHEN $1 = 'finished' THEN 'resignation' ELSE NULL END,
                host_game_wins = $3, guest_game_wins = $4,
                board_state = CASE WHEN $1 = 'active' THEN $5::jsonb ELSE board_state END,
                bar_state = CASE WHEN $1 = 'active' THEN '{"host":0,"guest":0}'::jsonb ELSE bar_state END,
                off_state = CASE WHEN $1 = 'active' THEN '{"host":0,"guest":0}'::jsonb ELSE off_state END,
                current_turn_user_id = CASE WHEN $1 = 'active' THEN $6::bigint ELSE NULL END,
                dice = '[]'::jsonb, remaining_dice = '[]'::jsonb,
                cancellation_proposed_by = NULL, cancellation_accepted_by = NULL,
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $7`,
        [matchFinished ? 'finished' : 'active', winnerUserId, nextHostWins, nextGuestWins,
         JSON.stringify(INITIAL_BACKGAMMON_BOARD), winnerUserId, match.id],
      );
      const gameNumber = Number(match.host_game_wins ?? 0) + Number(match.guest_game_wins ?? 0) + 1;
      await awardProgression(client, match.id, `game:${gameNumber}`, winnerUserId, claims.sub, 'quit');
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
    if (await isTemporaryAiControlActive(client, match.id, claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Temporary AI control is active for this disconnected player. Reconnect with a heartbeat to regain control.' });
    }
    if (await isTemporaryAiControlActive(client, match.id, claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Temporary AI control is active for this disconnected player. Reconnect with a heartbeat to regain control.' });
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
    if (gameFinished && game.guest_user_id) {
      const winnerId = simulated.off.host >= 15 ? game.host_user_id : game.guest_user_id;
      const loserId = winnerId === game.host_user_id ? game.guest_user_id : game.host_user_id;
      const gameNumber = Number(game.host_game_wins ?? 0) + Number(game.guest_game_wins ?? 0) + 1;
      await awardProgression(client, game.id, `game:${gameNumber}`, winnerId, loserId, 'loss');
      if (matchFinished) await updateBackgammonRatings(client, winnerId, loserId);
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
    if (gameFinished && game.guest_user_id) {
      const winnerId = off.host >= 15 ? game.host_user_id : game.guest_user_id;
      const loserId = winnerId === game.host_user_id ? game.guest_user_id : game.host_user_id;
      const gameNumber = Number(game.host_game_wins ?? 0) + Number(game.guest_game_wins ?? 0) + 1;
      await awardProgression(client, game.id, `game:${gameNumber}`, winnerId, loserId, 'loss');
      if (matchFinished) await updateBackgammonRatings(client, winnerId, loserId);
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
    if (await isTemporaryAiControlActive(client, match.id, claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Temporary AI control is active for this disconnected player. Reconnect with a heartbeat to regain control.' });
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
app.post<{ Params: { id: string } }>('/api/v1/matches/:id/heartbeat', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, status, host_user_id, guest_user_id FROM backgammon_matches WHERE id = $1 FOR UPDATE`,
      [request.params.id],
    );
    const match = found.rows[0];
    if (!match || ![String(match.host_user_id), String(match.guest_user_id)].includes(claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Match not found.' });
    }
    if (match.status !== 'active') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Only an active match accepts presence heartbeats.' });
    }
    const result = await client.query(
      `INSERT INTO backgammon_match_presence
         (match_id, user_id, last_heartbeat_at, disconnected_at, takeover_active, takeover_started_at)
       VALUES ($1, $2, NOW(), NULL, FALSE, NULL)
       ON CONFLICT (match_id, user_id) DO UPDATE
         SET last_heartbeat_at = NOW(), disconnected_at = NULL,
             takeover_active = FALSE, takeover_started_at = NULL
       RETURNING last_heartbeat_at AS "lastHeartbeatAt", takeover_active AS "takeoverActive"`,
      [request.params.id, claims.sub],
    );
    await client.query('COMMIT');
    return { presence: result.rows[0], control: 'human' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    request.log.error({ err: error }, 'Could not update match heartbeat');
    return reply.code(500).send({ error: 'Could not update match heartbeat.' });
  } finally { client.release(); }
});

app.get<{ Params: { id: string } }>('/api/v1/matches/:id/state', { onRequest: [requireMatchAuth] }, async (request, reply) => {
  const claims = request.user as { sub: string };
  if (!isNumericId(request.params.id)) return reply.code(400).send({ error: 'Invalid match id.' });
  await processTemporaryAiTakeover(request.params.id, claims.sub);
  const result = await pool.query(
    `SELECT m.id, m.status, m.board_state AS board, m.bar_state AS bar, m.off_state AS off,
            m.current_turn_user_id AS "currentTurnUserId",
            m.current_turn_user_id = $2::bigint AS "isMyTurn",
            m.host_user_id = $2::bigint AS "isHost",
            m.dice, m.remaining_dice AS "remainingDice", m.state_version AS version,
            m.updated_at AS "updatedAt", COALESCE(p.takeover_active, FALSE) AS "aiTakeoverActive",
            p.last_heartbeat_at AS "lastHeartbeatAt"
       FROM backgammon_matches m
       LEFT JOIN backgammon_match_presence p ON p.match_id = m.id AND p.user_id = $2
      WHERE m.id = $1 AND (m.host_user_id = $2 OR m.guest_user_id = $2) AND m.expires_at > NOW()`,
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
    if (await isTemporaryAiControlActive(client, match.id, claims.sub)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'Temporary AI control is active for this disconnected player. Reconnect with a heartbeat to regain control.' });
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
      WHERE id = $1 AND host_user_id = $2 AND status = 'waiting' AND guest_user_id IS NULL
      RETURNING id, room_code AS "roomCode", status`,
    [request.params.id, claims.sub]);
  if (result.rowCount) return { match: result.rows[0] };
  const existing = await pool.query(
    `SELECT status FROM backgammon_matches WHERE id = $1 AND host_user_id = $2`,
    [request.params.id, claims.sub]);
  if (!existing.rowCount) return reply.code(404).send({ error: 'Match not found.' });
  return reply.code(409).send({ error: 'Only an empty waiting room can be closed by its host.' });
});
// Neon Function Trigger calls this route on its schedule to remove expired rooms
// even when the API runtime has scaled to zero and no user is making requests.
app.post('/internal/cleanup-expired-empty-rooms', async (request, reply) => {
  if (!request.headers['x-neon-trigger-invocation-id']) {
    return reply.code(403).send({ error: 'Scheduled trigger invocation required.' });
  }
  try {
    const deletedRooms = await cleanupExpiredEmptyRooms();
    return { ok: true, deletedRooms };
  } catch (error) {
    request.log.error({ err: error }, 'Scheduled empty-room cleanup failed');
    return reply.code(500).send({ error: 'Could not clean up expired empty rooms.' });
  }
});

app.addHook('onClose', async () => { await pool.end(); });

export { app };

// Neon Functions invoke a Fetch-compatible handler; traditional hosts keep the normal listener.
if (process.env.NEON_FUNCTION_RUNTIME !== '1') {
  // Keep database cleanup automatic on long-running API hosts. Serverless runtimes
  // use cleanupExpiredEmptyRooms() on room-list and invitation requests instead.
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredEmptyRooms().catch((error) => {
      app.log.error({ err: error }, 'Could not clean up expired empty rooms');
    });
  }, 5_000);
  cleanupTimer.unref();
  app.addHook('onClose', async () => { clearInterval(cleanupTimer); });
  const disconnectTakeoverTimer = setInterval(() => {
    void processDueTemporaryAiTakeovers().catch((error) => {
      app.log.error({ err: error }, 'Temporary AI takeover scan failed');
    });
  }, 2_000);
  disconnectTakeoverTimer.unref();
  app.addHook('onClose', async () => { clearInterval(disconnectTakeoverTimer); });
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
