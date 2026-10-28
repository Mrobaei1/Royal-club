import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRoyalPermission, isRoyalPermission, permissionCatalog } from './permissions.js';

test('permission catalog is explicit and rejects unknown or privileged names', () => {
  assert.ok(permissionCatalog.includes('reports.read'));
  assert.equal(isRoyalPermission('reports.read'), true);
  assert.equal(isRoyalPermission('users.read'), false);
  assert.equal(isRoyalPermission('wallet.credit'), false);
  assert.equal(isRoyalPermission('admin.roles.manage'), false);
  assert.equal(isRoyalPermission(null), false);
});

test('authorization denies by default and ignores inactive grants', () => {
  assert.equal(hasRoyalPermission([], 'reports.read'), false);
  assert.equal(hasRoyalPermission([{ permission: 'reports.read', active: false }], 'reports.read'), false);
  assert.equal(hasRoyalPermission([{ permission: 'wallet.credit', active: true }], 'wallet.credit'), false);
});

test('unscoped grant permits the named capability and scoped grants require matching resource', () => {
  const grants = [
    { permission: 'reports.read', active: true },
    { permission: 'reports.manage', active: true, scope: { resourceIds: ['user-1'] } },
  ];
  assert.equal(hasRoyalPermission(grants, 'reports.read'), true);
  assert.equal(hasRoyalPermission(grants, 'reports.read', 'report-1'), true);
  assert.equal(hasRoyalPermission(grants, 'reports.manage', 'user-1'), true);
  assert.equal(hasRoyalPermission(grants, 'reports.manage', 'user-2'), false);
  assert.equal(hasRoyalPermission(grants, 'reports.manage'), false);
});

test('malformed scopes fail closed', () => {
  assert.equal(hasRoyalPermission([
    { permission: 'reports.read', active: true, scope: { resourceIds: ['ok', 7] } },
  ], 'reports.read', 'ok'), false);
  assert.equal(hasRoyalPermission([
    { permission: 'reports.read', active: true, scope: 'all' },
  ], 'reports.read', 'ok'), false);
});
