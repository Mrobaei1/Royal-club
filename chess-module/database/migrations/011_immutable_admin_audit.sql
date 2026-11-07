CREATE OR REPLACE FUNCTION chess_reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'chess_audit_events_are_immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS chess_admin_audit_immutable ON chess_admin_audit_events;
CREATE TRIGGER chess_admin_audit_immutable
BEFORE UPDATE OR DELETE ON chess_admin_audit_events
FOR EACH ROW EXECUTE FUNCTION chess_reject_audit_event_mutation();
