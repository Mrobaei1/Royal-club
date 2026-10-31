CREATE OR REPLACE FUNCTION chess_cancel_pending_draws_on_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pending_offer record;
BEGIN
  IF OLD.status='active' AND NEW.status<>'active' THEN
    FOR pending_offer IN
      UPDATE chess_draw_offers
      SET status='cancelled', responded_at=NOW()
      WHERE game_id=NEW.id AND status='pending'
      RETURNING id
    LOOP
      PERFORM pg_notify(
        'chess_game_' || NEW.id::text,
        json_build_object(
          'type','draw_response',
          'offerId',pending_offer.id::text,
          'status','cancelled'
        )::text
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chess_cancel_pending_draws_terminal ON chess_games;
CREATE TRIGGER chess_cancel_pending_draws_terminal
AFTER UPDATE OF status ON chess_games
FOR EACH ROW EXECUTE FUNCTION chess_cancel_pending_draws_on_terminal();
