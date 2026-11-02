import test from "node:test";
import assert from "node:assert/strict";
import { createHokmRuntime } from "../src/runtime.js";

function fakeFastify() {
  const routes = [];
  return { routes, route(definition) { routes.push(definition); } };
}
function fakePool() {
  return {
    async query() { return { rows: [], rowCount: 0 }; },
    async connect() {
      return {
        async query() { return { rows: [], rowCount: 0 }; },
        release() {}
      };
    }
  };
}

test("runtime wires authenticated Fastify routes to PostgreSQL service and scheduler", async () => {
  const fastify = fakeFastify();
  const authenticate = async () => {};
  const runtime = await createHokmRuntime({
    fastify, pool: fakePool(), authenticate, schedulerIntervalMs: 500
  });
  assert.equal(fastify.routes.length, 15);
  assert.ok(fastify.routes.every(route => route.preHandler === authenticate));
  assert.equal(runtime.scheduler.isRunning, false);
  assert.equal(runtime.start(), true);
  assert.equal(runtime.scheduler.isRunning, true);
  assert.equal(runtime.stop(), true);
});

test("runtime refuses to start without real host authentication and PostgreSQL pool", async () => {
  await assert.rejects(createHokmRuntime({
    fastify: fakeFastify(), pool: null, authenticate: async () => {}
  }), /live node-postgres Pool/);
  await assert.rejects(createHokmRuntime({
    fastify: fakeFastify(), pool: fakePool(), authenticate: null
  }), /Authentication preHandler is required/);
});
