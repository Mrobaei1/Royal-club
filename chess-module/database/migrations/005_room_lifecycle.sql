-- Lifecycle cleanup for abandoned private rooms and stale matchmaking entries.
ALTER TABLE chess_rooms
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE chess_rooms
SET expires_at = created_at + INTERVAL '10 minutes'
WHERE status = 'waiting' AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS chess_waiting_rooms_expiry_idx
  ON chess_rooms(expires_at) WHERE status='waiting';

CREATE INDEX IF NOT EXISTS chess_matchmaking_queue_created_idx
  ON chess_matchmaking_queue(created_at);
