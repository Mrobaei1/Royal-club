CREATE INDEX IF NOT EXISTS chess_chat_user_created_idx
  ON chess_chat_messages(user_id,created_at DESC);
