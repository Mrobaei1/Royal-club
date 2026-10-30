import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAgentAction } from './agent-policy.js';

const grant = { active: true, capabilities: ['read', 'recommend'] as const, gameCodes: ['backgammon'] as const };

test('authorization fails closed when runtime is disabled or kill switch is on', () => {
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: false, killSwitchEnabled: false, grant, capability: 'read' }), { allowed: false, reason: 'runtime_disabled' });
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: true, grant, capability: 'read' }), { allowed: false, reason: 'kill_switch' });
});

test('authorization requires an active grant and explicit capability', () => {
  assert.equal(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: null, capability: 'read' }).allowed, false);
  assert.equal(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: { ...grant, active: false }, capability: 'read' }).allowed, false);
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant, capability: 'execute' }), { allowed: false, reason: 'capability_denied' });
});

test('game scope is exact and missing scope is not unrestricted', () => {
  assert.equal(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant, capability: 'read', resource: { gameCode: 'backgammon' } }).allowed, true);
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant, capability: 'read', resource: { gameCode: 'poker' } }), { allowed: false, reason: 'scope_denied' });
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: { active: true, capabilities: ['read'] }, capability: 'read', resource: { gameCode: 'uno' } }), { allowed: false, reason: 'scope_denied' });
});

test('scoped grants deny requests that omit the scoped resource', () => {
  assert.deepEqual(
    authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant, capability: 'read' }),
    { allowed: false, reason: 'scope_denied' },
  );
  assert.deepEqual(
    authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant, capability: 'read', resource: { gameCode: '' } }),
    { allowed: false, reason: 'scope_denied' },
  );
  const resourceScoped = { active: true, capabilities: ['read'] as const, resourceIds: ['league-1'] as const };
  assert.deepEqual(
    authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: resourceScoped, capability: 'read' }),
    { allowed: false, reason: 'scope_denied' },
  );
  assert.equal(
    authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: resourceScoped, capability: 'read', resource: { resourceId: 'league-1' } }).allowed,
    true,
  );
});

test('sensitive actions remain owner-only even if an agent has broad capabilities', () => {
  assert.deepEqual(authorizeAgentAction({ runtimeEnabled: true, killSwitchEnabled: false, grant: { active: true, capabilities: ['read', 'recommend', 'execute', 'approve'] }, capability: 'execute', sensitiveAction: 'wallet_credit' }), { allowed: false, reason: 'owner_only_action' });
});
