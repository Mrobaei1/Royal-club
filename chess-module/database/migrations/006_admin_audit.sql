CREATE TABLE IF NOT EXISTS chess_admin_audit_events (
  id bigserial PRIMARY KEY,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('time_control_upsert','time_control_disable','time_control_delete')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_admin_audit_created_idx
  ON chess_admin_audit_events(created_at DESC);
