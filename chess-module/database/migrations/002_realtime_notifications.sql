CREATE OR REPLACE FUNCTION chess_emit_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  game_key text;
  event_payload json;
BEGIN
  IF TG_TABLE_NAME = 'chess_games' THEN
    game_key := NEW.id::text;
    event_payload := json_build_object('type','state','id',NEW.id::text);
  ELSIF TG_TABLE_NAME = 'chess_chat_messages' THEN
    game_key := NEW.game_id::text;
    event_payload := json_build_object('type','chat','id',NEW.id::text);
  END IF;
  IF game_key IS NOT NULL THEN
    PERFORM pg_notify('chess_game_' || game_key,event_payload::text);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chess_games_realtime_notify ON chess_games;
CREATE TRIGGER chess_games_realtime_notify AFTER UPDATE ON chess_games
FOR EACH ROW EXECUTE FUNCTION chess_emit_realtime_event();

DROP TRIGGER IF EXISTS chess_chat_realtime_notify ON chess_chat_messages;
CREATE TRIGGER chess_chat_realtime_notify AFTER INSERT ON chess_chat_messages
FOR EACH ROW EXECUTE FUNCTION chess_emit_realtime_event();

