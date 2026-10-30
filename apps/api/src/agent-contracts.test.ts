import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionAgentTask, matchesAgentApproval, type AgentApprovalRecord } from './agent-contracts.js';

test('agent task state machine permits only explicit forward transitions', () => {
  assert.equal(canTransitionAgentTask('proposed', 'awaiting_approval'), true);
  assert.equal(canTransitionAgentTask('awaiting_approval', 'queued'), true);
  assert.equal(canTransitionAgentTask('queued', 'running'), true);
  assert.equal(canTransitionAgentTask('running', 'succeeded'), true);
  assert.equal(canTransitionAgentTask('succeeded', 'queued'), false);
  assert.equal(canTransitionAgentTask('running', 'awaiting_approval'), false);
  assert.equal(canTransitionAgentTask('rejected', 'queued'), false);
});

const approval: AgentApprovalRecord = {
  actionDigest: 'sha256:action-a',
  target: 'league:42',
  approvedBy: 'owner-7',
  requestedBy: 'agent-3',
  expiresAtMs: 5000,
  consumedAtMs: null,
};

test('approval is bound to the exact action, target, expiry and one-time use', () => {
  assert.equal(matchesAgentApproval(approval, {
    actionDigest: 'sha256:action-a', target: 'league:42', nowMs: 4999,
  }), true);
  assert.equal(matchesAgentApproval(approval, {
    actionDigest: 'sha256:action-b', target: 'league:42', nowMs: 1000,
  }), false);
  assert.equal(matchesAgentApproval(approval, {
    actionDigest: 'sha256:action-a', target: 'league:43', nowMs: 1000,
  }), false);
  assert.equal(matchesAgentApproval(approval, {
    actionDigest: 'sha256:action-a', target: 'league:42', nowMs: 5000,
  }), false);
  assert.equal(matchesAgentApproval({ ...approval, consumedAtMs: 3000 }, {
    actionDigest: 'sha256:action-a', target: 'league:42', nowMs: 4000,
  }), false);
});

test('requester cannot approve their own action and malformed approvals fail closed', () => {
  assert.equal(matchesAgentApproval({ ...approval, approvedBy: approval.requestedBy }, {
    actionDigest: 'sha256:action-a', target: 'league:42', nowMs: 1000,
  }), false);
  assert.equal(matchesAgentApproval({ ...approval, expiresAtMs: Number.NaN }, {
    actionDigest: 'sha256:action-a', target: 'league:42', nowMs: 1000,
  }), false);
});
