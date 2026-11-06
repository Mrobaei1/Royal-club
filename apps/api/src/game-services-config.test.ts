import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicServiceOrigin, publicGameServices } from './game-services-config.js';

test('accepts only HTTPS service origins without credentials or URL suffixes', () => {
  assert.equal(normalizePublicServiceOrigin('https://uno.example.com'), 'https://uno.example.com');
  assert.equal(normalizePublicServiceOrigin('http://uno.example.com'), null);
  assert.equal(normalizePublicServiceOrigin('https://uno.example.com/path'), null);
  assert.equal(normalizePublicServiceOrigin('https://user:pass@uno.example.com'), null);
  assert.equal(normalizePublicServiceOrigin('not a URL'), null);
  assert.equal(normalizePublicServiceOrigin(undefined), null);
});

test('returns a safe public game-services configuration', () => {
  assert.deepEqual(publicGameServices({ UNO_SERVER_URL: 'https://uno.example.com' }), {
    uno: 'https://uno.example.com',
  });
  assert.deepEqual(publicGameServices({ UNO_SERVER_URL: 'http://unsafe.example.com' }), {
    uno: null,
  });
});
