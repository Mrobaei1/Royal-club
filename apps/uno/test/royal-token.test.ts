import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyRoyalHs256Token } from '../src/royal-token.js';

const secret = 'test-secret-that-is-long-enough-for-hs256';
function token(payload: Record<string, unknown>, alg = 'HS256', signingSecret = secret): string {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}
test('verifies Royal Club HS256 subject, expiry and token version', () => {
  const claims = verifyRoyalHs256Token(token({ sub: '42', exp: 2000, ver: 3 }), secret, 1000);
  assert.equal(claims.sub, '42');
  assert.equal(claims.ver, 3);
});
test('rejects an invalid signature and non-HS256 algorithm', () => {
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, ver: 0 }, 'HS256', 'wrong-secret'), secret, 1000), /signature/);
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, ver: 0 }, 'none'), secret, 1000), /algorithm/);
});
test('rejects expired, not-yet-active and versionless tokens', () => {
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 1000, ver: 0 }), secret, 1000), /expired/);
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, nbf: 1500, ver: 0 }), secret, 1000), /not active/);
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000 }), secret, 1000), /version/);
});
test('rejects weak JWT secrets and missing subjects', () => {
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, ver: 0 }), 'weak', 1000), /secret/);
  assert.throws(() => verifyRoyalHs256Token(token({ exp: 2000, ver: 0 }), secret, 1000), /subject/);
});


test('rejects malformed token segments and tampered payloads', () => {
  assert.throws(() => verifyRoyalHs256Token('not-a-jwt', secret, 1000));
  const valid = token({ sub: '42', exp: 2000, ver: 0 });
  const parts = valid.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'admin', exp: 2000, ver: 0 })).toString('base64url');
  assert.throws(() => verifyRoyalHs256Token(`${parts[0]}.${tamperedPayload}.${parts[2]}`, secret, 1000), /signature/);
});

test('rejects invalid numeric time and token version claims', () => {
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: Number.NaN, ver: 0 }), secret, 1000), /expired/);
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, nbf: 'soon', ver: 0 }), secret, 1000), /active/);
  assert.throws(() => verifyRoyalHs256Token(token({ sub: '42', exp: 2000, ver: -1 }), secret, 1000), /version/);
});
