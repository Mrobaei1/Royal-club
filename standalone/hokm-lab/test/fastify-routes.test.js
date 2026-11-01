import test from "node:test";
import assert from "node:assert/strict";
import { registerHokmRoutes } from "../src/fastify-routes.js";

function fakeFastify() {
  const routes = [];
  return { routes, route(definition) { routes.push(definition); } };
}
function replyRecorder() {
  return {
    status: 200, payload: null,
    code(value) { this.status = value; return this; },
    send(value) { this.payload = value; return value; }
  };
}

test("Fastify adapter registers authenticated room endpoints", async () => {
  const fastify = fakeFastify();
  const authenticate = async () => {};
  const service = {
    create: async principal => ({ roomId: "r1", hostUserId: principal.userId }),
    view: async () => ({}), join: async () => ({}), ready: async () => ({}),
    start: async () => ({}), command: async () => ({}), disconnect: async () => ({}), reconnect: async () => ({})
  };
  await registerHokmRoutes(fastify, { service, authenticate });
  assert.equal(fastify.routes.length, 8);
  assert.ok(fastify.routes.every(route => route.preHandler === authenticate));
  assert.ok(fastify.routes.some(route => route.url === "/hokm/rooms/:roomId/command"));
});

test("create endpoint uses authenticated principal and ignores body user ID", async () => {
  const fastify = fakeFastify();
  let received;
  const service = {
    create: async (principal, options) => { received = { principal, options }; return { ok: true }; }
  };
  await registerHokmRoutes(fastify, { service, authenticate: async () => {} });
  const route = fastify.routes.find(item => item.url === "/hokm/rooms");
  const reply = replyRecorder();
  await route.handler({
    auth: { authenticated: true, userId: "verified-user" },
    body: { userId: "attacker-user", matchTarget: 5 }
  }, reply);
  assert.equal(received.principal.userId, "verified-user");
  assert.equal(received.options.matchTarget, 5);
  assert.equal("userId" in received.options, false);
  assert.equal(reply.status, 200);
});

test("HTTP adapter maps missing verified principal to 401 and stale versions to 409", async () => {
  const fastify = fakeFastify();
  const service = {
    view: async () => { throw new Error("A verified authenticated principal is required"); },
    join: async () => { throw new Error("Stale room version"); }
  };
  await registerHokmRoutes(fastify, { service, authenticate: async () => {} });
  const view = fastify.routes.find(item => item.method === "GET");
  const stale = fastify.routes.find(item => item.url.endsWith("/join"));
  const reply1 = replyRecorder();
  await view.handler({ auth: null, params: { roomId: "r1" } }, reply1);
  assert.equal(reply1.status, 401);
  const reply2 = replyRecorder();
  await stale.handler({ auth: { authenticated: true, userId: "u1" }, params: { roomId: "r1" }, body: { expectedVersion: 1 } }, reply2);
  assert.equal(reply2.status, 409);
});

test("Fastify adapter refuses registration without explicit auth middleware", async () => {
  await assert.rejects(
    registerHokmRoutes(fakeFastify(), { service: {}, authenticate: null }),
    /Authentication preHandler is required/
  );
});
