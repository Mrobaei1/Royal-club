-- Isolated chess matchmaking queue. Applied only with the standalone module migrations.
CREATE TABLE IF NOT EXISTS chess_matchmaking_queue (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  time_control_id text NOT NULL REFERENCES chess_time_controls(id),
  min_opponent_level integer NOT NULL DEFAULT 1 CHECK (min_opponent_level >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_matchmaking_queue_search_idx
  ON chess_matchmaking_queue(time_control_id, created_at);
