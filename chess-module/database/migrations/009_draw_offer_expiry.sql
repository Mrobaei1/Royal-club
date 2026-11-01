ALTER TABLE chess_draw_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE chess_draw_offers
SET expires_at = created_at + INTERVAL '30 seconds'
WHERE expires_at IS NULL;

ALTER TABLE chess_draw_offers
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 seconds'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS chess_pending_draw_expiry_idx
  ON chess_draw_offers(expires_at) WHERE status='pending';
