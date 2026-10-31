import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOwnerProtectedAction } from './owner-protection.js';

const base = {
  configuredOwnerId: '42',
  durableOwnerId: '42',
  actorId: '42',
  action: 'security_policy_change' as const,
  stepUpVerified: true,
  nowMs: 1_800_000_000_000,
};

const ownerApproval = {
  approvedBy: '42',
  requestedBy: '17',
  actionDigest: 'sha256:exact-action',
  target: 'wallet:primary',
  expiresAtMs: 1_800_000_060_000,
  consumedAtMs: null,
};

test('owner anchor must be present, numeric, valid and consistent', () => {
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, configuredOwnerId: null }), { allowed: false, reason: 'owner_anchor_missing' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, configuredOwnerId: 'owner' }), { allowed: false, reason: 'owner_anchor_invalid' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, durableOwnerId: '43' }), { allowed: false, reason: 'owner_anchor_mismatch' });
});

test('username-like or non-owner actor values never satisfy owner identity', () => {
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, actorId: '17' }), { allowed: false, reason: 'actor_not_owner' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, actorId: 'ElizArya' }), { allowed: false, reason: 'actor_not_owner' });
});

test('owner-only changes require verified step-up authentication', () => {
  assert.deepEqual(authorizeOwnerProtectedAction({ ...base, stepUpVerified: false }), { allowed: false, reason: 'step_up_required' });
  assert.deepEqual(authorizeOwnerProtectedAction(base), { allowed: true, reason: 'owner_authorized' });
});

test('refund and financial outflow require exact, unexpired, unused owner approval', () => {
  const request = {
    ...base,
    action: 'financial_outflow' as const,
    actionDigest: 'sha256:exact-action',
    target: 'wallet:primary',
  };
  assert.deepEqual(authorizeOwnerProtectedAction(request), { allowed: false, reason: 'owner_approval_required' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: { ...ownerApproval, actionDigest: 'sha256:other' } }), { allowed: false, reason: 'approval_mismatch' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: { ...ownerApproval, target: 'wallet:attacker' } }), { allowed: false, reason: 'approval_mismatch' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: { ...ownerApproval, expiresAtMs: request.nowMs } }), { allowed: false, reason: 'approval_expired' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: { ...ownerApproval, consumedAtMs: request.nowMs - 1 } }), { allowed: false, reason: 'approval_consumed' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: ownerApproval }), { allowed: true, reason: 'owner_approval_verified' });
});

test('permanent agent offboarding also requires explicit owner approval', () => {
  const request = {
    ...base,
    action: 'agent_permanent_offboard' as const,
    actionDigest: 'sha256:exact-action',
    target: 'agent:marketing-01',
  };
  assert.deepEqual(authorizeOwnerProtectedAction(request), { allowed: false, reason: 'owner_approval_required' });
  assert.deepEqual(authorizeOwnerProtectedAction({ ...request, approval: ownerApproval }), { allowed: true, reason: 'owner_approval_verified' });
});

test('non-owner cannot use a valid owner approval as delegated authority', () => {
  assert.deepEqual(authorizeOwnerProtectedAction({
    ...base,
    actorId: '17',
    action: 'financial_refund',
    actionDigest: 'sha256:exact-action',
    target: 'wallet:primary',
    approval: ownerApproval,
  }), { allowed: false, reason: 'actor_not_owner' });
});
