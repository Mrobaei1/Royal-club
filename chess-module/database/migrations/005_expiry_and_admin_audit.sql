-- Complete isolated chess schema fields used by room expiry, draw expiry and admin audit.
-- This migration is applied only by the standalone chess module migration runner.

ALTER TABLE chess_rooms
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE chess_rooms
SET expires_at = created_at + INTERVAL '10 minutes'
WHERE expires_at IS NULL;

ALTER TABLE chess_rooms
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '10 minutes'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS chess_waiting_rooms_expiry_idx
  ON chess_rooms(expires_at)
  WHERE status = 'waiting';

ALTER TABLE chess_draw_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE chess_draw_offers
SET expires_at = created_at + INTERVAL '60 seconds'
WHERE expires_at IS NULL;

ALTER TABLE chess_draw_offers
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '60 seconds'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS chess_pending_draw_expiry_idx
  ON chess_draw_offers(expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS chess_admin_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chess_admin_audit_created_idx
  ON chess_admin_audit_events(created_at DESC, id DESC);
