import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHokmRoutes } from './hokm/fastify-routes.js';

async function invokeCreate(create: () => Promise<unknown>) {
  const routes: Array<Record<string, any>> = [];
  await registerHokmRoutes(
    { route: (definition: Record<string, any>) => routes.push(definition) },
    {
      service: { create },
      authenticate: async () => {},
    },
  );
  const route = routes.find(item => item.method === 'POST' && item.url === '/hokm/rooms');
  assert.ok(route, 'room creation route should be registered');

  let statusCode = 200;
  let payload: unknown;
  const reply = {
    code(code: number) { statusCode = code; return this; },
    send(body: unknown) { payload = body; return body; },
  };
  await route.handler({ auth: { authenticated: true, userId: '42' }, body: {} }, reply);
  return { statusCode, payload };
}

test('unknown service exceptions never expose database or infrastructure details', async () => {
  const result = await invokeCreate(async () => {
    throw new Error('postgres://private-host/database connection failed');
  });
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.payload, {
    error: 'Hokm request could not be completed. Please try again.',
  });
  assert.doesNotMatch(JSON.stringify(result.payload), /postgres|private-host|database/);
});

test('expected request validation errors retain a safe client message', async () => {
  const result = await invokeCreate(async () => {
    throw new TypeError('matchTarget must be 3, 5, or 7 points');
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.payload, { error: 'matchTarget must be 3, 5, or 7 points' });
});

test('expected authorization failures remain forbidden rather than becoming server errors', async () => {
  const result = await invokeCreate(async () => {
    throw new Error('Only the host may start the game');
  });
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.payload, { error: 'Only the host may start the game' });
});

test('expected match-state conflicts remain client conflicts', async () => {
  const result = await invokeCreate(async () => {
    throw new Error('Only an active match can be canceled by player agreement');
  });
  assert.equal(result.statusCode, 409);
  assert.deepEqual(result.payload, {
    error: 'Only an active match can be canceled by player agreement',
  });
});
