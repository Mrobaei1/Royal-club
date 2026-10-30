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

test('every declared sensitive action remains owner-only', () => {
  const sensitiveActions = [
    'wallet_credit', 'wallet_debit', 'wallet_refund', 'wallet_correction',
    'role_change', 'moderation_penalty', 'competition_result_override',
    'advertising_spend', 'external_message', 'production_config',
    'database_migration', 'deployment', 'destructive_operation',
  ] as const;
  const broadGrant = {
    active: true,
    capabilities: ['read', 'recommend', 'execute', 'approve'] as const,
  };
  for (const sensitiveAction of sensitiveActions) {
    assert.deepEqual(
      authorizeAgentAction({
        runtimeEnabled: true,
        killSwitchEnabled: false,
        grant: broadGrant,
        capability: 'execute',
        sensitiveAction,
      }),
      { allowed: false, reason: 'owner_only_action' },
      `Sensitive action ${sensitiveAction} must never be delegated to an agent.`,
    );
  }
});

test('game and resource scopes must both match when a grant has both restrictions', () => {
  const dualScopedGrant = {
    active: true,
    capabilities: ['read'] as const,
    gameCodes: ['backgammon'] as const,
    resourceIds: ['league-42'] as const,
  };
  const authorize = (resource: { gameCode?: string; resourceId?: string }) =>
    authorizeAgentAction({
      runtimeEnabled: true,
      killSwitchEnabled: false,
      grant: dualScopedGrant,
      capability: 'read',
      resource,
    });
  assert.deepEqual(authorize({ gameCode: 'backgammon', resourceId: 'league-42' }), { allowed: true, reason: 'authorized' });
  assert.deepEqual(authorize({ gameCode: 'backgammon', resourceId: 'league-43' }), { allowed: false, reason: 'scope_denied' });
  assert.deepEqual(authorize({ gameCode: 'chess', resourceId: 'league-42' }), { allowed: false, reason: 'scope_denied' });
  assert.deepEqual(authorize({ gameCode: 'backgammon' }), { allowed: false, reason: 'scope_denied' });
  assert.deepEqual(authorize({ resourceId: 'league-42' }), { allowed: false, reason: 'scope_denied' });
});
