CREATE TABLE IF NOT EXISTS chess_draw_offers (
  id bigserial PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id) ON DELETE CASCADE,
  offered_by bigint NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_by bigint REFERENCES users(id),
  responded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS chess_one_pending_draw_offer_idx
  ON chess_draw_offers(game_id) WHERE status='pending';

CREATE TABLE IF NOT EXISTS chess_player_ratings (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1200 CHECK (rating >= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chess_rating_events (
  id bigserial PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES chess_games(id),
  user_id bigint NOT NULL REFERENCES users(id),
  rating_delta integer NOT NULL,
  rating_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id,user_id)
);
CREATE INDEX IF NOT EXISTS chess_rating_events_user_idx ON chess_rating_events(user_id,created_at DESC);
