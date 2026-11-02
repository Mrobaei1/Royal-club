import 'dotenv/config';
import { Pool } from 'pg';
import { normalizeDatabaseConnectionString } from './database-config.js';
import { PostgresRoomRepository } from './hokm/postgres-repository.js';
import { HokmRoomService } from './hokm/service.js';
import { HokmDeadlineScheduler } from './hokm/deadline-scheduler.js';

const connectionString = normalizeDatabaseConnectionString(process.env.DATABASE_URL);
if (!connectionString) throw new Error('DATABASE_URL is required for the Hokm worker.');

const pool = new Pool({ connectionString, max: 10 });
await pool.query('SELECT 1 FROM hokm_rooms LIMIT 0');

const repository = new PostgresRoomRepository(pool);
const service = new HokmRoomService({ repository });
const scheduler = new HokmDeadlineScheduler({
  service,
  repository,
  intervalMs: Number(process.env.HOKM_SCHEDULER_INTERVAL_MS ?? 250),
  batchSize: Number(process.env.HOKM_SCHEDULER_BATCH_SIZE ?? 100),
  onError(error, context) {
    // Never log room payloads, hands, credentials, or connection strings.
    console.error(JSON.stringify({
      event: 'hokm_deadline_scheduler_error',
      roomId: context?.roomId ?? null,
      scope: context?.scope ?? null,
      error: error instanceof Error ? error.message : 'unknown_error',
      at: new Date().toISOString()
    }));
  }
});

scheduler.start();
console.info(JSON.stringify({
  event: 'hokm_deadline_scheduler_started',
  intervalMs: Number(process.env.HOKM_SCHEDULER_INTERVAL_MS ?? 250),
  batchSize: Number(process.env.HOKM_SCHEDULER_BATCH_SIZE ?? 100)
}));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  scheduler.stop();
  try {
    await pool.end();
    console.info(JSON.stringify({ event: 'hokm_deadline_scheduler_stopped', signal }));
    process.exit(0);
  } catch {
    console.error(JSON.stringify({ event: 'hokm_deadline_scheduler_shutdown_failed', signal }));
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
