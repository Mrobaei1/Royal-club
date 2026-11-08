import 'dotenv/config';
import { Pool } from 'pg';
import { normalizeDatabaseConnectionString } from './database-config.js';
import { PostgresRoomRepository } from './hokm/postgres-repository.js';
import { HokmRoomService } from './hokm/service.js';
import { HokmDeadlineScheduler } from './hokm/deadline-scheduler.js';

const connectionString = normalizeDatabaseConnectionString(process.env.DATABASE_URL);
if (!connectionString) throw new Error('DATABASE_URL is required for the Hokm worker.');

const intervalMs = Number(process.env.HOKM_SCHEDULER_INTERVAL_MS ?? 250);
const batchSize = Number(process.env.HOKM_SCHEDULER_BATCH_SIZE ?? 100);
if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 60_000) {
  throw new Error('HOKM_SCHEDULER_INTERVAL_MS must be between 50 and 60000.');
}
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
  throw new Error('HOKM_SCHEDULER_BATCH_SIZE must be between 1 and 1000.');
}

function safeDatabaseError(error: unknown) {
  const candidate = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : {};
  const code = typeof candidate.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(candidate.code)
    ? candidate.code
    : null;
  return {
    errorType: typeof candidate.name === 'string' ? candidate.name.slice(0, 64) : 'unknown_error',
    errorCode: code
  };
}

const pool = new Pool({ connectionString, max: 10 });
await pool.query('SELECT 1 FROM hokm_rooms LIMIT 0');

const repository = new PostgresRoomRepository(pool);
const service = new HokmRoomService({ repository });
const scheduler = new HokmDeadlineScheduler({
  service,
  repository,
  intervalMs,
  batchSize,
  onError(error: unknown, context?: { roomId?: string; scope?: string }) {
    // Never log room payloads, hands, credentials, or connection strings.
    console.error(JSON.stringify({
      event: 'hokm_deadline_scheduler_error',
      roomId: context?.roomId ?? null,
      scope: context?.scope ?? null,
      ...safeDatabaseError(error),
      at: new Date().toISOString()
    }));
  },
  onPoll(metrics) {
    // Emit a compact heartbeat every ten seconds; errors are emitted immediately above.
    if (metrics.pollCount % 40 !== 0) return;
    console.info(JSON.stringify({
      event: 'hokm_deadline_scheduler_heartbeat',
      pollCount: metrics.pollCount,
      failedPollCount: metrics.failedPollCount,
      failedRooms: metrics.failedRooms,
      discoveredRooms: metrics.discoveredRooms,
      processedTransitions: metrics.processedTransitions,
      lastSuccessfulPollAt: metrics.lastSuccessfulPollAt,
      lastPollDurationMs: metrics.lastPollDurationMs,
      oldestOverdueMs: metrics.oldestOverdueMs,
      isRunning: metrics.isRunning,
      at: new Date().toISOString()
    }));
  }
});

scheduler.start();
console.info(JSON.stringify({
  event: 'hokm_deadline_scheduler_started',
  intervalMs,
  batchSize
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
