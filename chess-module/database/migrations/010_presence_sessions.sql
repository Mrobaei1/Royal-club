-- Track every authenticated WebSocket connection independently so one device closing
-- cannot mark a player offline while another device remains connected.
CREATE TABLE IF NOT EXISTS chess_presence_sessions (
  session_id uuid PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_presence_sessions_player_game_idx
  ON chess_presence_sessions(game_id,user_id);
