import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidNeonTriggerInvocation } from './neon-trigger-auth.js';

test('accepts a Neon trigger only when header and body invocation IDs match', () => {
  assert.equal(isValidNeonTriggerInvocation('invoke-123', { invocation_id: 'invoke-123' }), true);
});

test('rejects missing or empty invocation header', () => {
  assert.equal(isValidNeonTriggerInvocation(undefined, { invocation_id: 'invoke-123' }), false);
  assert.equal(isValidNeonTriggerInvocation('', { invocation_id: '' }), false);
});

test('rejects absent, malformed, or mismatched invocation body', () => {
  assert.equal(isValidNeonTriggerInvocation('invoke-123', undefined), false);
  assert.equal(isValidNeonTriggerInvocation('invoke-123', null), false);
  assert.equal(isValidNeonTriggerInvocation('invoke-123', []), false);
  assert.equal(isValidNeonTriggerInvocation('invoke-123', { invocation_id: 123 }), false);
  assert.equal(isValidNeonTriggerInvocation('invoke-123', { invocation_id: 'invoke-456' }), false);
});
