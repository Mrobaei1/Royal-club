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

COMMIT;
