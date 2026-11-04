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
  const snapshots = [];
  const runtime = await createHokmRuntime({
    fastify, pool: fakePool(), authenticate, schedulerIntervalMs: 500,
    now: () => 12345, onSchedulerPoll: snapshot => snapshots.push(snapshot)
  });
  assert.equal(fastify.routes.length, 18);
  assert.ok(fastify.routes.every(route => route.preHandler === authenticate));
  assert.equal(runtime.scheduler.isRunning, false);
  const poll = await runtime.scheduler.pollOnce();
  assert.deepEqual(poll, { skipped: false, discovered: 0, processed: 0, failed: 0 });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].lastSuccessfulPollAt, 12345);
  assert.equal(Object.isFrozen(snapshots[0]), true);
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
