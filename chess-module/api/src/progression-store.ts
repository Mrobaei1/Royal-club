import type { PoolClient } from "pg";
import { chessAwardDeltas, nextProgression, type ChessResult } from "./progression.js";

/** Call inside the same transaction that marks the chess game terminal. */
export async function awardChessResult(
  client: PoolClient,
  gameId: string,
  eventKey: string,
  whiteUserId: string,
  blackUserId: string,
  result: ChessResult,
): Promise<void> {
  const awards=chessAwardDeltas(result,whiteUserId,blackUserId);
  for (const [userId,delta] of awards) {
    await client.query(
      "INSERT INTO chess_player_progression (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [userId],
    );
    const event=await client.query(
      `INSERT INTO chess_progression_events (game_id,event_key,user_id,xp_delta)
       VALUES ($1,$2,$3,$4) ON CONFLICT (game_id,event_key,user_id) DO NOTHING RETURNING id`,
      [gameId,eventKey,userId,delta],
    );
    if (event.rowCount !== 1) continue;
    const current=await client.query(
      "SELECT level,xp FROM chess_player_progression WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    const row=current.rows[0] as {level:number|string;xp:number|string}|undefined;
    if (!row) throw new Error("chess_progression_row_missing");
    const next=nextProgression({level:Number(row.level),xp:Number(row.xp)},delta);
    await client.query(
      "UPDATE chess_player_progression SET level=$2,xp=$3,updated_at=NOW() WHERE user_id=$1",
      [userId,next.level,next.xp],
    );
  }
}
