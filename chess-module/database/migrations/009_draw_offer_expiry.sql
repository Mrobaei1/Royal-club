ALTER TABLE chess_draw_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '30 seconds');

UPDATE chess_draw_offers
SET expires_at = created_at + INTERVAL '30 seconds'
WHERE status='pending' AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS chess_pending_draw_expiry_idx
  ON chess_draw_offers(expires_at) WHERE status='pending';
