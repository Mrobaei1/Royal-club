/**
 * Fastify route adapter for HokmRoomService.
 * Supply the application's real authentication preHandler. It must populate
 * request.auth with { authenticated: true, userId, role? } after verification.
 */
function statusFor(error) {
  const message = String(error?.message ?? "");
  if (/verified authenticated principal/.test(message)) return 401;
  if (/not a member|Only the host|trusted service principal|Only an authorized manager|cannot submit/.test(message)) return 403;
  if (/not found/.test(message)) return 404;
  if (/Stale room version|Concurrent room update|already exists|full|not accepting|already started|not completed|not playing|not accepting card plays/.test(message)) return 409;
  if (error instanceof TypeError || error instanceof RangeError) return 400;
  return 400;
}

function route(fastify, authenticate, method, url, operation) {
  fastify.route({
    method, url, preHandler: authenticate,
    handler: async (request, reply) => {
      try {
        const result = await operation(request);
        return reply.code(200).send(result);
      } catch (error) {
        return reply.code(statusFor(error)).send({ error: error.message });
      }
    }
  });
}

/** Register authenticated HTTP endpoints; identity is never read from body/query. */
export async function registerHokmRoutes(fastify, { service, authenticate }) {
  if (!fastify || typeof fastify.route !== "function") throw new TypeError("A Fastify instance is required");
  if (!service) throw new TypeError("HokmRoomService is required");
  if (typeof authenticate !== "function") throw new TypeError("Authentication preHandler is required");

  route(fastify, authenticate, "POST", "/hokm/rooms", request =>
    service.create(request.auth, {
      privateRoom: request.body?.privateRoom,
      matchTarget: request.body?.matchTarget,
      disconnectGraceMs: request.body?.disconnectGraceMs
    }));

  route(fastify, authenticate, "GET", "/hokm/rooms/:roomId", request =>
    service.view(request.auth, request.params.roomId));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/join", request =>
    service.join(request.auth, request.params.roomId, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/ready", request =>
    service.ready(request.auth, request.params.roomId, request.body?.ready, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/start", request =>
    service.start(request.auth, request.params.roomId, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/command", request =>
    service.command(request.auth, request.params.roomId, request.body?.command, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/disconnect", request =>
    service.disconnect(request.auth, request.params.roomId, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/reconnect", request =>
    service.reconnect(request.auth, request.params.roomId, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/leave", request =>
    service.leave(request.auth, request.params.roomId, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/cancel-vote", request =>
    service.voteCancel(request.auth, request.params.roomId, request.body?.approve, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/reports", request =>
    service.reportCheating(request.auth, request.params.roomId, request.body?.reportedUserId,
      request.body?.reason, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/appeals", request =>
    service.submitAppeal(request.auth, request.params.roomId, request.body?.reason, request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/manager/reports/:reportId/review", request =>
    service.reviewCheating(request.auth, request.params.roomId, request.params.reportId,
      request.body?.notes ?? "", request.body?.expectedVersion));

  route(fastify, authenticate, "POST", "/hokm/rooms/:roomId/manager/appeals/:appealId/review", request =>
    service.reviewAppeal(request.auth, request.params.roomId, request.params.appealId,
      request.body?.decision, request.body?.notes ?? "", request.body?.expectedVersion));
}
