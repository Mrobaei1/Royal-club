import test from 'node:test';
import assert from 'node:assert/strict';
import { isNumericId, isReservedUsername, isValidRegistrationPassword } from './validation.js';

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
