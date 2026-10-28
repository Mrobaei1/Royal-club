import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRoyalPermission, isRoyalPermission, permissionCatalog } from './permissions.js';

test('permission catalog is explicit and rejects unknown or privileged names', () => {
  assert.ok(permissionCatalog.includes('users.read'));
  assert.equal(isRoyalPermission('users.read'), true);
  assert.equal(isRoyalPermission('wallet.credit'), false);
  assert.equal(isRoyalPermission('admin.roles.manage'), false);
  assert.equal(isRoyalPermission(null), false);
});

test('authorization denies by default and ignores inactive grants', () => {
  assert.equal(hasRoyalPermission([], 'users.read'), false);
  assert.equal(hasRoyalPermission([{ permission: 'users.read', active: false }], 'users.read'), false);
  assert.equal(hasRoyalPermission([{ permission: 'wallet.credit', active: true }], 'wallet.credit'), false);
});

test('unscoped grant permits the named capability and scoped grants require matching resource', () => {
  const grants = [
    { permission: 'reports.read', active: true },
    { permission: 'leagues.manage', active: true, scope: { resourceIds: ['league-1'] } },
  ];
  assert.equal(hasRoyalPermission(grants, 'reports.read'), true);
  assert.equal(hasRoyalPermission(grants, 'reports.read', 'report-1'), true);
  assert.equal(hasRoyalPermission(grants, 'leagues.manage', 'league-1'), true);
  assert.equal(hasRoyalPermission(grants, 'leagues.manage', 'league-2'), false);
  assert.equal(hasRoyalPermission(grants, 'leagues.manage'), false);
});

test('malformed scopes fail closed', () => {
  assert.equal(hasRoyalPermission([
    { permission: 'users.read', active: true, scope: { resourceIds: ['ok', 7] } },
  ], 'users.read', 'ok'), false);
  assert.equal(hasRoyalPermission([
    { permission: 'users.read', active: true, scope: 'all' },
  ], 'users.read', 'ok'), false);
});
