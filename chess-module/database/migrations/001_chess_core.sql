-- Standalone module only. This migration is not included in production migration discovery.
CREATE TABLE IF NOT EXISTS chess_time_controls (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  base_ms integer NOT NULL CHECK (base_ms >= 1000),
  increment_ms integer NOT NULL DEFAULT 0 CHECK (increment_ms >= 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chess_time_controls (id, display_name, base_ms, increment_ms, enabled)
VALUES ('ultra_fast','فوق سریع',90000,0,true),
       ('rapid','سریع',300000,0,true),
       ('classical','کلاسیک',900000,0,true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS chess_player_progression (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chess_rooms (
  id bigserial PRIMARY KEY,
  room_code text NOT NULL UNIQUE,
  host_user_id bigint NOT NULL REFERENCES users(id),
  min_opponent_level integer NOT NULL DEFAULT 1 CHECK (min_opponent_level >= 1),
  time_control_id text NOT NULL REFERENCES chess_time_controls(id),
  settings_snapshot jsonb,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chess_games (
  id bigserial PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES chess_rooms(id),
  white_user_id bigint NOT NULL REFERENCES users(id),
  black_user_id bigint NOT NULL REFERENCES users(id),
  initial_fen text NOT NULL,
  current_fen text NOT NULL,
  pgn text NOT NULL DEFAULT '',
  clock_snapshot jsonb NOT NULL,
  settings_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','white_win','black_win','draw','aborted')),
  revision bigint NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (white_user_id <> black_user_id)
);

CREATE TABLE IF NOT EXISTS chess_moves (
  id bigserial PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
  ply integer NOT NULL CHECK (ply > 0),
  user_id bigint NOT NULL REFERENCES users(id),
  from_square char(2) NOT NULL,
  to_square char(2) NOT NULL,
  promotion char(1),
  san text NOT NULL,
  fen_after text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, ply)
);

CREATE TABLE IF NOT EXISTS chess_progression_events (
  id bigserial PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id),
  event_key text NOT NULL,
  user_id bigint NOT NULL REFERENCES users(id),
  xp_delta integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, event_key, user_id)
);

CREATE TABLE IF NOT EXISTS chess_chat_messages (
  id bigserial PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chess_voice_leases (
  room_id bigint PRIMARY KEY REFERENCES chess_rooms(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS chess_games_players_idx ON chess_games (white_user_id, black_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS chess_chat_game_created_idx ON chess_chat_messages (game_id, created_at);
CREATE INDEX IF NOT EXISTS chess_progression_user_idx ON chess_progression_events (user_id, created_at DESC);
