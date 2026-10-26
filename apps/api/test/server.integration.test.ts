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

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: host.user.email, password: 'IntegrationPass123!' },
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.ok(login.json().accessToken);
  const profile = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: auth(login.json().accessToken),
  });
  assert.equal(profile.statusCode, 200, profile.body);
  assert.equal(profile.json().user.email, host.user.email);

  const friendRequest = await app.inject({
    method: 'POST',
    url: `/api/v1/friends/${guest.user.id}/request`,
    headers: auth(host.token),
    payload: {},
  });
  assert.equal(friendRequest.statusCode, 201, friendRequest.body);
  const inbox = await app.inject({
    method: 'GET',
    url: '/api/v1/friends',
    headers: auth(guest.token),
  });
  assert.equal(inbox.statusCode, 200, inbox.body);
  const incoming = (inbox.json().incomingRequests as Array<Record<string, unknown>>)
    .find((request) => String(request.userId) === String(host.user.id));
  assert.ok(incoming);
  assert.equal(Object.hasOwn(incoming, 'email'), false);

  const accepted = await app.inject({
    method: 'POST',
    url: `/api/v1/friends/${host.user.id}/accept`,
    headers: auth(guest.token),
    payload: {},
  });
  assert.equal(accepted.statusCode, 200, accepted.body);

  // Profile photos are exposed to accepted friends and private chat is free,
  // while the API still rejects messages to non-friends.
  const avatar = 'data:image/png;base64,aGVsbG8=';
  const avatarUpdate = await app.inject({
    method: 'PATCH',
    url: '/api/v1/me/avatar',
    headers: auth(guest.token),
    payload: { avatarDataUrl: avatar },
  });
  assert.equal(avatarUpdate.statusCode, 200, avatarUpdate.body);

  const conversations = await app.inject({
    method: 'GET',
    url: '/api/v1/chat/conversations',
    headers: auth(host.token),
  });
  assert.equal(conversations.statusCode, 200, conversations.body);
  const conversation = (conversations.json().conversations as Array<Record<string, unknown>>)
    .find((item) => String(item.userId) === String(guest.user.id));
  assert.ok(conversation);
  assert.equal(conversation.avatarDataUrl, avatar);

  const sentMessage = await app.inject({
    method: 'POST',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
    payload: { body: 'Hello, friend!' },
  });
  assert.equal(sentMessage.statusCode, 201, sentMessage.body);

  const messageHistory = await app.inject({
    method: 'GET',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
  });
  assert.equal(messageHistory.statusCode, 200, messageHistory.body);
  assert.ok((messageHistory.json().messages as Array<Record<string, unknown>>)
    .some((message) => message.body === 'Hello, friend!'));

  const stranger = await register('Stranger Integration');
  const deniedMessage = await app.inject({
    method: 'POST',
    url: `/api/v1/chat/${stranger.user.id}/messages`,
    headers: auth(host.token),
    payload: { body: 'Should be blocked' },
  });
  assert.equal(deniedMessage.statusCode, 403, deniedMessage.body);

  const friends = await app.inject({
    method: 'GET',
    url: '/api/v1/friends',
    headers: auth(host.token),
  });
  assert.equal(friends.statusCode, 200, friends.body);
  const guestFriend = (friends.json().friends as Array<Record<string, unknown>>)
    .find((friend) => String(friend.userId) === String(guest.user.id));
  assert.ok(guestFriend);
  assert.equal(guestFriend.avatarDataUrl, avatar);

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
  assert.equal(joined.json().match.status, 'waiting');
  assert.equal(joined.json().match.guestAvatarDataUrl, avatar);
  assert.equal(joined.json().match.hostAvatarDataUrl, null);

  const hostReady = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/setup`,
    headers: auth(host.token),
    payload: { ready: true },
  });
  assert.equal(hostReady.statusCode, 200, hostReady.body);
  assert.equal(hostReady.json().setup.status, 'waiting');

  const guestAcceptAndReady = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/setup`,
    headers: auth(guest.token),
    payload: { acceptSettings: true, ready: true },
  });
  assert.equal(guestAcceptAndReady.statusCode, 200, guestAcceptAndReady.body);
  assert.equal(guestAcceptAndReady.json().setup.status, 'active');

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
  assert.equal(record.opponentAvatarDataUrl, avatar);
  assert.equal(Object.hasOwn(record, 'opponentEmail'), false);
  assert.equal(JSON.stringify(record).includes(guest.user.email), false);

  // Prepare a single legal bear-off in the disposable DB so the real move route
  // finishes a game and exercises atomic rating updates without a 15-checker simulation.
  const nearWinBoard = Array<number>(24).fill(0);
  nearWinBoard[0] = 1;
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'active', board_state = $1::jsonb,
            bar_state = '{"host":0,"guest":0}'::jsonb,
            off_state = $2::jsonb, current_turn_user_id = host_user_id,
            dice = '[1,2]'::jsonb, remaining_dice = '[1]'::jsonb,
            state_version = 100, updated_at = NOW()
      WHERE id = $3`,
    [JSON.stringify(nearWinBoard), JSON.stringify({ host: 14, guest: 0 }), matchId],
  );
  const winningMove = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/moves`,
    headers: auth(host.token),
    payload: { from: 0, to: null, die: 1, expectedVersion: 100 },
  });
  assert.equal(winningMove.statusCode, 200, winningMove.body);
  assert.equal(winningMove.json().state.status, 'finished');

  const leaderboard = await app.inject({
    method: 'GET',
    url: '/api/v1/leaderboard',
    headers: auth(host.token),
  });
  assert.equal(leaderboard.statusCode, 200, leaderboard.body);
  const ranked = leaderboard.json().leaderboard as Array<Record<string, unknown>>;
  const hostStats = ranked.find((player) => String(player.userId) === String(host.user.id));
  const guestStats = ranked.find((player) => String(player.userId) === String(guest.user.id));
  assert.ok(hostStats);
  assert.ok(guestStats);
  assert.equal(hostStats.rating, 1016);
  assert.equal(hostStats.wins, 1);
  assert.equal(hostStats.gamesPlayed, 1);
  assert.equal(guestStats.rating, 984);
  assert.equal(guestStats.losses, 1);
  assert.equal(guestStats.gamesPlayed, 1);

  const invitedRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(invitedRoom.statusCode, 201, invitedRoom.body);
  const invitedRoomId = String(invitedRoom.json().match.id);
  const sentInvite = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${invitedRoomId}/invites`,
    headers: auth(host.token),
    payload: { inviteeId: String(guest.user.id) },
  });
  assert.equal(sentInvite.statusCode, 201, sentInvite.body);
  const invitesInbox = await app.inject({
    method: 'GET',
    url: '/api/v1/match-invites',
    headers: auth(guest.token),
  });
  assert.equal(invitesInbox.statusCode, 200, invitesInbox.body);
  const incomingInvite = (invitesInbox.json().invites as Array<Record<string, unknown>>)
    .find((invite) => String(invite.matchId) === invitedRoomId);
  assert.ok(incomingInvite);
  const acceptInvite = await app.inject({
    method: 'POST',
    url: `/api/v1/match-invites/${incomingInvite.id}/respond`,
    headers: auth(guest.token),
    payload: { accept: true },
  });
  assert.equal(acceptInvite.statusCode, 200, acceptInvite.body);
  assert.equal(acceptInvite.json().response, 'accepted');
  const invitedMatch = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${invitedRoomId}`,
    headers: auth(host.token),
  });
  assert.equal(invitedMatch.statusCode, 200, invitedMatch.body);
  assert.equal(invitedMatch.json().match.status, 'waiting');
  assert.equal(invitedMatch.json().match.guestName, 'Guest Integration');

  const seriesRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(seriesRoom.statusCode, 201, seriesRoom.body);
  const seriesId = String(seriesRoom.json().match.id);
  const seriesJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/join`,
    headers: auth(guest.token),
  });
  assert.equal(seriesJoin.statusCode, 200, seriesJoin.body);
  const chooseThree = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(host.token),
    payload: { matchToWin: 3 },
  });
  assert.equal(chooseThree.statusCode, 200, chooseThree.body);
  const seriesHostReady = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(host.token),
    payload: { ready: true },
  });
  assert.equal(seriesHostReady.statusCode, 200, seriesHostReady.body);
  const changeTargetAfterReady = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(host.token),
    payload: { matchToWin: 5 },
  });
  assert.equal(changeTargetAfterReady.statusCode, 200, changeTargetAfterReady.body);
  assert.equal(changeTargetAfterReady.json().setup.host_ready, false);
  assert.equal(changeTargetAfterReady.json().setup.guest_ready, false);
  assert.equal(changeTargetAfterReady.json().setup.guest_settings_accepted, false);
  const restoreTarget = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(host.token),
    payload: { matchToWin: 3 },
  });
  assert.equal(restoreTarget.statusCode, 200, restoreTarget.body);
  const seriesHostReadyAgain = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(host.token),
    payload: { ready: true },
  });
  assert.equal(seriesHostReadyAgain.statusCode, 200, seriesHostReadyAgain.body);
  const seriesGuestReady = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/setup`,
    headers: auth(guest.token),
    payload: { acceptSettings: true, ready: true },
  });
  assert.equal(seriesGuestReady.statusCode, 200, seriesGuestReady.body);
  assert.equal(seriesGuestReady.json().setup.status, 'active');

  const onePointBoard = Array<number>(24).fill(0);
  onePointBoard[0] = 1;
  await testPool.query(
    `UPDATE backgammon_matches
        SET board_state = $1::jsonb, bar_state = '{"host":0,"guest":0}'::jsonb,
            off_state = '{"host":14,"guest":0}'::jsonb, current_turn_user_id = host_user_id,
            dice = '[1,2]'::jsonb, remaining_dice = '[1]'::jsonb, state_version = 7
      WHERE id = $2`,
    [JSON.stringify(onePointBoard), seriesId],
  );
  const firstGameWin = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${seriesId}/moves`,
    headers: auth(host.token),
    payload: { from: 0, to: null, die: 1, expectedVersion: 7 },
  });
  assert.equal(firstGameWin.statusCode, 200, firstGameWin.body);
  assert.equal(firstGameWin.json().state.status, 'active');
  assert.equal(firstGameWin.json().state.hostGameWins, 1);
  assert.equal(firstGameWin.json().state.off.host, 0);
  assert.deepEqual(firstGameWin.json().state.board, [
    -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5,
    5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2,
  ]);

  const cancellationRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(cancellationRoom.statusCode, 201, cancellationRoom.body);
  const cancellationId = String(cancellationRoom.json().match.id);
  const cancellationJoin = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${cancellationId}/join`,
    headers: auth(guest.token),
  });
  assert.equal(cancellationJoin.statusCode, 200, cancellationJoin.body);

  const propose = () => app.inject({
    method: 'POST',
    url: `/api/v1/matches/${cancellationId}/cancellation`,
    headers: auth(host.token),
    payload: { accept: false },
  });
  const firstProposal = await propose();
  assert.equal(firstProposal.statusCode, 200, firstProposal.body);
  assert.equal(firstProposal.json().cancellation.status, 'proposed');

  const reject = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${cancellationId}/cancellation`,
    headers: auth(guest.token),
    payload: { accept: false },
  });
  assert.equal(reject.statusCode, 200, reject.body);
  assert.equal(reject.json().cancellation.status, 'rejected');
  const stillWaiting = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${cancellationId}`,
    headers: auth(host.token),
  });
  assert.equal(stillWaiting.json().match.status, 'waiting');

  const secondProposal = await propose();
  assert.equal(secondProposal.statusCode, 200, secondProposal.body);
  const acceptCancellation = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${cancellationId}/cancellation`,
    headers: auth(guest.token),
    payload: { accept: true },
  });
  assert.equal(acceptCancellation.statusCode, 200, acceptCancellation.body);
  assert.equal(acceptCancellation.json().cancellation.status, 'cancelled');
  const cancelled = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${cancellationId}`,
    headers: auth(host.token),
  });
  assert.equal(cancelled.json().match.status, 'cancelled');
});
