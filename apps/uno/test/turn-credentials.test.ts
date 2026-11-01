import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTurnCredentials, parseTurnUrls } from '../src/turn-credentials.js';

test('TURN credentials use coturn REST HMAC-SHA1 format and expire', () => {
  const result = createTurnCredentials('user-42', 'shared-secret', 900, 1_800_000_000_000);
  assert.equal(result.username, '1800000900:user-42');
  assert.equal(result.expiresAt, 1_800_000_900);
  assert.equal(result.credential, createHmac('sha1', 'shared-secret').update(result.username).digest('base64'));
});
test('TURN credential lifetime is bounded to 60–3600 seconds', () => {
  assert.equal(createTurnCredentials('u', 's', 10, 1_000_000).expiresAt, 1060);
  assert.equal(createTurnCredentials('u', 's', 99999, 1_000_000).expiresAt, 4600);
});

test('TURN URL parser supports UDP, TCP and TLS fallback URLs without duplicates', () => {
  assert.deepEqual(
    parseTurnUrls(' turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp,turn:turn.example.com:3478?transport=udp '),
    [
      'turn:turn.example.com:3478?transport=udp',
      'turn:turn.example.com:3478?transport=tcp',
      'turns:turn.example.com:5349?transport=tcp',
    ],
  );
  assert.deepEqual(parseTurnUrls(undefined), []);
  assert.throws(() => parseTurnUrls('https://not-a-turn-server.example'), /TURN URLs/);
});
