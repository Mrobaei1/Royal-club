import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

// This suite is run only against a disposable PostgreSQL database in CI.
process.env.JWT_SECRET ??= 'royal-club-integration-test-secret-32-characters';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:5432/royalclub_test';
process.env.NEON_FUNCTION_RUNTIME = '1';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS ??= 'http://localhost:8080';

const { app } = await import('../src/server.js');
const testPool = new Pool({ connectionString: process.env.DATABASE_URL });

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
  await testPool.end();
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function register(fullName: string) {
  const email = `rc-${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'IntegrationPass123!',
      fullName,
      phone: '+491234567890',
      country: 'Germany',
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json() as {
    accessToken: string;
    user: { id: string; email: string; fullName: string };
  };
  assert.ok(body.accessToken);
  return { token: body.accessToken, user: body.user };
}

test('registered players can join an online match and history does not expose opponent email', async () => {
  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, 'ok');

  const databaseHealth = await app.inject({ method: 'GET', url: '/api/v1/health/db' });
  assert.equal(databaseHealth.statusCode, 200);
  assert.equal(databaseHealth.json().database, 'connected');

  const host = await register('Host Integration');
  const guest = await register('Guest Integration');

  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(created.statusCode, 201, created.body);
  const matchId = String(created.json().match.id);

  const joined = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/join`,
    headers: auth(guest.token),
  });
  assert.equal(joined.statusCode, 200, joined.body);
  assert.equal(joined.json().match.status, 'active');

  const snapshot = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/state`,
    headers: auth(host.token),
  });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  const state = snapshot.json().state;
  assert.equal(state.isHost, true);
  assert.equal(state.isMyTurn, true);
  assert.deepEqual(state.board, [
    -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5,
    5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2,
  ]);

  const roll = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/roll`,
    headers: auth(host.token),
    payload: { expectedVersion: state.version },
  });
  assert.equal(roll.statusCode, 200, roll.body);
  const rolledState = roll.json().state;
  assert.equal(rolledState.dice.length, 2);
  assert.ok(rolledState.dice.every((die: number) => Number.isInteger(die) && die >= 1 && die <= 6));
  assert.ok([2, 4].includes(rolledState.remainingDice.length));

  const guestRoll = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/roll`,
    headers: auth(guest.token),
    payload: { expectedVersion: rolledState.version },
  });
  assert.equal(guestRoll.statusCode, 409);

  // Mark a test match as finished to exercise the real history endpoint without
  // having to simulate 15 bear-offs. This database is disposable and CI-only.
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'finished', off_state = $1::jsonb, updated_at = NOW()
      WHERE id = $2`,
    [JSON.stringify({ host: 15, guest: 0 }), matchId],
  );

  const history = await app.inject({
    method: 'GET',
    url: '/api/v1/matches/history',
    headers: auth(host.token),
  });
  assert.equal(history.statusCode, 200, history.body);
  const record = (history.json().matches as Array<Record<string, unknown>>)
    .find((match) => String(match.id) === matchId);
  assert.ok(record);
  assert.equal(record.opponentName, guest.user.fullName);
  assert.equal(Object.hasOwn(record, 'opponentEmail'), false);
  assert.equal(JSON.stringify(record).includes(guest.user.email), false);
});
