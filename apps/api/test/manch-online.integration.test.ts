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

  const missingVersionForfeit = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/forfeit`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(missingVersionForfeit.statusCode, 400,
    'Forfeit commands without an expected state version must be rejected.');

  const staleForfeit = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/forfeit`,
    headers: auth(guest.accessToken),
    payload: { expectedStateVersion: expectedRaceVersion },
  });
  assert.equal(staleForfeit.statusCode, 409,
    'A forfeit submitted against an outdated snapshot must not end the newer match.');

  const forfeited = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/forfeit`,
    headers: auth(guest.accessToken),
    payload: { expectedStateVersion: expectedRaceVersion + 1 },
  });
  assert.equal(forfeited.statusCode, 200, forfeited.body);
  assert.equal(forfeited.json().status, 'finished');
  assert.equal(forfeited.json().finishReason, 'forfeit');
  assert.equal(forfeited.json().winnerUserId, host.user.id);
  assert.equal(forfeited.json().stateVersion, expectedRaceVersion + 2,
    'Forfeit must return the next monotonic state version after the successful concurrent roll.');

  const afterForfeit = await app.inject({
    method: 'GET',
    url: `/api/v1/manch/matches/${raceId}`,
    headers: auth(host.accessToken),
  });
  assert.equal(afterForfeit.statusCode, 200);
  assert.equal(afterForfeit.json().match.winnerUserId, host.user.id);
  assert.equal(afterForfeit.json().match.finishReason, 'forfeit');
  assert.equal(afterForfeit.json().match.stateVersion, forfeited.json().stateVersion,
    'The persisted match snapshot must expose the same version returned by forfeit.');

  const history = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/history',
    headers: auth(host.accessToken),
  });
  assert.equal(history.statusCode, 200, history.body);
  const historyItem = history.json().matches.find(
    (item: any) => String(item.id) === String(raceId),
  );
  assert.ok(historyItem, 'Finished matches must appear in the authenticated player history.');
  assert.equal(historyItem.winnerUserId, host.user.id);
  assert.equal(historyItem.finishReason, 'forfeit');
  assert.equal(historyItem.players.length, 2);
  const outsiderHistory = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/history',
    headers: auth(third.accessToken),
  });
  assert.equal(outsiderHistory.statusCode, 200);
  assert.equal(outsiderHistory.json().matches.length, 0,
    'A non-player must not receive another users match history.');

  const hostStats = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/stats',
    headers: auth(host.accessToken),
  });
  assert.equal(hostStats.statusCode, 200, hostStats.body);
  assert.ok(hostStats.json().stats.played >= 1);
  assert.ok(hostStats.json().stats.wins >= 1);
  assert.equal(
    hostStats.json().stats.played,
    hostStats.json().stats.wins + hostStats.json().stats.losses,
    'Every finished match must be counted exactly once as a win or loss.',
  );

  const guestStats = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/stats',
    headers: auth(guest.accessToken),
  });
  assert.equal(guestStats.statusCode, 200, guestStats.body);
  assert.ok(guestStats.json().stats.played >= 1);
  assert.ok(guestStats.json().stats.losses >= 1);

  const outsiderStats = await app.inject({
    method: 'GET',
    url: '/api/v1/manch/matches/stats',
    headers: auth(third.accessToken),
  });
  assert.equal(outsiderStats.statusCode, 200, outsiderStats.body);
  assert.deepEqual(outsiderStats.json().stats, { played: 0, wins: 0, losses: 0 },
    'A user must only receive their own Manch statistics.');

  const rematch = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${raceId}/rematch`,
    headers: auth(host.accessToken),
    payload: {},
  });
  assert.equal(rematch.statusCode, 201, rematch.body);
  assert.equal(rematch.json().match.status, 'waiting');
  assert.equal(rematch.json().match.playerCount, 2);
  assert.equal(rematch.json().match.players.length, 1);

  const rematchJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${rematch.json().match.id}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(rematchJoin.statusCode, 200, rematchJoin.body);
  assert.equal(rematchJoin.json().match.status, 'active');
});


test('Manch online presence is player-scoped and expires to offline after 30 seconds', async () => {
  const host = await register('Manch Presence Host');
  const guest = await register('Manch Presence Guest');
  const outsider = await register('Manch Presence Outsider');
  const created = await app.inject({
    method: 'POST', url: '/api/v1/manch/matches',
    headers: auth(host.accessToken), payload: { playerCount: 2 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const matchId = created.json().match.id;
  const joined = await app.inject({
    method: 'POST', url: `/api/v1/manch/matches/${matchId}/join`,
    headers: auth(guest.accessToken), payload: {},
  });
  assert.equal(joined.statusCode, 200, joined.body);

  for (const player of [host, guest]) {
    const heartbeat = await app.inject({
      method: 'POST', url: `/api/v1/manch/matches/${matchId}/presence`,
      headers: auth(player.accessToken), payload: {},
    });
    assert.equal(heartbeat.statusCode, 200, heartbeat.body);
    assert.equal(heartbeat.json().acknowledged, true);
  }
  const outsiderHeartbeat = await app.inject({
    method: 'POST', url: `/api/v1/manch/matches/${matchId}/presence`,
    headers: auth(outsider.accessToken), payload: {},
  });
  assert.equal(outsiderHeartbeat.statusCode, 403);

  const online = await app.inject({
    method: 'GET', url: `/api/v1/manch/matches/${matchId}`,
    headers: auth(host.accessToken),
  });
  assert.equal(online.statusCode, 200, online.body);
  assert.deepEqual(online.json().match.players.map((player: any) => player.isOnline), [true, true]);

  await testPool.query(
    `UPDATE manch_match_presence SET last_seen_at = NOW() - INTERVAL '31 seconds'
      WHERE match_id = $1 AND user_id = $2`,
    [matchId, guest.user.id],
  );
  const stale = await app.inject({
    method: 'GET', url: `/api/v1/manch/matches/${matchId}`,
    headers: auth(host.accessToken),
  });
  assert.equal(stale.statusCode, 200, stale.body);
  assert.deepEqual(stale.json().match.players.map((player: any) => player.isOnline), [true, false]);
});

test('Manch online supports complete 3- and 4-player seat allocation and rejects unsupported forfeits', async () => {
  const host = await register('Manch Multi Host');
  const guests = [
    await register('Manch Multi Guest One'),
    await register('Manch Multi Guest Two'),
    await register('Manch Multi Guest Three'),
  ];

  for (const playerCount of [3, 4]) {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/manch/matches',
      headers: auth(host.accessToken),
      payload: { playerCount },
    });
    assert.equal(created.statusCode, 201, created.body);
    const matchId = created.json().match.id;
    assert.equal(created.json().match.status, 'waiting');

    let joinedCount = 1;
    for (const guest of guests.slice(0, playerCount - 1)) {
      const joined = await app.inject({
        method: 'POST',
        url: `/api/v1/manch/matches/${matchId}/join`,
        headers: auth(guest.accessToken),
        payload: {},
      });
      assert.equal(joined.statusCode, 200, joined.body);
      joinedCount += 1;
      assert.equal(joined.json().match.players.length, joinedCount);
      assert.equal(
        joined.json().match.status,
        joinedCount === playerCount ? 'active' : 'waiting',
      );
    }

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/manch/matches/${matchId}`,
      headers: auth(host.accessToken),
    });
    assert.equal(detail.statusCode, 200, detail.body);
    const players = detail.json().match.players as Array<Record<string, unknown>>;
    assert.deepEqual(
      players.map((player) => player.seatColour),
      playerCount === 3
        ? ['red', 'green', 'yellow']
        : ['red', 'green', 'yellow', 'blue'],
    );

    // Every non-active seat must be rejected by the server, including
    // third and fourth players; turn ownership is never client-controlled.
    for (const inactivePlayer of guests.slice(0, playerCount - 1)) {
      const outOfTurnRoll = await app.inject({
        method: 'POST',
        url: `/api/v1/manch/matches/${matchId}/roll`,
        headers: auth(inactivePlayer.accessToken),
        payload: { expectedStateVersion: detail.json().match.stateVersion },
      });
      assert.equal(outOfTurnRoll.statusCode, 403,
        'Only the authoritative current seat may roll.');
    }

    const hostRoll = await app.inject({
      method: 'POST',
      url: `/api/v1/manch/matches/${matchId}/roll`,
      headers: auth(host.accessToken),
      payload: { expectedStateVersion: detail.json().match.stateVersion },
    });
    assert.equal(hostRoll.statusCode, 200, hostRoll.body);
    const afterTurn = await app.inject({
      method: 'GET',
      url: `/api/v1/manch/matches/${matchId}`,
      headers: auth(host.accessToken),
    });
    assert.equal(afterTurn.statusCode, 200, afterTurn.body);
    const expectedTurnUserId = hostRoll.json().dice === 6
      ? host.user.id
      : players[1].userId;
    assert.equal(
      afterTurn.json().match.currentTurnUserId,
      expectedTurnUserId,
      'Turn ownership must follow the fixed seat order, retaining the turn after a six.',
    );

    const unsupportedForfeit = await app.inject({
      method: 'POST',
      url: `/api/v1/manch/matches/${matchId}/forfeit`,
      headers: auth(host.accessToken),
      payload: { expectedStateVersion: detail.json().match.stateVersion },
    });
    assert.equal(unsupportedForfeit.statusCode, 409);
  }
});

test('Manch online rejects forfeit attempts by users outside a two-player match', async () => {
  const host = await register('Manch Forfeit Host');
  const guest = await register('Manch Forfeit Guest');
  const outsider = await register('Manch Forfeit Outsider');
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 2 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const joined = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${created.json().match.id}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  });
  assert.equal(joined.statusCode, 200, joined.body);

  const outsiderForfeit = await app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${created.json().match.id}/forfeit`,
    headers: auth(outsider.accessToken),
    payload: { expectedStateVersion: joined.json().match.stateVersion },
  });
  assert.equal(outsiderForfeit.statusCode, 403);
});


test('Manch concurrent joins allocate unique seats and activate a four-player room exactly once', async () => {
  const host = await register('Manch Concurrent Host');
  const guests = await Promise.all([
    register('Manch Concurrent Guest One'),
    register('Manch Concurrent Guest Two'),
    register('Manch Concurrent Guest Three'),
  ]);

  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/manch/matches',
    headers: auth(host.accessToken),
    payload: { playerCount: 4 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const matchId = created.json().match.id;

  const joins = await Promise.all(guests.map((guest) => app.inject({
    method: 'POST',
    url: `/api/v1/manch/matches/${matchId}/join`,
    headers: auth(guest.accessToken),
    payload: {},
  })));

  for (const joined of joins) {
    assert.equal(joined.statusCode, 200, joined.body);
  }

  const detail = await app.inject({
    method: 'GET',
    url: `/api/v1/manch/matches/${matchId}`,
    headers: auth(host.accessToken),
  });
  assert.equal(detail.statusCode, 200, detail.body);
  const match = detail.json().match;
  assert.equal(match.status, 'active');
  assert.equal(match.players.length, 4);
  assert.deepEqual(
    match.players.map((player: { seatIndex: number }) => player.seatIndex),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    match.players.map((player: { seatColour: string }) => player.seatColour),
    ['red', 'green', 'yellow', 'blue'],
  );
  assert.equal(
    new Set(match.players.map((player: { userId: string }) => player.userId)).size,
    4,
    'Every concurrent participant must occupy exactly one unique seat.',
  );
});
