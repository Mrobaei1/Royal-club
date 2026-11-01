-- Apply once to the dedicated Hokm schema/database.
-- Room transitions and all XP aggregate writes are committed atomically by
-- PostgresRoomRepository.compareAndSwap.
CREATE TABLE IF NOT EXISTS hokm_rooms (
  room_id text PRIMARY KEY,
  version integer NOT NULL CHECK (version >= 1),
  room_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hokm_player_progress (
  user_id text PRIMARY KEY,
  xp double precision NOT NULL CHECK (xp >= 0),
  level integer NOT NULL CHECK (level >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hokm_rooms_updated_at_idx ON hokm_rooms (updated_at);
