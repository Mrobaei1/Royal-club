-- Apply once as the database owner before starting the UNO runtime.
-- The runtime role receives access only to these columns and this snapshot table.
CREATE TABLE IF NOT EXISTS public.uno_room_snapshots (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  state JSONB NOT NULL DEFAULT '{"rooms":[]}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.uno_room_snapshots (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
