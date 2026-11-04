-- Royal Club production schema reconciliation.
-- Generated from the source declarations in apps/api/src/server.ts on 2026-11-04.
-- ADDITIVE ONLY. Test on an isolated Neon branch before any production use.
-- Do not run against Production without a separately approved backup/restore and release plan.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_change_count INTEGER NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass
       AND conname = 'users_token_version_nonnegative_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_token_version_nonnegative_check
      CHECK (token_version >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass
       AND conname = 'users_avatar_change_count_nonnegative_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_avatar_change_count_nonnegative_check
      CHECK (avatar_change_count >= 0) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE users VALIDATE CONSTRAINT users_token_version_nonnegative_check;
ALTER TABLE users VALIDATE CONSTRAINT users_avatar_change_count_nonnegative_check;

-- Preserve the existing application startup backfill semantics for legacy avatars.
UPDATE users
   SET avatar_change_count = 1
 WHERE avatar_data_url IS NOT NULL
   AND avatar_change_count = 0;

-- The existing legacy index is case-sensitive; add the source-required case-folded
-- uniqueness guarantee without dropping or rewriting the legacy index.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_casefold_unique_idx
  ON users (LOWER(username))
  WHERE username IS NOT NULL;

ALTER TABLE backgammon_matches
  ADD COLUMN IF NOT EXISTS turn_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS account_customization_pricing (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  avatar_change_price_credits BIGINT NOT NULL DEFAULT 0
    CHECK (avatar_change_price_credits >= 0),
  username_change_price_credits BIGINT NOT NULL DEFAULT 0
    CHECK (username_change_price_credits >= 0),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed only the singleton default row; existing manager-configured values are preserved.
INSERT INTO account_customization_pricing (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_token_revocations (
  jti TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_token_revocations_expiry_idx
  ON auth_token_revocations (expires_at);

-- Fail closed if a pre-existing object was present with an unexpected definition.
DO $verify$
BEGIN
  -- Names alone are not sufficient: an existing constraint with the expected
  -- name but a weaker expression must abort this migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='users'::regclass
       AND conname='users_token_version_nonnegative_check'
       AND contype='c'
       AND pg_get_constraintdef(oid) = 'CHECK ((token_version >= 0))'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='users'::regclass
       AND conname='users_avatar_change_count_nonnegative_check'
       AND contype='c'
       AND pg_get_constraintdef(oid) = 'CHECK ((avatar_change_count >= 0))'
  ) THEN
    RAISE EXCEPTION 'Royal Club schema reconciliation: user nonnegative CHECK definition mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='users' AND column_name='token_version'
       AND data_type='integer' AND is_nullable='NO' AND column_default='0'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='users' AND column_name='avatar_change_count'
       AND data_type='integer' AND is_nullable='NO' AND column_default='0'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='backgammon_matches' AND column_name='turn_started_at'
       AND data_type='timestamp with time zone' AND is_nullable='NO'
       AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
  ) THEN
    RAISE EXCEPTION 'Royal Club schema reconciliation: existing user/match column definition mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='account_customization_pricing' AND column_name='id'
       AND data_type='integer' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='account_customization_pricing' AND column_name='avatar_change_price_credits'
       AND data_type='bigint' AND is_nullable='NO' AND column_default='0'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='account_customization_pricing' AND column_name='username_change_price_credits'
       AND data_type='bigint' AND is_nullable='NO' AND column_default='0'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='account_customization_pricing' AND column_name='updated_by'
       AND data_type='bigint' AND is_nullable='YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='account_customization_pricing' AND column_name='updated_at'
       AND data_type='timestamp with time zone' AND is_nullable='NO'
       AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
  ) THEN
    RAISE EXCEPTION 'Royal Club schema reconciliation: account_customization_pricing definition mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='auth_token_revocations' AND column_name='jti'
       AND data_type='text' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='auth_token_revocations' AND column_name='user_id'
       AND data_type='bigint' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='auth_token_revocations' AND column_name='expires_at'
       AND data_type='timestamp with time zone' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='auth_token_revocations' AND column_name='created_at'
       AND data_type='timestamp with time zone' AND is_nullable='NO'
       AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
  ) THEN
    RAISE EXCEPTION 'Royal Club schema reconciliation: auth_token_revocations definition mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='account_customization_pricing'::regclass
       AND contype='p'
       AND pg_get_constraintdef(oid) ILIKE '%PRIMARY KEY (id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='account_customization_pricing'::regclass
       AND contype='c'
       AND pg_get_constraintdef(oid) ILIKE '%id = 1%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='account_customization_pricing'::regclass
       AND contype='c'
       AND pg_get_constraintdef(oid) ILIKE '%avatar_change_price_credits >= 0%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='account_customization_pricing'::regclass
       AND contype='c'
       AND pg_get_constraintdef(oid) ILIKE '%username_change_price_credits >= 0%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='account_customization_pricing'::regclass
       AND contype='f'
       AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='auth_token_revocations'::regclass
       AND contype='p'
       AND pg_get_constraintdef(oid) ILIKE '%PRIMARY KEY (jti)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='auth_token_revocations'::regclass
       AND contype='f'
       AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='auth_token_revocations_expiry_idx'
       AND indexdef ILIKE '%(expires_at)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='users_username_casefold_unique_idx'
       AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
       AND indexdef ILIKE '%lower(username)%'
       AND indexdef ILIKE '%username IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'Royal Club schema reconciliation: expected constraint or index missing';
  END IF;
END
$verify$;

COMMIT;
