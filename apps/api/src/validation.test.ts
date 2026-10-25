import test from 'node:test';
import assert from 'node:assert/strict';
import { isNumericId } from './validation.js';

test('accepts positive decimal database IDs', () => {
  assert.equal(isNumericId('1'), true);
  assert.equal(isNumericId('987654321'), true);
});

test('rejects malformed or non-string IDs', () => {
  for (const value of ['', '0x10', '1.5', '-1', ' 12', '12 ', 'abc', undefined, null, 12]) {
    assert.equal(isNumericId(value), false, `expected ${String(value)} to be rejected`);
  }
});
