import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { settleClock, type ClockSnapshot, type TimeControl } from "./clock.js";
import { awardChessResult } from "./progression-store.js";

type ActiveGameRow = {
  id: string | number;
  room_id: string | number;
  white_user_id: string | number;
  black_user_id: string | number;
  clock_snapshot: ClockSnapshot;
  settings_snapshot: { timeControl: TimeControl };
};

const scheduledApps = new WeakSet<FastifyInstance>();

/**
 * One bounded sweep. Row locks with SKIP LOCKED make concurrent API instances safe:
 * exactly one instance can adjudicate a given expired game.
 */
export async function adjudicateExpiredChessClocks(pool: Pool, now = Date.now()): Promise<number> {
  const candidates = await pool.query(
    "SELECT id FROM chess_games WHERE status='active' AND clock_snapshot->>'active' IN ('white','black') ORDER BY id LIMIT 100"
  );
  let adjudicated = 0;

  for (const candidate of candidates.rows as Array<{ id: string | number }>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query(
        "SELECT id,room_id,white_user_id,black_user_id,clock_snapshot,settings_snapshot FROM chess_games WHERE id=$1 AND status='active' FOR UPDATE SKIP LOCKED",
        [candidate.id]
      );
      const row = locked.rows[0] as ActiveGameRow | undefined;
      if (!row) {
        await client.query("COMMIT");
        continue;
      }

      const clock = row.clock_snapshot;
      if (clock.finished || clock.active === null || clock.lastStartedAt === null) {
        await client.query("COMMIT");
        continue;
      }

      const settled = settleClock(clock, row.settings_snapshot.timeControl, now, false);
      if (!settled.finished) {
        await client.query("COMMIT");
        continue;
      }

      const white = String(row.white_user_id);
      const black = String(row.black_user_id);
      const winner = clock.active === "white" ? black : white;
      const status = winner === white ? "white_win" : "black_win";
      const frozen = { ...settled, active: null, lastStartedAt: null, finished: true };

      await client.query(
        "UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",
        [row.id, status, JSON.stringify(frozen)]
      );
      await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1", [row.room_id]);
      await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1", [row.room_id]);
      await awardChessResult(client, String(row.id), "final_result", white, black, {
        outcome: "win",
        winnerId: winner,
        loserId: winner === white ? black : white
      });
      await client.query("COMMIT");
      adjudicated += 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  return adjudicated;
}

export function startChessClockScheduler(app: FastifyInstance, pool: Pool, intervalMs = 500): void {
  if (scheduledApps.has(app)) return;
  scheduledApps.add(app);
  let running = false;
  let timer: ReturnType<typeof setInterval>;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await adjudicateExpiredChessClocks(pool);
    } catch (error) {
      app.log.error({ err: error }, "chess clock scheduler sweep failed");
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    // Wait for an in-flight sweep before the pool is closed by the host.
    while (running) await new Promise(resolve => setTimeout(resolve, 10));
  });
}
