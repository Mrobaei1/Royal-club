import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

process.env.JWT_SECRET ??= 'royal-club-disconnect-test-secret-32-characters';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@127.0.0.1:5432/royalclub_test';
process.env.NEON_FUNCTION_RUNTIME = '1';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS ??= 'http://localhost:8080';

const { app } = await import('../src/server.js');
const testPool = new Pool({ connectionString: process.env.DATABASE_URL });

before(async () => { await app.ready(); });
after(async () => {
  await app.close();
  await testPool.end();
});

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function register(label: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `disconnect-${randomUUID()}@example.test`,
      password: 'IntegrationPass123!',
      fullName: label,
      phone: '+491234567890',
      country: 'Germany',
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { accessToken: string; user: { id: string } };
}

async function activeMatch() {
  const host = await register('Disconnect Host');
  const guest = await register('Disconnect Guest');
  const created = await app.inject({
    method: 'POST', url: '/api/v1/matches', headers: auth(host.accessToken),
  });
  assert.equal(created.statusCode, 201, created.body);
  const matchId = String(created.json().match.id);
  const joined = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/join`, headers: auth(guest.accessToken),
  });
  assert.equal(joined.statusCode, 200, joined.body);
  const hostReady = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/setup`,
    headers: auth(host.accessToken), payload: { ready: true },
  });
  assert.equal(hostReady.statusCode, 200, hostReady.body);
  const guestReady = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/setup`,
    headers: auth(guest.accessToken), payload: { acceptSettings: true, ready: true },
  });
  assert.equal(guestReady.statusCode, 200, guestReady.body);
  assert.equal(guestReady.json().setup.status, 'active');
  return { matchId, host, guest };
}

test('heartbeat delays takeover, stale human requests are fenced, and reconnect restores control', async () => {
  const { matchId, host, guest } = await activeMatch();

  const freshState = await app.inject({
    method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(guest.accessToken),
  });
  assert.equal(freshState.statusCode, 200, freshState.body);
  assert.equal(freshState.json().state.currentTurnUserId, host.user.id);

  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '5 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, host.user.id],
  );
  const stillFresh = await app.inject({
    method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(guest.accessToken),
  });
  assert.equal(stillFresh.statusCode, 200, stillFresh.body);
  assert.equal(stillFresh.json().state.currentTurnUserId, host.user.id);
  assert.equal(stillFresh.json().state.aiTakeoverActive, false);

  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '30 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, host.user.id],
  );
  const staleHumanRoll = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/roll`,
    headers: auth(host.accessToken), payload: { expectedVersion: stillFresh.json().state.version },
  });
  assert.equal(staleHumanRoll.statusCode, 409, staleHumanRoll.body);
  const afterTakeover = await app.inject({
    method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(guest.accessToken),
  });
  assert.equal(afterTakeover.statusCode, 200, afterTakeover.body);
  assert.equal(afterTakeover.json().state.currentTurnUserId, guest.user.id);
  assert.equal(afterTakeover.json().state.aiTakeoverActive, true);
  const claimed = await testPool.query(
    'SELECT takeover_active FROM backgammon_match_presence WHERE match_id = $1 AND user_id = $2',
    [matchId, host.user.id],
  );
  assert.equal(claimed.rows[0].takeover_active, true);
  const aiPresence = await testPool.query(
    'SELECT last_ai_action_at FROM backgammon_match_presence WHERE match_id = $1 AND user_id = $2',
    [matchId, host.user.id],
  );
  assert.ok(aiPresence.rows[0].last_ai_action_at);

  const reconnected = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/heartbeat`, headers: auth(host.accessToken),
  });
  assert.equal(reconnected.statusCode, 200, reconnected.body);
  assert.equal(reconnected.json().presence.takeoverActive, false);

  await testPool.query(
    `UPDATE backgammon_matches SET current_turn_user_id = $2,
       board_state = $3::jsonb, bar_state = '{"host":0,"guest":0}'::jsonb,
       off_state = '{"host":0,"guest":0}'::jsonb,
       dice = '[]'::jsonb, remaining_dice = '[]'::jsonb,
       status = 'active', winner_user_id = NULL, finish_reason = NULL,
       state_version = state_version + 1
     WHERE id = $1`,
    [matchId, host.user.id, JSON.stringify([ -2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2 ])],
  );
  const restoredState = await app.inject({
    method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(host.accessToken),
  });
  assert.equal(restoredState.statusCode, 200, restoredState.body);
  const humanRoll = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/roll`,
    headers: auth(host.accessToken), payload: { expectedVersion: restoredState.json().state.version },
  });
  assert.equal(humanRoll.statusCode, 200, humanRoll.body);
});

test('reconnect heartbeat processes an overdue turn before restoring human presence', async () => {
  const { matchId, host, guest } = await activeMatch();
  const before = await testPool.query(
    'SELECT state_version FROM backgammon_matches WHERE id = $1', [matchId],
  );
  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '30 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, host.user.id],
  );

  // Simulate the disconnected player returning while the serverless API was idle
  // and no opponent state poll had triggered the lazy takeover.
  const reconnected = await app.inject({
    method: 'POST', url: `/api/v1/matches/${matchId}/heartbeat`,
    headers: auth(host.accessToken),
  });
  assert.equal(reconnected.statusCode, 200, reconnected.body);
  assert.equal(reconnected.json().presence.takeoverActive, false);

  const after = await testPool.query(
    `SELECT state_version, current_turn_user_id
       FROM backgammon_matches WHERE id = $1`,
    [matchId],
  );
  assert.equal(Number(after.rows[0].state_version), Number(before.rows[0].state_version) + 1);
  assert.equal(String(after.rows[0].current_turn_user_id), guest.user.id);
  const aiPresence = await testPool.query(
    'SELECT last_ai_action_at FROM backgammon_match_presence WHERE match_id = $1 AND user_id = $2',
    [matchId, host.user.id],
  );
  assert.ok(aiPresence.rows[0].last_ai_action_at);
});

test('concurrent state polls can execute only one temporary AI turn', async () => {
  const { matchId, host, guest } = await activeMatch();
  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '30 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, host.user.id],
  );
  const before = await testPool.query(
    'SELECT state_version FROM backgammon_matches WHERE id = $1', [matchId],
  );
  const polls = await Promise.all([
    app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(guest.accessToken) }),
    app.inject({ method: 'GET', url: `/api/v1/matches/${matchId}/state`, headers: auth(guest.accessToken) }),
  ]);
  for (const response of polls) assert.equal(response.statusCode, 200, response.body);
  const after = await testPool.query(
    'SELECT state_version, current_turn_user_id FROM backgammon_matches WHERE id = $1', [matchId],
  );
  assert.equal(Number(after.rows[0].state_version), Number(before.rows[0].state_version) + 1);
  assert.equal(String(after.rows[0].current_turn_user_id), guest.user.id);
});

test('disconnect policies are owner-only, bounded and audited', async () => {
  const regular = await register('Disconnect Policy Regular');
  process.env.OWNER_USER_ID = '0';
  const denied = await app.inject({
    method: 'GET', url: '/api/v1/admin/game-disconnect-policies',
    headers: auth(regular.accessToken),
  });
  assert.equal(denied.statusCode, 403);

  const owner = await register('Disconnect Policy Owner');
  process.env.OWNER_USER_ID = owner.user.id;
  const listed = await app.inject({
    method: 'GET', url: '/api/v1/admin/game-disconnect-policies',
    headers: auth(owner.accessToken),
  });
  assert.equal(listed.statusCode, 200, listed.body);
  const backgammon = (listed.json().policies as Array<Record<string, unknown>>)
    .find(policy => policy.gameType === 'backgammon');
  assert.equal(backgammon?.graceSeconds, 18);
  assert.equal(backgammon?.takeoverMode, 'temporary_ai');

  const invalid = await app.inject({
    method: 'PATCH', url: '/api/v1/admin/game-disconnect-policies/backgammon',
    headers: auth(owner.accessToken), payload: { graceSeconds: 4 },
  });
  assert.equal(invalid.statusCode, 400);

  const updated = await app.inject({
    method: 'PATCH', url: '/api/v1/admin/game-disconnect-policies/backgammon',
    headers: auth(owner.accessToken), payload: { graceSeconds: 23 },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().policy.graceSeconds, 23);
  const audit = await testPool.query(
    'SELECT COUNT(*)::int AS count FROM game_disconnect_policy_audit WHERE actor_user_id = $1 AND game_type = $2',
    [owner.user.id, 'backgammon'],
  );
  assert.equal(audit.rows[0].count, 1);

  const restored = await app.inject({
    method: 'PATCH', url: '/api/v1/admin/game-disconnect-policies/backgammon',
    headers: auth(owner.accessToken), payload: { graceSeconds: 18 },
  });
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json().policy.graceSeconds, 18);
  delete process.env.OWNER_USER_ID;
});

test('temporary AI takeover processes the guest seat with the correct movement direction', async () => {
  const { matchId, host, guest } = await activeMatch();
  await testPool.query(
    `UPDATE backgammon_matches
        SET current_turn_user_id = $2, dice = '[]'::jsonb,
            remaining_dice = '[]'::jsonb, state_version = state_version + 1
      WHERE id = $1`,
    [matchId, guest.user.id],
  );
  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '30 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, guest.user.id],
  );
  const before = await testPool.query(
    'SELECT state_version FROM backgammon_matches WHERE id = $1', [matchId],
  );

  const stateResponse = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/state`,
    headers: auth(host.accessToken),
  });
  assert.equal(stateResponse.statusCode, 200, stateResponse.body);
  assert.equal(stateResponse.json().state.currentTurnUserId, host.user.id);
  assert.equal(stateResponse.json().state.aiTakeoverActive, true);

  const after = await testPool.query(
    'SELECT state_version, current_turn_user_id FROM backgammon_matches WHERE id = $1',
    [matchId],
  );
  assert.equal(Number(after.rows[0].state_version), Number(before.rows[0].state_version) + 1);
  assert.equal(String(after.rows[0].current_turn_user_id), host.user.id);

  const guestPresence = await testPool.query(
    `SELECT takeover_active, last_ai_action_at
       FROM backgammon_match_presence
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, guest.user.id],
  );
  assert.equal(guestPresence.rows[0].takeover_active, true);
  assert.ok(guestPresence.rows[0].last_ai_action_at);
});

test('temporary AI passes a turn exactly once when the disconnected player has no legal moves', async () => {
  const { matchId, host, guest } = await activeMatch();
  await testPool.query(
    `UPDATE backgammon_matches
        SET board_state = $2::jsonb,
            bar_state = '{"host":15,"guest":0}'::jsonb,
            off_state = '{"host":0,"guest":11}'::jsonb,
            dice = '[1,2]'::jsonb,
            remaining_dice = '[1,2]'::jsonb,
            current_turn_user_id = $3,
            state_version = state_version + 1
      WHERE id = $1`,
    [matchId, JSON.stringify([
      ...Array.from({ length: 22 }, () => 0),
      -2,
      -2,
    ]), host.user.id],
  );
  await testPool.query(
    `UPDATE backgammon_match_presence
        SET last_heartbeat_at = NOW() - INTERVAL '30 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, host.user.id],
  );
  const before = await testPool.query(
    'SELECT state_version FROM backgammon_matches WHERE id = $1', [matchId],
  );

  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/state`,
    headers: auth(guest.accessToken),
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().state.currentTurnUserId, guest.user.id);
  assert.deepEqual(response.json().state.dice, []);
  assert.deepEqual(response.json().state.remainingDice, []);

  const after = await testPool.query(
    'SELECT state_version, current_turn_user_id FROM backgammon_matches WHERE id = $1',
    [matchId],
  );
  assert.equal(Number(after.rows[0].state_version), Number(before.rows[0].state_version) + 1);
  assert.equal(String(after.rows[0].current_turn_user_id), guest.user.id);
  const presence = await testPool.query(
    'SELECT takeover_active, last_ai_action_at FROM backgammon_match_presence WHERE match_id = $1 AND user_id = $2',
    [matchId, host.user.id],
  );
  assert.equal(presence.rows[0].takeover_active, true);
  assert.ok(presence.rows[0].last_ai_action_at);
});
