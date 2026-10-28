import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtpCode, digestOtp, normalizeIranianMobile, verifyOtpDigest } from './otp-security.js';

test('normalizes common Iranian mobile formats to E.164', () => {
  assert.equal(normalizeIranianMobile('09123456789'), '+989123456789');
  assert.equal(normalizeIranianMobile('+989123456789'), '+989123456789');
  assert.equal(normalizeIranianMobile('0098 912 345 6789'), '+989123456789');
  assert.equal(normalizeIranianMobile('989123456789'), '+989123456789');
});

test('rejects non-Iranian, malformed, and non-string phone numbers', () => {
  for (const phone of ['+12025550123', '0912345678', '091234567890', '1234567890', '', null, 9123456789]) {
    assert.equal(normalizeIranianMobile(phone), null);
  }
});

test('OTP generation always produces a six-digit decimal code', () => {
  for (let i = 0; i < 100; i++) assert.match(createOtpCode(), /^\d{6}$/);
});

test('OTP digest verifies only the matching code and validates stored format', () => {
  const digest = digestOtp('123456', '0123456789abcdef0123456789abcdef');
  assert.equal(verifyOtpDigest('123456', digest), true);
  assert.equal(verifyOtpDigest('123457', digest), false);
  assert.equal(verifyOtpDigest('12345', digest), false);
  assert.equal(verifyOtpDigest('123456', { salt: 'bad', digest: digest.digest }), false);
});
