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
    user: { id: string; email: string; username: string; fullName: string };
  };
  assert.ok(body.accessToken);
  assert.ok(body.user.username, 'Every account must receive a public username at registration.');
  return { token: body.accessToken, user: body.user };
}

test('registered players can join an online match and history does not expose opponent email', async () => {
  const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, 'ok');

  const databaseHealth = await app.inject({ method: 'GET', url: '/api/v1/health/db' });
  assert.equal(databaseHealth.statusCode, 200);
  assert.equal(databaseHealth.json().database, 'connected');

  const shortPassword = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `short-${randomUUID()}@example.test`,
      password: '12345',
      fullName: 'Short Password',
      phone: '+491234567890',
      country: 'Germany',
    },
  });
  assert.equal(shortPassword.statusCode, 400,
    'Registration must reject passwords shorter than six characters.');

  const sixCharacterEmail = `six-${randomUUID()}@example.test`;
  const sixCharacterRegistration = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: sixCharacterEmail, password: '123456', fullName: 'Six Character', phone: '+491234567890', country: 'Germany' },
  });
  assert.equal(sixCharacterRegistration.statusCode, 201, sixCharacterRegistration.body);
  const sixCharacterLogin = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-forwarded-for': '198.51.100.11' },
    payload: { email: sixCharacterEmail, password: '123456' },
  });
  assert.equal(sixCharacterLogin.statusCode, 200, sixCharacterLogin.body);
  const sameAccountOtherNetwork = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-forwarded-for': '203.0.113.24' },
    payload: { email: sixCharacterEmail, password: '123456' },
  });
  assert.equal(sameAccountOtherNetwork.statusCode, 200, sameAccountOtherNetwork.body,
    'Changing the apparent client network must not change account authentication.');

  const host = await register('Host Integration');
  const guest = await register('Guest Integration');

  const usernameSearch = await app.inject({
    method: 'GET',
    url: `/api/v1/users/search?username=${encodeURIComponent(guest.user.username)}`,
    headers: auth(host.token),
  });
  assert.equal(usernameSearch.statusCode, 200, usernameSearch.body);
  const publicProfile = (usernameSearch.json().users as Array<Record<string, unknown>>)[0];
  assert.equal(publicProfile.username, guest.user.username);
  assert.equal(Object.hasOwn(publicProfile, 'fullName'), false);
  assert.equal(Object.hasOwn(publicProfile, 'email'), false);
  assert.equal(JSON.stringify(publicProfile).includes(guest.user.fullName), false);

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

  const hostNotifications = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(host.token),
  });
  const guestNotifications = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  assert.equal(hostNotifications.statusCode, 200, hostNotifications.body);
  assert.equal(guestNotifications.statusCode, 200, guestNotifications.body);
  assert.ok((hostNotifications.json().notifications as Array<Record<string, unknown>>).length > 0);
  assert.ok((guestNotifications.json().notifications as Array<Record<string, unknown>>).length > 0);

  const clearHostNotifications = await app.inject({
    method: 'DELETE',
    url: '/api/v1/notifications',
    headers: auth(host.token),
  });
  assert.equal(clearHostNotifications.statusCode, 200, clearHostNotifications.body);
  assert.ok(clearHostNotifications.json().deleted > 0);
  const hostNotificationsAfterClear = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(host.token),
  });
  const guestNotificationsAfterClear = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  assert.equal((hostNotificationsAfterClear.json().notifications as Array<Record<string, unknown>>).length, 0);
  assert.ok((guestNotificationsAfterClear.json().notifications as Array<Record<string, unknown>>).length > 0);

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
  assert.equal(conversation.username, guest.user.username);
  assert.equal(Object.hasOwn(conversation, 'fullName'), false);
  assert.equal(JSON.stringify(conversation).includes(guest.user.fullName), false);
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
  const messageId = String((sentMessage.json().message as Record<string, unknown>).id);

  const imageBody = `data:image/png;base64,${'A'.repeat(4000)}`;
  const sentImageMessage = await app.inject({
    method: 'POST',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
    payload: { body: imageBody },
  });
  assert.equal(sentImageMessage.statusCode, 201, sentImageMessage.body);
  assert.equal(sentImageMessage.json().message.body, imageBody);
  const imageMessageId = String((sentImageMessage.json().message as Record<string, unknown>).id);
  const imageHistory = await app.inject({
    method: 'GET',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
  });
  assert.ok((imageHistory.json().messages as Array<Record<string, unknown>>)
    .some((message) => String(message.id) === imageMessageId && message.body === imageBody),
    'Valid image data URLs must survive database storage and message history.');

  const editedMessage = await app.inject({
    method: 'PATCH',
    url: `/api/v1/chat/${guest.user.id}/messages/${messageId}`,
    headers: auth(host.token),
    payload: { body: 'Edited message' },
  });
  assert.equal(editedMessage.statusCode, 200, editedMessage.body);
  assert.equal(editedMessage.json().message.body, 'Edited message');

  const recipientCannotEdit = await app.inject({
    method: 'PATCH',
    url: `/api/v1/chat/${host.user.id}/messages/${messageId}`,
    headers: auth(guest.token),
    payload: { body: 'Unauthorized edit' },
  });
  assert.equal(recipientCannotEdit.statusCode, 404, recipientCannotEdit.body);

  const hideForSender = await app.inject({
    method: 'DELETE',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
    payload: { messageIds: [messageId], scope: 'me' },
  });
  assert.equal(hideForSender.statusCode, 200, hideForSender.body);
  assert.equal(hideForSender.json().deleted, 1);

  const senderHistoryAfterHide = await app.inject({
    method: 'GET',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
  });
  assert.equal((senderHistoryAfterHide.json().messages as Array<Record<string, unknown>>)
    .some((message) => String(message.id) === messageId), false);

  const recipientHistoryAfterHide = await app.inject({
    method: 'GET',
    url: `/api/v1/chat/${host.user.id}/messages`,
    headers: auth(guest.token),
  });
  assert.ok((recipientHistoryAfterHide.json().messages as Array<Record<string, unknown>>)
    .some((message) => String(message.id) === messageId && message.body === 'Edited message'));

  const secondMessage = await app.inject({
    method: 'POST',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
    payload: { body: 'Delete for everyone' },
  });
  assert.equal(secondMessage.statusCode, 201, secondMessage.body);
  const secondMessageId = String((secondMessage.json().message as Record<string, unknown>).id);
  const deleteForBoth = await app.inject({
    method: 'DELETE',
    url: `/api/v1/chat/${guest.user.id}/messages`,
    headers: auth(host.token),
    payload: { messageIds: [secondMessageId], scope: 'both' },
  });
  assert.equal(deleteForBoth.statusCode, 200, deleteForBoth.body);
  assert.equal(deleteForBoth.json().deleted, 1);
  const recipientHistoryAfterDeleteForBoth = await app.inject({
    method: 'GET',
    url: `/api/v1/chat/${host.user.id}/messages`,
    headers: auth(guest.token),
  });
  assert.ok((recipientHistoryAfterDeleteForBoth.json().messages as Array<Record<string, unknown>>)
    .some((message) => String(message.id) === secondMessageId && message.deletedForAll === true));

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
  assert.equal(guestFriend.username, guest.user.username);
  assert.equal(Object.hasOwn(guestFriend, 'fullName'), false);
  assert.equal(JSON.stringify(guestFriend).includes(guest.user.fullName), false);
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
  const joinedRoomExpiry = await testPool.query(
    'SELECT expires_at > NOW() + INTERVAL \'5 minutes\' AS extended FROM backgammon_matches WHERE id = $1',
    [matchId],
  );
  assert.equal(joinedRoomExpiry.rows[0].extended, true,
    'A room must not retain the 60-second unaccepted-invitation expiry after a player joins.');
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
  // Live spectator access is opt-in by the host and limited to accepted friends.
  const enableSpectators = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/spectators`,
    headers: auth(host.token),
    payload: { enabled: true },
  });
  assert.equal(enableSpectators.statusCode, 200, enableSpectators.body);
  assert.equal(enableSpectators.json().settings.spectatorsEnabled, true);

  const blockedLiveList = await app.inject({
    method: 'GET',
    url: '/api/v1/matches/live',
    headers: auth(stranger.token),
  });
  assert.equal(blockedLiveList.statusCode, 200, blockedLiveList.body);
  assert.equal((blockedLiveList.json().matches as Array<Record<string, unknown>>)
    .some((match) => String(match.id) === matchId), false);

  const watcherRequest = await app.inject({
    method: 'POST',
    url: `/api/v1/friends/${stranger.user.id}/request`,
    headers: auth(host.token),
    payload: {},
  });
  assert.equal(watcherRequest.statusCode, 201, watcherRequest.body);
  const watcherAccept = await app.inject({
    method: 'POST',
    url: `/api/v1/friends/${host.user.id}/accept`,
    headers: auth(stranger.token),
    payload: {},
  });
  assert.equal(watcherAccept.statusCode, 200, watcherAccept.body);

  const liveList = await app.inject({
    method: 'GET',
    url: '/api/v1/matches/live',
    headers: auth(stranger.token),
  });
  assert.equal(liveList.statusCode, 200, liveList.body);
  assert.ok((liveList.json().matches as Array<Record<string, unknown>>)
    .some((match) => String(match.id) === matchId));

  const spectatorSnapshot = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/spectate`,
    headers: auth(stranger.token),
  });
  assert.equal(spectatorSnapshot.statusCode, 200, spectatorSnapshot.body);
  assert.equal(spectatorSnapshot.json().match.hostName, host.user.username);
  assert.equal(spectatorSnapshot.json().match.guestName, guest.user.username);
  assert.equal(spectatorSnapshot.json().state.isMyTurn, false);
  assert.equal(JSON.stringify(spectatorSnapshot.json()).includes(host.user.fullName), false);
  assert.equal(JSON.stringify(spectatorSnapshot.json()).includes(guest.user.fullName), false);

  const spectatorCannotRoll = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/roll`,
    headers: auth(stranger.token),
    payload: { expectedVersion: spectatorSnapshot.json().state.version },
  });
  assert.notEqual(spectatorCannotRoll.statusCode, 200);

  const disableSpectators = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/spectators`,
    headers: auth(host.token),
    payload: { enabled: false },
  });
  assert.equal(disableSpectators.statusCode, 200, disableSpectators.body);
  const deniedSnapshot = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/spectate`,
    headers: auth(stranger.token),
  });
  assert.equal(deniedSnapshot.statusCode, 404);


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

  // Apply two dice in one atomic online turn (the same 2+3 cumulative move
  // the board UI supports) and assert the server owns the resulting position.
  const batchBoard = Array<number>(24).fill(0);
  batchBoard[5] = 1;
  batchBoard[3] = 1;
  batchBoard[12] = -2;
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'active', board_state = $1::jsonb,
            bar_state = $2::jsonb, off_state = $3::jsonb,
            current_turn_user_id = host_user_id, dice = '[2,3]'::jsonb,
            remaining_dice = '[2,3]'::jsonb, state_version = 99,
            match_to_win = 3, host_game_wins = 0, guest_game_wins = 0,
            expires_at = NOW() + INTERVAL '30 minutes', updated_at = NOW()
      WHERE id = $4`,
    [JSON.stringify(batchBoard), JSON.stringify({ host: 0, guest: 0 }),
     JSON.stringify({ host: 13, guest: 13 }), matchId],
  );
  const batchMove = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/moves/batch`,
    headers: auth(host.token),
    payload: {
      expectedVersion: 99,
      moves: [{ from: 5, to: 3, die: 2 }, { from: 3, to: 0, die: 3 }],
    },
  });
  assert.equal(batchMove.statusCode, 200, batchMove.body);
  assert.equal(batchMove.json().appliedMoves, 2);
  assert.equal(batchMove.json().state.board[5], 0);
  assert.equal(batchMove.json().state.board[3], 1);
  assert.equal(batchMove.json().state.board[0], 1);
  assert.deepEqual(batchMove.json().state.remainingDice, []);
  assert.equal(String(batchMove.json().state.currentTurnUserId), String(guest.user.id));

  // Mark a test match as finished to exercise the real history endpoint without
  // having to simulate 15 bear-offs. This database is disposable and CI-only.
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'finished', off_state = $1::jsonb, spectators_enabled = TRUE, updated_at = NOW()
      WHERE id = $2`,
    [JSON.stringify({ host: 15, guest: 0 }), matchId],
  );

  const finishedMatchSpectate = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${matchId}/spectate`,
    headers: auth(stranger.token),
  });
  assert.equal(finishedMatchSpectate.statusCode, 404,
    'Finished matches must not expose a spectator snapshot or become replayable.');

  const history = await app.inject({
    method: 'GET',
    url: '/api/v1/matches/history',
    headers: auth(host.token),
  });
  assert.equal(history.statusCode, 200, history.body);
  const record = (history.json().matches as Array<Record<string, unknown>>)
    .find((match) => String(match.id) === matchId);
  assert.ok(record);
  // Public match history must expose usernames, never another player's full name.
  assert.equal(record.opponentName, guest.user.username);
  assert.notEqual(record.opponentName, guest.user.fullName);
  assert.equal(record.opponentAvatarDataUrl, avatar);
  assert.equal(Object.hasOwn(record, 'opponentEmail'), false);
  assert.equal(JSON.stringify(record).includes(guest.user.email), false);

  const weeklyLeaderboard = await app.inject({
    method: 'GET',
    url: '/api/v1/leaderboard/weekly',
    headers: auth(host.token),
  });
  assert.equal(weeklyLeaderboard.statusCode, 200, weeklyLeaderboard.body);
  assert.equal(weeklyLeaderboard.json().period, '7d');
  assert.equal(weeklyLeaderboard.json().pointsPerWin, 3);
  const weeklyHost = (weeklyLeaderboard.json().leaderboard as Array<Record<string, unknown>>)
    .find((player) => String(player.userId) === String(host.user.id));
  assert.ok(weeklyHost, 'A finished match in the last seven days must contribute to weekly rankings.');
  assert.equal(weeklyHost.username, host.user.username);
  assert.equal(weeklyHost.wins, 1);
  assert.equal(weeklyHost.score, 3);
  assert.equal(weeklyHost.level, 1);
  assert.equal(Object.hasOwn(weeklyHost, 'fullName'), false);

  // Weekly rankings must ignore unfinished rooms and finished records with no
  // authoritative winner (for example, an abandoned or unresolved match).
  const unfinishedRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(unfinishedRoom.statusCode, 201, unfinishedRoom.body);
  const unfinishedRoomId = String(unfinishedRoom.json().match.id);
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'active', off_state = '{"host":14,"guest":14}'::jsonb,
            winner_user_id = NULL, updated_at = NOW()
      WHERE id = $1`,
    [unfinishedRoomId],
  );

  const unresolvedRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(unresolvedRoom.statusCode, 201, unresolvedRoom.body);
  const unresolvedRoomId = String(unresolvedRoom.json().match.id);
  await testPool.query(
    `UPDATE backgammon_matches
        SET status = 'finished', off_state = '{"host":14,"guest":14}'::jsonb,
            winner_user_id = NULL, updated_at = NOW()
      WHERE id = $1`,
    [unresolvedRoomId],
  );

  const weeklyAfterUnresolved = await app.inject({
    method: 'GET',
    url: '/api/v1/leaderboard/weekly',
    headers: auth(host.token),
  });
  assert.equal(weeklyAfterUnresolved.statusCode, 200, weeklyAfterUnresolved.body);
  const hostAfterUnresolved = (weeklyAfterUnresolved.json().leaderboard as Array<Record<string, unknown>>)
    .find((player) => String(player.userId) === String(host.user.id));
  assert.ok(hostAfterUnresolved);
  assert.equal(hostAfterUnresolved.score, 3, 'Unfinished/unresolved matches must not add weekly points.');
  assert.equal(hostAfterUnresolved.gamesPlayed, 1, 'Unfinished/unresolved matches must not count as weekly games.');
  assert.equal(hostAfterUnresolved.wins, 1);

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
            state_version = 100, match_to_win = 1, host_game_wins = 0,
            guest_game_wins = 0, updated_at = NOW()
      WHERE id = $3`,
    [JSON.stringify(nearWinBoard), JSON.stringify({ host: 14, guest: 0 }), matchId],
  );
  // A live match must not affect rating/win/loss statistics before its result is authoritative.
  const preFinishLeaderboard = await app.inject({
    method: 'GET',
    url: '/api/v1/leaderboard',
    headers: auth(host.token),
  });
  assert.equal(preFinishLeaderboard.statusCode, 200, preFinishLeaderboard.body);
  const preFinishRows = preFinishLeaderboard.json().leaderboard as Array<Record<string, unknown>>;
  const hostBeforeFinish = preFinishRows.find((player) => String(player.userId) === String(host.user.id));
  const guestBeforeFinish = preFinishRows.find((player) => String(player.userId) === String(guest.user.id));
  assert.ok(hostBeforeFinish);
  assert.ok(guestBeforeFinish);
  assert.equal(hostBeforeFinish.rating, 1000);
  assert.equal(hostBeforeFinish.gamesPlayed, 0);
  assert.equal(guestBeforeFinish.rating, 1000);
  assert.equal(guestBeforeFinish.gamesPlayed, 0);

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
  assert.equal(hostStats.level, 1);
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
  const inviteNotifications = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  const inviteNotice = (inviteNotifications.json().notifications as Array<Record<string, unknown>>)
    .find((notice) => String((notice.data as Record<string, unknown>)?.inviteId) === String(incomingInvite.id));
  assert.ok(inviteNotice, 'A new invitation should create a notification.');
  const openedNoticeRow = await testPool.query(
    `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
      VALUES ($1, $2, 'system', 'Opened invite', 'Opened', jsonb_build_object('inviteId', 'opened-test', 'matchId', $3::text))
      RETURNING id`,
    [guest.user.id, host.user.id, invitedRoomId],
  );
  const openedNoticeId = String(openedNoticeRow.rows[0].id);
  const openInviteNotice = await app.inject({
    method: 'POST',
    url: `/api/v1/notifications/${openedNoticeId}/read`,
    headers: auth(guest.token),
  });
  assert.equal(openInviteNotice.statusCode, 200, openInviteNotice.body);
  assert.equal(openInviteNotice.json().cleared, true);
  const notificationsAfterOpeningInvite = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  assert.equal((notificationsAfterOpeningInvite.json().notifications as Array<Record<string, unknown>>)
    .some((notice) => String(notice.id) === openedNoticeId), false);

  const acceptInvite = await app.inject({
    method: 'POST',
    url: `/api/v1/match-invites/${incomingInvite.id}/respond`,
    headers: auth(guest.token),
    payload: { accept: true },
  });
  assert.equal(acceptInvite.statusCode, 200, acceptInvite.body);
  assert.equal(acceptInvite.json().response, 'accepted');
  const acceptedRoomExpiry = await testPool.query(
    'SELECT expires_at > NOW() + INTERVAL \'5 minutes\' AS extended FROM backgammon_matches WHERE id = $1',
    [invitedRoomId],
  );
  assert.equal(acceptedRoomExpiry.rows[0].extended, true,
    'Accepting an invitation must extend the waiting-room expiry.');
  const invitedMatch = await app.inject({
    method: 'GET',
    url: `/api/v1/matches/${invitedRoomId}`,
    headers: auth(host.token),
  });
  assert.equal(invitedMatch.statusCode, 200, invitedMatch.body);
  assert.equal(invitedMatch.json().match.status, 'waiting');
  assert.equal(invitedMatch.json().match.guestName, guest.user.username);
  assert.notEqual(invitedMatch.json().match.guestName, guest.user.fullName);
  const notificationsAfterAcceptance = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  assert.equal((notificationsAfterAcceptance.json().notifications as Array<Record<string, unknown>>)
    .some((notice) => String(notice.id) === String(inviteNotice.id)), false,
    'Accepting an invitation must clear its notification.');

  const expiredInviteNotice = await testPool.query(
    `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data, created_at)
      VALUES ($1, $2, 'system', 'Expired invite', 'Expired', jsonb_build_object('inviteId', 'expired-test', 'matchId', $3::text), NOW() - INTERVAL '11 seconds')
      RETURNING id`,
    [guest.user.id, host.user.id, invitedRoomId],
  );
  const notificationsAfterExpiry = await app.inject({
    method: 'GET',
    url: '/api/v1/notifications',
    headers: auth(guest.token),
  });
  assert.equal(notificationsAfterExpiry.statusCode, 200, notificationsAfterExpiry.body);
  assert.equal((notificationsAfterExpiry.json().notifications as Array<Record<string, unknown>>)
    .some((notice) => String(notice.id) === String(expiredInviteNotice.rows[0].id)), false,
    'Invite notices older than ten seconds must be removed from the notifications inbox.');



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

  // Expired waiting rooms must be removed even when no client polls the lobby.
  const abandonedRoom = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    headers: auth(host.token),
  });
  assert.equal(abandonedRoom.statusCode, 201, abandonedRoom.body);
  const abandonedRoomId = String(abandonedRoom.json().match.id);
  await testPool.query(
    `UPDATE backgammon_matches SET expires_at = NOW() - INTERVAL '1 second'
      WHERE id = $1 AND status = 'waiting'`,
    [abandonedRoomId],
  );
  let expiredRoomStillExists = await testPool.query(
    'SELECT id FROM backgammon_matches WHERE id = $1',
    [abandonedRoomId],
  );
  // The timer may run just before expiry, so exercise the request hook until
  // its throttled cleanup pass runs (this also models the serverless runtime).
  for (let attempt = 0; attempt < 10 && (expiredRoomStillExists.rowCount ?? 0) > 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await app.inject({ method: 'GET', url: '/api/v1/health' });
    expiredRoomStillExists = await testPool.query(
      'SELECT id FROM backgammon_matches WHERE id = $1',
      [abandonedRoomId],
    );
  }
  assert.equal(expiredRoomStillExists.rowCount, 0,
    'Expired waiting rooms must be physically deleted without requiring a lobby poll.');
});


test('subscription purchases debit the wallet atomically and record a ledger entry', async () => {
  const buyer = await register('Subscription Buyer');
  const adminStatus = await app.inject({
    method: 'GET',
    url: '/api/v1/admin/status',
    headers: auth(buyer.token),
  });
  assert.equal(adminStatus.statusCode, 200, adminStatus.body);
  assert.equal(adminStatus.json().isOwner, false);

  const forbiddenCredit = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/wallet/credit',
    headers: auth(buyer.token),
    payload: { userId: buyer.user.id, amount: 100, description: 'should be denied' },
  });
  assert.equal(forbiddenCredit.statusCode, 403, forbiddenCredit.body);

  const forbiddenPlanChange = await app.inject({
    method: 'PATCH',
    url: '/api/v1/admin/subscription-plans/vip_monthly',
    headers: auth(buyer.token),
    payload: { priceCredits: 0 },
  });
  assert.equal(forbiddenPlanChange.statusCode, 403, forbiddenPlanChange.body);

  const initialWallet = await app.inject({
    method: 'GET',
    url: '/api/v1/wallet',
    headers: auth(buyer.token),
  });
  assert.equal(initialWallet.statusCode, 200, initialWallet.body);
  assert.equal(initialWallet.json().balance, 0);

  const plans = await app.inject({
    method: 'GET',
    url: '/api/v1/subscriptions/plans',
    headers: auth(buyer.token),
  });
  assert.equal(plans.statusCode, 200, plans.body);
  assert.ok((plans.json().plans as Array<Record<string, unknown>>)
    .some((plan) => plan.code === 'vip_monthly'));

  const insufficient = await app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions/activate',
    headers: auth(buyer.token),
    payload: { planCode: 'vip_monthly' },
  });
  assert.equal(insufficient.statusCode, 409, insufficient.body);
  assert.equal(insufficient.json().balance, 0);

  await testPool.query(
    'INSERT INTO wallet_accounts (user_id, balance) VALUES ($1, 500) ON CONFLICT (user_id) DO UPDATE SET balance = 500',
    [buyer.user.id],
  );
  const purchase = await app.inject({
    method: 'POST',
    url: '/api/v1/subscriptions/activate',
    headers: auth(buyer.token),
    payload: { planCode: 'vip_monthly' },
  });
  assert.equal(purchase.statusCode, 200, purchase.body);
  assert.equal(purchase.json().walletBalance, 200);
  assert.equal(purchase.json().subscription.planCode, 'vip_monthly');

  const ledger = await testPool.query(
    'SELECT amount, balance_after, type FROM wallet_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
    [buyer.user.id],
  );
  assert.equal(Number(ledger.rows[0]?.amount), -300);
  assert.equal(Number(ledger.rows[0]?.balance_after), 200);
  assert.equal(ledger.rows[0]?.type, 'subscription_purchase');

  const activeSubscription = await app.inject({
    method: 'GET',
    url: '/api/v1/subscriptions/me',
    headers: auth(buyer.token),
  });
  assert.equal(activeSubscription.statusCode, 200, activeSubscription.body);
  assert.equal(activeSubscription.json().subscription.planCode, 'vip_monthly');
  assert.equal(activeSubscription.json().subscription.status, 'active');

  const walletAfter = await app.inject({
    method: 'GET',
    url: '/api/v1/wallet',
    headers: auth(buyer.token),
  });
  assert.equal(walletAfter.statusCode, 200, walletAfter.body);
  assert.equal(walletAfter.json().balance, 200);
  assert.ok((walletAfter.json().transactions as Array<Record<string, unknown>>)
    .some((transaction) => Number(transaction.amount) === -300 && Number(transaction.balanceAfter) === 200));
});


test('delegated report permissions are owner-granted, resource-scoped, audited, and revocable', async () => {
  const previousOwnerId = process.env.OWNER_USER_ID;
  const owner = await register('Permission Owner');
  const assistant = await register('Permission Assistant');
  const targetA = await register('Permission Target A');
  const targetB = await register('Permission Target B');
  const previousSwitch = await testPool.query('SELECT enabled FROM admin_permission_settings WHERE id = 1');
  const previousEnabled = previousSwitch.rows[0]?.enabled === true;
  process.env.OWNER_USER_ID = owner.user.id;

  try {
    const deniedList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(assistant.token),
    });
    assert.equal(deniedList.statusCode, 403, deniedList.body);

    const deniedSmsConnectionTest = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/security/sms-otp/test-connection',
      headers: auth(assistant.token),
      payload: {},
    });
    assert.equal(deniedSmsConnectionTest.statusCode, 403, deniedSmsConnectionTest.body);

    const deniedSmsMessageTest = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/security/sms-otp/test-message',
      headers: auth(assistant.token),
      payload: { phone: '09123456789', confirmCost: true },
    });
    assert.equal(deniedSmsMessageTest.statusCode, 403, deniedSmsMessageTest.body);

    const enableDelegation = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/permissions/settings',
      headers: auth(owner.token),
      payload: { enabled: true },
    });
    assert.equal(enableDelegation.statusCode, 200, enableDelegation.body);

    const readGrant = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: assistant.user.id,
        permission: 'reports.read',
        reason: 'Read reports without exposing account email addresses',
      },
    });
    assert.equal(readGrant.statusCode, 201, readGrant.body);

    const createdA = await testPool.query(
      'INSERT INTO user_reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, $3) RETURNING id',
      [assistant.user.id, targetA.user.id, 'Integration test report for scoped permission A'],
    );
    const createdB = await testPool.query(
      'INSERT INTO user_reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, $3) RETURNING id',
      [assistant.user.id, targetB.user.id, 'Integration test report for scoped permission B'],
    );
    const reportAId = String(createdA.rows[0].id);
    const reportBId = String(createdB.rows[0].id);

    const reportList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/reports',
      headers: auth(assistant.token),
    });
    assert.equal(reportList.statusCode, 200, reportList.body);
    const reportListJson = JSON.stringify(reportList.json());
    assert.equal(reportListJson.includes(assistant.user.email), false);
    assert.equal(reportListJson.includes(targetA.user.email), false);
    assert.equal(reportListJson.includes(targetB.user.email), false);
    assert.equal(reportListJson.includes('reportedEmail'), false);
    assert.equal(reportListJson.includes('reporterEmail'), false);

    const unscopedManageGrant = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: assistant.user.id,
        permission: 'reports.manage',
        reason: 'Unscoped grant must be rejected',
      },
    });
    assert.equal(unscopedManageGrant.statusCode, 400, unscopedManageGrant.body);

    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: assistant.user.id,
        permission: 'reports.manage',
        scope: { resourceIds: [targetA.user.id] },
        reason: 'Review reports for the assigned user only',
        approvalReference: 'phase1-integration-test',
      },
    });
    assert.equal(grant.statusCode, 201, grant.body);
    const grantId = String(grant.json().grant.id);

    const allowed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/reports/${reportAId}`,
      headers: auth(assistant.token),
      payload: { status: 'reviewed' },
    });
    assert.equal(allowed.statusCode, 200, allowed.body);

    const outsideScope = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/reports/${reportBId}`,
      headers: auth(assistant.token),
      payload: { status: 'dismissed' },
    });
    assert.equal(outsideScope.statusCode, 403, outsideScope.body);

    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/permissions/audit',
      headers: auth(owner.token),
    });
    assert.equal(audit.statusCode, 200, audit.body);
    assert.ok((audit.json().entries as Array<Record<string, unknown>>)
      .some((entry) => entry.action === 'grant_created' && entry.permission === 'reports.manage'));

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/permissions/grants/${grantId}`,
      headers: auth(owner.token),
    });
    assert.equal(revoked.statusCode, 200, revoked.body);

    const afterRevocation = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/reports/${reportAId}`,
      headers: auth(assistant.token),
      payload: { status: 'actioned' },
    });
    assert.equal(afterRevocation.statusCode, 403, afterRevocation.body);

    const secondGrant = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: assistant.user.id,
        permission: 'reports.manage',
        scope: { resourceIds: [targetA.user.id] },
        reason: 'Verify global delegated kill switch',
      },
    });
    assert.equal(secondGrant.statusCode, 201, secondGrant.body);
    const disableDelegation = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/permissions/settings',
      headers: auth(owner.token),
      payload: { enabled: false },
    });
    assert.equal(disableDelegation.statusCode, 200, disableDelegation.body);
    const blockedByKillSwitch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/reports/${reportAId}`,
      headers: auth(assistant.token),
      payload: { status: 'actioned' },
    });
    assert.equal(blockedByKillSwitch.statusCode, 403, blockedByKillSwitch.body);
  } finally {
    await testPool.query('UPDATE admin_permission_settings SET enabled = $1 WHERE id = 1', [previousEnabled]);
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
  }
});

test('development phone OTP simulator hashes, expires by policy, limits attempts, and consumes codes once', async () => {
  const prior = await testPool.query('SELECT delivery_mode FROM sms_otp_settings WHERE id = 1');
  const previousMode = prior.rows[0]?.delivery_mode ?? 'disabled';
  await testPool.query(
    `UPDATE sms_otp_settings
        SET delivery_mode = 'development_simulator', enabled = FALSE,
            otp_ttl_seconds = 120, resend_cooldown_seconds = 30,
            max_attempts = 3, daily_limit = 100
      WHERE id = 1`,
  );
  const phone = `09${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  try {
    const invalidPhone = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.11',
      payload: { phone: '+12025550123' },
    });
    assert.equal(invalidPhone.statusCode, 400);

    const issued = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.11',
      payload: { phone },
    });
    assert.equal(issued.statusCode, 202, issued.body);
    const issuedBody = issued.json() as { testCode?: string; accessToken?: string };
    assert.ok(/^[0-9]{6}$/.test(issuedBody.testCode ?? ''), 'The simulator must return a six-digit decimal code in development tests.');
    assert.equal(Object.hasOwn(issuedBody, 'accessToken'), false);

    const wrongCode = issuedBody.testCode === '000000' ? '000001' : '000000';
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone, code: wrongCode },
    });
    assert.equal(wrong.statusCode, 400);

    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone, code: issuedBody.testCode },
    });
    assert.equal(verified.statusCode, 200, verified.body);
    assert.equal(verified.json().verified, true);
    assert.equal(Object.hasOwn(verified.json(), 'accessToken'), false);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone, code: issuedBody.testCode },
    });
    assert.equal(reused.statusCode, 400);

    const stored = await testPool.query(
      'SELECT otp_digest, otp_salt, consumed_at FROM sms_otp_challenges WHERE phone_e164 = $1 ORDER BY id DESC LIMIT 1',
      [`+98${phone.slice(1)}`],
    );
    assert.equal(stored.rowCount, 1);
    assert.notEqual(stored.rows[0].otp_digest, issuedBody.testCode);
    assert.ok(stored.rows[0].consumed_at);
  } finally {
    await testPool.query('UPDATE sms_otp_settings SET delivery_mode = $1, enabled = FALSE WHERE id = 1', [previousMode]);
  }
});

test('OTP simulator enforces cooldown, expiry, attempt exhaustion, daily limits, and production lock', async () => {
  const prior = await testPool.query('SELECT delivery_mode, daily_limit FROM sms_otp_settings WHERE id = 1');
  const previousMode = prior.rows[0]?.delivery_mode ?? 'disabled';
  const previousDailyLimit = Number(prior.rows[0]?.daily_limit ?? 100);
  const previousNodeEnv = process.env.NODE_ENV;
  await testPool.query(
    `UPDATE sms_otp_settings
        SET delivery_mode = 'development_simulator', enabled = FALSE,
            otp_ttl_seconds = 120, resend_cooldown_seconds = 30,
            max_attempts = 3, daily_limit = 100
      WHERE id = 1`,
  );
  const phone = () => `09${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  const requestCode = async (number: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: number },
    });
    assert.equal(response.statusCode, 202, response.body);
    return String(response.json().testCode);
  };

  try {
    const cooldownPhone = phone();
    await requestCode(cooldownPhone);
    const cooldown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: cooldownPhone },
    });
    assert.equal(cooldown.statusCode, 429, cooldown.body);

    const expiredPhone = phone();
    const expiredCode = await requestCode(expiredPhone);
    await testPool.query(
      `UPDATE sms_otp_challenges SET expires_at = NOW() - INTERVAL '1 second'
        WHERE phone_e164 = $1 AND consumed_at IS NULL`,
      [`+98${expiredPhone.slice(1)}`],
    );
    const expired = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone: expiredPhone, code: expiredCode },
    });
    assert.equal(expired.statusCode, 400, expired.body);

    const exhaustedPhone = phone();
    const correctCode = await requestCode(exhaustedPhone);
    const wrongCode = correctCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 3; attempt++) {
      const wrong = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/phone-otp/verify',
        payload: { phone: exhaustedPhone, code: wrongCode },
      });
      assert.equal(wrong.statusCode, 400, wrong.body);
    }
    const exhausted = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone: exhaustedPhone, code: correctCode },
    });
    assert.equal(exhausted.statusCode, 400, exhausted.body);

    // The configured daily ceiling applies globally as well as per phone.
    await testPool.query("DELETE FROM sms_otp_challenges WHERE created_at >= NOW() - INTERVAL '1 day'");
    await testPool.query('UPDATE sms_otp_settings SET daily_limit = 1 WHERE id = 1');
    const globalFirst = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: phone() },
    });
    assert.equal(globalFirst.statusCode, 202, globalFirst.body);
    const globalSecond = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: phone() },
    });
    assert.equal(globalSecond.statusCode, 429, globalSecond.body);

    await testPool.query('UPDATE sms_otp_settings SET daily_limit = 0 WHERE id = 1');
    const dailyLimited = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: phone() },
    });
    assert.equal(dailyLimited.statusCode, 429, dailyLimited.body);

    process.env.NODE_ENV = 'production';
    const productionRequest = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.12',
      payload: { phone: phone() },
    });
    assert.equal(productionRequest.statusCode, 503, productionRequest.body);
    const productionVerify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone: phone(), code: '123456' },
    });
    assert.equal(productionVerify.statusCode, 503, productionVerify.body);

    const productionRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/register',
      payload: {
        phone: phone(), code: '123456', email: `blocked-${randomUUID()}@example.test`,
        password: 'IntegrationPass123!', fullName: 'Blocked OTP Registration',
      },
    });
    assert.equal(productionRegister.statusCode, 503, productionRegister.body);

    const productionLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/login',
      payload: { phone: phone(), code: '123456' },
    });
    assert.equal(productionLogin.statusCode, 503, productionLogin.body);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await testPool.query(
      'UPDATE sms_otp_settings SET delivery_mode = $1, daily_limit = $2, enabled = FALSE WHERE id = 1',
      [previousMode, previousDailyLimit],
    );
  }
});

test('owner SMS test actions fail closed without credentials and require explicit cost confirmation', async () => {
  const previousOwnerId = process.env.OWNER_USER_ID;
  const previous = await testPool.query(
    'SELECT enabled, delivery_mode, provider, template_id, encrypted_api_key FROM sms_otp_settings WHERE id = 1',
  );
  const oldSettings = previous.rows[0];
  const owner = await register('SMS Test Owner');
  process.env.OWNER_USER_ID = owner.user.id;
  await testPool.query(
    `UPDATE sms_otp_settings
        SET enabled = FALSE, delivery_mode = 'real_provider', provider = 'kavenegar',
            template_id = 'test-template', encrypted_api_key = ''
      WHERE id = 1`,
  );
  try {
    const connection = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/security/sms-otp/test-connection',
      headers: auth(owner.token),
      payload: {},
    });
    assert.equal(connection.statusCode, 409, connection.body);
    assert.equal(connection.json().ok, false);

    const unconfirmed = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/security/sms-otp/test-message',
      headers: auth(owner.token),
      payload: { phone: '09123456789', confirmCost: false },
    });
    assert.equal(unconfirmed.statusCode, 400, unconfirmed.body);

    const noCredentials = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/security/sms-otp/test-message',
      headers: auth(owner.token),
      payload: { phone: '09123456789', confirmCost: true },
    });
    assert.equal(noCredentials.statusCode, 409, noCredentials.body);
    assert.equal(JSON.stringify(noCredentials.json()).includes('encrypted_api_key'), false);
  } finally {
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
    await testPool.query(
      `UPDATE sms_otp_settings
          SET enabled = $1, delivery_mode = $2, provider = $3,
              template_id = $4, encrypted_api_key = $5
        WHERE id = 1`,
      [oldSettings.enabled, oldSettings.delivery_mode, oldSettings.provider, oldSettings.template_id, oldSettings.encrypted_api_key],
    );
  }
});

test('expired, malformed, and missing JWTs cannot access protected routes', async () => {
  const player = await register('Expired Token Player');
  const expiredToken = app.jwt.sign(
    { sub: player.user.id, email: player.user.email },
    { expiresIn: -1 },
  );
  const expired = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: auth(expiredToken),
  });
  assert.equal(expired.statusCode, 401, expired.body);

  const malformed = await app.inject({
    method: 'GET',
    url: '/api/v1/me',
    headers: { authorization: 'Bearer not-a-valid-jwt' },
  });
  assert.equal(malformed.statusCode, 401, malformed.body);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/v1/admin/security/sms-otp',
  });
  assert.equal(missing.statusCode, 401, missing.body);
});



test('expired and malformed JWTs are denied and missing owner configuration fails closed', async () => {
  const user = await register('Security Boundary User');
  const previousOwnerId = process.env.OWNER_USER_ID;
  const expiredToken = app.jwt.sign(
    { sub: user.user.id, email: user.user.email },
    { expiresIn: -1 },
  );
  try {
    delete process.env.OWNER_USER_ID;
    for (const token of [expiredToken, 'not-a-valid-jwt']) {
      const me = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: auth(token),
      });
      assert.equal(me.statusCode, 401, me.body);

      const ownerStatus = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/status',
        headers: auth(token),
      });
      assert.equal(ownerStatus.statusCode, 401, ownerStatus.body);
    }

    const missingOwnerConfig = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/security/sms-otp',
      headers: auth(user.token),
    });
    assert.equal(missingOwnerConfig.statusCode, 403, missingOwnerConfig.body);

    const deniedGrantManagement = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(user.token),
      payload: {
        userId: user.user.id,
        permission: 'reports.read',
        reason: 'Attempt to self-grant permission',
      },
    });
    assert.equal(deniedGrantManagement.statusCode, 403, deniedGrantManagement.body);
  } finally {
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
  }
});

test('delegated permission ceiling limits grants to 50 distinct users and permits replacement after revocation', async () => {
  const previousOwnerId = process.env.OWNER_USER_ID;
  const owner = await register('Permission Ceiling Owner');
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const inserted = await testPool.query(
    `INSERT INTO users (email, password_hash, username, full_name)
     SELECT 'phase1-ceiling-' || $1 || '-' || n || '@example.test',
            'test-only-password-hash',
            'phase1ceiling' || $1 || 'x' || n,
            ''
       FROM generate_series(1, 51) AS n
       RETURNING id`,
    [suffix],
  );
  const userIds = inserted.rows.map((row) => String(row.id));
  const previousSwitch = await testPool.query('SELECT enabled FROM admin_permission_settings WHERE id = 1');
  const previousEnabled = previousSwitch.rows[0]?.enabled === true;
  process.env.OWNER_USER_ID = owner.user.id;
  try {
    // Earlier integration cases may have left active grants in the shared test DB.
    // Clear them first so this case tests exactly 50 distinct active delegates.
    await testPool.query('UPDATE admin_permission_grants SET revoked_at = NOW(), revoked_by = $1 WHERE revoked_at IS NULL', [owner.user.id]);
    await testPool.query('UPDATE admin_permission_settings SET enabled = TRUE WHERE id = 1');
    for (const userId of userIds.slice(0, 50)) {
      await testPool.query(
        `INSERT INTO admin_permission_grants
          (grantee_user_id, permission, scope, reason, granted_by)
         VALUES ($1, 'reports.read', NULL, 'Integration test for delegate ceiling', $2)`,
        [userId, owner.user.id],
      );
    }
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: userIds[50],
        permission: 'reports.read',
        reason: 'Verify ceiling rejects delegate 51',
      },
    });
    assert.equal(denied.statusCode, 409, denied.body);

    const revoked = await testPool.query(
      `UPDATE admin_permission_grants SET revoked_at = NOW(), revoked_by = $1
        WHERE grantee_user_id = $2 AND permission = 'reports.read' AND revoked_at IS NULL
        RETURNING id`,
      [owner.user.id, userIds[0]],
    );
    assert.equal(revoked.rowCount, 1);
    const allowedAfterRevocation = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: userIds[50],
        permission: 'reports.read',
        reason: 'Replace revoked delegate within ceiling',
      },
    });
    assert.equal(allowedAfterRevocation.statusCode, 201, allowedAfterRevocation.body);
  } finally {
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
    await testPool.query('UPDATE admin_permission_settings SET enabled = $1 WHERE id = 1', [previousEnabled]);
  }
});

test('owner SMS settings keep provider credentials encrypted and refuse activation', async () => {
  const previousOwnerId = process.env.OWNER_USER_ID;
  const previousEncryptionKey = process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
  const oldSettingsResult = await testPool.query(
    'SELECT enabled, delivery_mode, provider, sender_id, template_id, encrypted_api_key, otp_ttl_seconds, resend_cooldown_seconds, max_attempts, daily_limit FROM sms_otp_settings WHERE id = 1',
  );
  const oldSettings = oldSettingsResult.rows[0];
  const owner = await register('SMS Settings Security Owner');
  process.env.OWNER_USER_ID = owner.user.id;
  process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/security/sms-otp',
      headers: auth(owner.token),
      payload: {
        enabled: false,
        deliveryMode: 'real_provider',
        provider: 'kavenegar',
        senderId: '',
        templateId: 'test-template',
        apiKey: 'test-provider-secret-do-not-return',
        otpTtlSeconds: 120,
        resendCooldownSeconds: 60,
        maxAttempts: 5,
        dailyLimit: 100,
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().settings.enabled, false);
    assert.equal(saved.json().settings.apiKeyConfigured, true);
    assert.equal(JSON.stringify(saved.json()).includes('test-provider-secret-do-not-return'), false);
    assert.equal(JSON.stringify(saved.json()).includes('encrypted_api_key'), false);

    const stored = await testPool.query(
      'SELECT enabled, encrypted_api_key FROM sms_otp_settings WHERE id = 1',
    );
    assert.equal(stored.rows[0].enabled, false);
    assert.notEqual(stored.rows[0].encrypted_api_key, 'test-provider-secret-do-not-return');
    assert.ok(String(stored.rows[0].encrypted_api_key).length > 30);

    const getSettings = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/security/sms-otp',
      headers: auth(owner.token),
    });
    assert.equal(getSettings.statusCode, 200, getSettings.body);
    assert.equal(getSettings.json().settings.apiKeyConfigured, true);
    assert.equal(JSON.stringify(getSettings.json()).includes('test-provider-secret-do-not-return'), false);
    assert.equal(JSON.stringify(getSettings.json()).includes('encrypted_api_key'), false);

    const enable = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/security/sms-otp',
      headers: auth(owner.token),
      payload: { enabled: true },
    });
    assert.equal(enable.statusCode, 409, enable.body);
    const stillDisabled = await testPool.query('SELECT enabled FROM sms_otp_settings WHERE id = 1');
    assert.equal(stillDisabled.rows[0].enabled, false);
  } finally {
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
    if (previousEncryptionKey === undefined) delete process.env.SMS_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.SMS_CREDENTIALS_ENCRYPTION_KEY = previousEncryptionKey;
    await testPool.query(
      `UPDATE sms_otp_settings SET enabled = $1, delivery_mode = $2, provider = $3,
        sender_id = $4, template_id = $5, encrypted_api_key = $6,
        otp_ttl_seconds = $7, resend_cooldown_seconds = $8, max_attempts = $9, daily_limit = $10
        WHERE id = 1`,
      [oldSettings.enabled, oldSettings.delivery_mode, oldSettings.provider, oldSettings.sender_id,
       oldSettings.template_id, oldSettings.encrypted_api_key, oldSettings.otp_ttl_seconds,
       oldSettings.resend_cooldown_seconds, oldSettings.max_attempts, oldSettings.daily_limit],
    );
  }
});

test('delegated permission grants enforce the 50-user ceiling under owner authorization', async () => {
  const previousOwnerId = process.env.OWNER_USER_ID;
  const owner = await register('Delegate Cap Owner');
  process.env.OWNER_USER_ID = owner.user.id;
  const prefix = `delegate-cap-${randomUUID()}`;
  const createdIds: string[] = [];
  try {
    const activeCountResult = await testPool.query(
      'SELECT COUNT(DISTINCT grantee_user_id)::int AS count FROM admin_permission_grants WHERE revoked_at IS NULL',
    );
    const activeCount = Number(activeCountResult.rows[0]?.count ?? 0);
    assert.ok(activeCount <= 50, `Existing active delegated users unexpectedly exceed 50: ${activeCount}`);

    const users = await testPool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, country, username)
       SELECT $1 || '-' || n::text || '@example.test', 'test-only-hash', 'Delegate Cap Test', '', '', NULL
         FROM generate_series(1, 51) AS n
       RETURNING id`,
      [prefix],
    );
    createdIds.push(...users.rows.map((row) => String(row.id)));
    const slotsToFill = 50 - activeCount;
    if (slotsToFill > 0) {
      await testPool.query(
        `INSERT INTO admin_permission_grants
           (grantee_user_id, permission, scope, reason, approval_reference, granted_by)
         SELECT user_id, 'reports.read', NULL, 'Test fixture for 50-delegate ceiling', 'integration-test', $2
           FROM unnest($1::bigint[]) AS user_id`,
        [createdIds.slice(0, slotsToFill), owner.user.id],
      );
    }

    const overLimit = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/permissions/grants',
      headers: auth(owner.token),
      payload: {
        userId: createdIds[slotsToFill],
        permission: 'reports.read',
        reason: 'Verify delegate ceiling rejects user 51',
        approvalReference: 'phase1-cap-test',
      },
    });
    assert.equal(overLimit.statusCode, 409, overLimit.body);
    assert.match(overLimit.json().error, /50 delegated users/);
  } finally {
    if (createdIds.length) {
      await testPool.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [createdIds]);
    }
    if (previousOwnerId === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = previousOwnerId;
  }
});

test('purpose-bound OTP can register a new phone account, log it in, and link a verified phone', async () => {
  const prior = await testPool.query(
    'SELECT delivery_mode, enabled, daily_limit, resend_cooldown_seconds FROM sms_otp_settings WHERE id = 1',
  );
  const old = prior.rows[0] ?? {};
  await testPool.query(
    `UPDATE sms_otp_settings
        SET delivery_mode = 'development_simulator', enabled = FALSE,
            daily_limit = 100, resend_cooldown_seconds = 30,
            otp_ttl_seconds = 120, max_attempts = 3
      WHERE id = 1`,
  );
  const phone = () => `09${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`;
  const requestCode = async (number: string, purpose: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/request',
      remoteAddress: '127.0.0.13',
      payload: { phone: number, purpose },
    });
    assert.equal(response.statusCode, 202, response.body);
    return String(response.json().testCode);
  };

  try {
    const newPhone = phone();
    const registerCode = await requestCode(newPhone, 'register');
    const crossPurpose = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/verify',
      payload: { phone: newPhone, code: registerCode },
    });
    assert.equal(crossPurpose.statusCode, 400, 'A registration code must not be usable as a generic verification code.');

    const email = `otp-register-${randomUUID()}@example.test`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/register',
      payload: {
        phone: newPhone,
        code: registerCode,
        email,
        password: 'IntegrationPass123!',
        fullName: 'OTP Registered Player',
        country: 'Iran',
      },
    });
    assert.equal(registered.statusCode, 201, registered.body);
    assert.ok(registered.json().accessToken);
    const registeredId = String(registered.json().user.id);
    const storedPhone = await testPool.query('SELECT phone_e164 FROM users WHERE id = $1', [registeredId]);
    assert.equal(storedPhone.rows[0].phone_e164, `+98${newPhone.slice(1)}`);

    await testPool.query(
      'UPDATE sms_otp_challenges SET created_at = NOW() - INTERVAL \'1 minute\' WHERE phone_e164 = $1',
      [`+98${newPhone.slice(1)}`],
    );
    const loginCode = await requestCode(newPhone, 'login');
    const loggedIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/login',
      payload: { phone: newPhone, code: loginCode },
    });
    assert.equal(loggedIn.statusCode, 200, loggedIn.body);
    assert.equal(String(loggedIn.json().user.id), registeredId);
    assert.ok(loggedIn.json().accessToken);

    const account = await register('OTP Phone Link Account');
    const linkPhone = phone();
    const linkCode = await requestCode(linkPhone, 'link');
    const linked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/link',
      headers: auth(account.token),
      payload: { phone: linkPhone, code: linkCode },
    });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().phoneE164, `+98${linkPhone.slice(1)}`);

    const unverifiedPhoneEdit = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      headers: auth(account.token),
      payload: { fullName: 'OTP Phone Link Account', phone: '09111111111', country: 'Iran' },
    });
    assert.equal(unverifiedPhoneEdit.statusCode, 409, unverifiedPhoneEdit.body);

    await testPool.query(
      'UPDATE sms_otp_challenges SET created_at = NOW() - INTERVAL \'1 minute\' WHERE phone_e164 = $1',
      [`+98${linkPhone.slice(1)}`],
    );
    const duplicateCode = await requestCode(linkPhone, 'link');
    const duplicateLink = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/phone-otp/link',
      headers: auth(registered.json().accessToken),
      payload: { phone: linkPhone, code: duplicateCode },
    });
    assert.equal(duplicateLink.statusCode, 409, duplicateLink.body);
  } finally {
    await testPool.query(
      'UPDATE sms_otp_settings SET delivery_mode = $1, enabled = $2, daily_limit = $3, resend_cooldown_seconds = $4 WHERE id = 1',
      [old.delivery_mode ?? 'disabled', old.enabled ?? false, old.daily_limit ?? 100, old.resend_cooldown_seconds ?? 60],
    );
  }
});

