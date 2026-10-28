export const permissionCatalog = [
  'users.read',
  'users.moderate',
  'reports.read',
  'reports.manage',
  'notifications.send',
  'leagues.read',
  'leagues.manage',
  'marketing.read',
  'marketing.manage',
  'operations.read',
] as const;

export type RoyalPermission = (typeof permissionCatalog)[number];

export type PermissionGrant = {
  permission: string;
  active: boolean;
  scope?: unknown;
};

export function isRoyalPermission(value: unknown): value is RoyalPermission {
  return typeof value === 'string' &&
    (permissionCatalog as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fail-closed permission evaluation for future delegated work.
 * Scope must be absent (global grant) or an object whose resourceIds list
 * contains the requested resource. Unknown permissions and malformed scopes deny.
 */
export function hasRoyalPermission(
  grants: readonly PermissionGrant[],
  permission: string,
  resourceId?: string,
): boolean {
  if (!isRoyalPermission(permission)) return false;
  return grants.some((grant) => {
    if (!grant.active || grant.permission !== permission) return false;
    if (grant.scope === undefined || grant.scope === null) return resourceId === undefined;
    if (!isRecord(grant.scope)) return false;
    const resourceIds = grant.scope.resourceIds;
    if (!Array.isArray(resourceIds) ||
        !resourceIds.every((id) => typeof id === 'string')) return false;
    return resourceId !== undefined && resourceIds.includes(resourceId);
  });
}
