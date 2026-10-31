/**
 * Owner-protection policy primitives.
 *
 * This module is intentionally not a general RBAC authorizer. Callers must
 * integrate it at every protected API/job/webhook enforcement point. A helper
 * that is not wired into those paths does not provide runtime protection.
 */
export type OwnerProtectedAction =
  | 'owner_identity_change'
  | 'owner_account_disable'
  | 'ownership_transfer'
  | 'owner_recovery_change'
  | 'owner_session_revocation'
  | 'security_policy_change'
  | 'permission_policy_change'
  | 'agent_permanent_offboard'
  | 'financial_refund'
  | 'financial_outflow'
  | 'production_deploy'
  | 'database_migration'
  | 'destructive_operation';

export interface OwnerApproval {
  readonly approvedBy: string;
  readonly requestedBy: string;
  readonly actionDigest: string;
  readonly target: string;
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
}

export interface OwnerProtectionRequest {
  readonly configuredOwnerId: string | null | undefined;
  readonly durableOwnerId: string | null | undefined;
  readonly actorId: string | null | undefined;
  readonly action: OwnerProtectedAction;
  readonly stepUpVerified: boolean;
  readonly actionDigest?: string;
  readonly target?: string;
  readonly nowMs: number;
  readonly approval?: OwnerApproval | null;
}

export type OwnerProtectionDecision =
  | { readonly allowed: true; readonly reason: 'owner_authorized' | 'owner_approval_verified' }
  | {
      readonly allowed: false;
      readonly reason:
        | 'owner_anchor_missing'
        | 'owner_anchor_invalid'
        | 'owner_anchor_mismatch'
        | 'actor_not_owner'
        | 'step_up_required'
        | 'owner_approval_required'
        | 'approval_mismatch'
        | 'approval_expired'
        | 'approval_consumed';
    };

const financialActions = new Set<OwnerProtectedAction>([
  'financial_refund',
  'financial_outflow',
]);

const approvalRequiredActions = new Set<OwnerProtectedAction>([
  ...financialActions,
  'agent_permanent_offboard',
]);

function normalizeNumericId(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? String(parsed) : null;
}

/**
 * Evaluates the immutable owner boundary only. Non-owner workflow authorization
 * must be handled by the separate hierarchical RBAC policy.
 */
export function authorizeOwnerProtectedAction(
  request: OwnerProtectionRequest,
): OwnerProtectionDecision {
  if (request.configuredOwnerId == null || request.durableOwnerId == null) {
    return { allowed: false, reason: 'owner_anchor_missing' };
  }

  const configuredOwnerId = normalizeNumericId(request.configuredOwnerId);
  const durableOwnerId = normalizeNumericId(request.durableOwnerId);
  if (!configuredOwnerId || !durableOwnerId) {
    return { allowed: false, reason: 'owner_anchor_invalid' };
  }
  if (configuredOwnerId !== durableOwnerId) {
    return { allowed: false, reason: 'owner_anchor_mismatch' };
  }

  const actorId = normalizeNumericId(request.actorId);
  if (!actorId || actorId !== configuredOwnerId) {
    return { allowed: false, reason: 'actor_not_owner' };
  }

  if (!request.stepUpVerified) {
    return { allowed: false, reason: 'step_up_required' };
  }

  if (!approvalRequiredActions.has(request.action)) {
    return { allowed: true, reason: 'owner_authorized' };
  }

  const approval = request.approval;
  if (!approval) return { allowed: false, reason: 'owner_approval_required' };
  if (approval.approvedBy !== configuredOwnerId ||
      !approval.requestedBy ||
      !request.actionDigest ||
      approval.actionDigest !== request.actionDigest ||
      !request.target ||
      approval.target !== request.target) {
    return { allowed: false, reason: 'approval_mismatch' };
  }
  if (!Number.isFinite(request.nowMs) ||
      !Number.isFinite(approval.expiresAtMs) ||
      approval.expiresAtMs <= request.nowMs) {
    return { allowed: false, reason: 'approval_expired' };
  }
  if (approval.consumedAtMs !== null) {
    return { allowed: false, reason: 'approval_consumed' };
  }

  return { allowed: true, reason: 'owner_approval_verified' };
}
