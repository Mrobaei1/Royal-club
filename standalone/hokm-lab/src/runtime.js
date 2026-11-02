import { HokmRoomService } from "./service.js";
import { PostgresRoomRepository } from "./postgres-repository.js";
import { HokmDeadlineScheduler } from "./deadline-scheduler.js";
import { registerHokmRoutes } from "./fastify-routes.js";

/**
 * Assemble the Hokm API/service/scheduler using the host application's
 * authenticated Fastify preHandler and node-postgres Pool.
 *
 * The caller owns Fastify and Pool lifecycle. Start the scheduler only after
 * the database migration has been applied and the server is ready to serve.
 */
export async function createHokmRuntime({
  fastify,
  pool,
  authenticate,
  now = () => Date.now(),
  schedulerIntervalMs = 250,
  schedulerBatchSize = 100,
  onSchedulerError = () => {},
  servicePrincipal = { authenticated: true, userId: "hokm-deadline-scheduler", role: "system" }
} = {}) {
  if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
    throw new TypeError("A live node-postgres Pool is required");
  }
  const repository = new PostgresRoomRepository(pool);
  const service = new HokmRoomService({ repository, now });
  const scheduler = new HokmDeadlineScheduler({
    service, repository, now, intervalMs: schedulerIntervalMs,
    batchSize: schedulerBatchSize, onError: onSchedulerError, servicePrincipal
  });
  await registerHokmRoutes(fastify, { service, authenticate });
  return Object.freeze({
    repository,
    service,
    scheduler,
    start() { return scheduler.start(); },
    stop() { return scheduler.stop(); }
  });
}
