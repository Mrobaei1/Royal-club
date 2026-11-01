import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { legalManchMoves, type ManchGameState } from '../src/manch-rules.js';

process.env.JWT_SECRET ??= 'royal-club-manch-integration-secret-32-characters';
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

async function register(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `manch-${slug}-${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password: 'ManchIntegration123!',
      fullName: label,
      phone: '+491234567890',
      country: 'Germany',
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as {
    accessToken: string;
    user: { id: string; username: string; email: string };
  };
}

test('Manch online rooms join, roll and persist server-authoritative moves', async () => {
  const host = await register('Manch Host');
  const guest = await register('Manch Guest');
  const third = await register('Manch Third');

  const clientSelectedRules = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2, profile: { entryFaces: [1] } },
  });
  assert.equal(clientSelectedRules.statusCode, 400,
    'Clients must not be able to change server-approved rules.');

  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const waitingMatch = created.json().match;
  assert.equal(waitingMatch.status, 'waiting');
  assert.deepEqual(waitingMatch.gameState.profile.entryFaces, [6]);
  assert.equal(waitingMatch.playerCount, 2);
  assert.equal(waitingMatch.players.length, 1);
  assert.equal(waitingMatch.players[0].seatColour, 'red');

  const hostMineWaiting = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/mine',
    headers: auth(host.accessToken),
  });
  assert.equal(hostMineWaiting.statusCode, 200);
  assert.equal(hostMineWaiting.json().match.id, waitingMatch.id);
  assert.equal(hostMineWaiting.json().match.status, 'waiting');

  const lobby = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches',
    headers: auth(guest.accessToken),
  });
  assert.equal(lobby.statusCode, 200, lobby.body);
  assert.ok(lobby.json().matches.some((match: any) => String(match.id) === String(waitingMatch.id)));

  const joined = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(joined.statusCode, 200, joined.body);
  assert.equal(joined.json().match.status, 'active');
  assert.equal(joined.json().match.players.length, 2);
  assert.equal(joined.json().match.players[1].seatColour, 'yellow');
  assert.equal(joined.json().match.currentTurnUserId, host.user.id);

  const guestMineActive = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/mine',
    headers: auth(guest.accessToken),
  });
  assert.equal(guestMineActive.statusCode, 200);
  assert.equal(guestMineActive.json().match.id, waitingMatch.id);
  assert.equal(guestMineActive.json().match.status, 'active');

  const detail = await app.inject({
    method: 'GET',
    url: `/api/v1/manch/matches/${waitingMatch.id}`,
    headers: auth(host.accessToken),
  });
  assert.equal(detail.statusCode, 200, detail.body);
  const nonMemberRead = await app.inject({
    method: 'GET',
    url: `/api/v1/manch/matches/${waitingMatch.id}`,
    headers: auth(third.accessToken),
  });
  assert.equal(nonMemberRead.statusCode, 403);

  const publicPlayers = detail.json().match.players as Array<Record<string, unknown>>;
  assert.deepEqual(publicPlayers.map((player) => player.username), [
    host.user.username,
    guest.user.username,
  ]);
  for (const player of publicPlayers) {
    assert.equal(Object.hasOwn(player, 'email'), false);
    assert.equal(Object.hasOwn(player, 'fullName'), false);
  }

  const wrongTurn = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/roll`,
    headers: auth(guest.accessToken),
    payload: { expectedStateVersion: joined.json().match.stateVersion },
  });
  assert.equal(wrongTurn.statusCode, 403);

  const rolled = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/roll`,
    headers: auth(host.accessToken),
    payload: {
      dice: 1,
      expectedStateVersion: joined.json().match.stateVersion,
    },
  });
  assert.equal(rolled.statusCode, 200, rolled.body);
  assert.ok(rolled.json().dice >= 1 && rolled.json().dice <= 6,
    'The API must generate the dice value; the client cannot choose it.');
  assert.equal(rolled.json().stateVersion, 2);

  const duplicateRoll = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/roll`,
    headers: auth(host.accessToken),
    payload: { expectedStateVersion: joined.json().match.stateVersion },
  });
  assert.equal(duplicateRoll.statusCode, 409,
    'A repeated roll with an old version must not consume another die.');

  const staleMove = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/move`,
    headers: auth(host.accessToken),
    payload: { tokenIndex: 0, expectedStateVersion: 0 },
  });
  assert.equal(staleMove.statusCode, 409);

  if (!rolled.json().autoPassed) {
    const gameState = rolled.json().state as ManchGameState;
    const legal = legalManchMoves(gameState);
    assert.ok(legal.length > 0);
    const moved = await app.inject({
      method: 'POST',
      url: `/api/v1/manch/matches/${waitingMatch.id}/move`,
      headers: auth(host.accessToken),
      payload: {
        tokenIndex: legal[0].tokenIndex,
        expectedStateVersion: rolled.json().stateVersion,
      },
    });
    assert.equal(moved.statusCode, 200, moved.body);
    assert.equal(moved.json().stateVersion, rolled.json().stateVersion + 1);
    assert.equal(moved.json().state.players[0].tokens[legal[0].tokenIndex],
      legal[0].toProgress);
  }

  const fullRoomJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${waitingMatch.id}/join`,
    headers: auth(third.accessToken),
    payload: {},
  });
  assert.equal(fullRoomJoin.statusCode, 410);

  const cancelledRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2 },
  });
  assert.equal(cancelledRoom.statusCode, 201);
  const cancelled = await app.inject({
    method: 'DELETE',
    url: `/api/v1/manch/matches/${cancelledRoom.json().match.id}`,
    headers: auth(host.accessToken),
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().cancelled, true);

  const expiredRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2 },
  });
  assert.equal(expiredRoom.statusCode, 201);
  const expiredId = expiredRoom.json().match.id;
  await testPool.query(
    'UPDATE manch_matches SET expires_at = NOW() - INTERVAL \'1 second\' WHERE id = $1',
    [expiredId],
  );
  const expiredJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${expiredId}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(expiredJoin.statusCode, 404);

  const raceRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2 },
  });
  assert.equal(raceRoom.statusCode, 201);
  const raceId = raceRoom.json().match.id;
  const raceJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(raceJoin.statusCode, 200);
  const expectedRaceVersion = raceJoin.json().match.stateVersion;
  const simultaneousRolls = await Promise.all([
    app.inject({
      method: 'POST',
      url: `/api/v1/manch/matches/${raceId}/roll`,
      headers: auth(host.accessToken),
      payload: { expectedStateVersion: expectedRaceVersion },
    }),
    app.inject({
      method: 'POST',
      url: `/api/v1/manch/matches/${raceId}/roll`,
      headers: auth(host.accessToken),
      payload: { expectedStateVersion: expectedRaceVersion },
    }),
  ]);
  assert.deepEqual(
    simultaneousRolls.map((response) => response.statusCode).sort(),
    [200, 409],
    'Row locking and state versions must prevent two concurrent rolls from consuming the same turn.',
  );

  const forfeited = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/forfeit`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(forfeited.statusCode, 200, forfeited.body);
  assert.equal(forfeited.json().status, 'finished');
  assert.equal(forfeited.json().finishReason, 'forfeit');
  assert.equal(forfeited.json().winnerUserId, host.user.id);

  const afterForfeit = await app.inject({
    method: 'GET',
    url: `/api/v1/manch/matches/${raceId}`,
    headers: auth(host.accessToken),
  });
  assert.equal(afterForfeit.statusCode, 200);
  assert.equal(afterForfeit.json().match.winnerUserId, host.user.id);
  assert.equal(afterForfeit.json().match.finishReason, 'forfeit');
});
