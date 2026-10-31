import test from 'node:test';
import assert from 'node:assert/strict';
import { isNumericId, isReservedUsername, isValidAvatarDataUrl, isValidRegistrationPassword } from './validation.js';

test('accepts positive decimal database IDs', () => {
  assert.equal(isNumericId('1'), true);
  assert.equal(isNumericId('987654321'), true);
});

test('rejects malformed or non-string IDs', () => {
  for (const value of ['', '0', '00', '01', '0x10', '1.5', '-1', ' 12', '12 ', 'abc', undefined, null, 12]) {
    assert.equal(isNumericId(value), false, `expected ${String(value)} to be rejected`);
  }
});

test('registration passwords require at least six Unicode characters', () => {
  assert.equal(isValidRegistrationPassword('Ab3!x'), false);
  assert.equal(isValidRegistrationPassword('Ab3!xY'), true);
  assert.equal(isValidRegistrationPassword('ابپتثج'), true);
  assert.equal(isValidRegistrationPassword('😀😀😀😀😀😀'), true);
});

test('registration passwords are limited to 128 UTF-8 bytes', () => {
  assert.equal(isValidRegistrationPassword('a'.repeat(128)), true);
  assert.equal(isValidRegistrationPassword('a'.repeat(129)), false);
  assert.equal(isValidRegistrationPassword(''), false);
  assert.equal(isValidRegistrationPassword(undefined), false);
});

test('reserved owner username is recognized case-insensitively', () => {
  assert.equal(isReservedUsername('ElizArya'), true);
  assert.equal(isReservedUsername('elizarya'), true);
  assert.equal(isReservedUsername('@ELIZARYA'), true);
  assert.equal(isReservedUsername('elizarya2'), false);
  assert.equal(isReservedUsername(null), false);
});

test('avatar data URLs require matching PNG, JPEG, or WebP signatures', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const webp = Buffer.from('RIFF0000WEBP');
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${png.toString('base64')}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/jpeg;base64,${jpeg.toString('base64')}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/webp;base64,${webp.toString('base64')}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${jpeg.toString('base64')}`), false);
  assert.equal(isValidAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isValidAvatarDataUrl('data:image/png;base64,A'), false);
  assert.equal(isValidAvatarDataUrl('data:image/png;base64,not-base64!'), false);
  assert.equal(isValidAvatarDataUrl(null), false);
});

test('avatar decoded payload is capped at 650 KiB', () => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const within = Buffer.concat([header, Buffer.alloc(650 * 1024 - header.length)]);
  const over = Buffer.concat([header, Buffer.alloc(650 * 1024 + 1 - header.length)]);
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${within.toString('base64')}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${over.toString('base64')}`), false);
});
