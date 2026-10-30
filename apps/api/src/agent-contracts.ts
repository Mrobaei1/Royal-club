/**
 * Pure contracts for a future agent task runner.
 *
 * These helpers validate state transitions and approval binding only. They do
 * not enqueue, execute, persist, or authorize any task by themselves.
 */
export type AgentTaskStatus =
  | 'proposed'
  | 'awaiting_approval'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected';

const transitions: Readonly<Record<AgentTaskStatus, readonly AgentTaskStatus[]>> = {
  proposed: ['awaiting_approval', 'rejected', 'cancelled'],
  awaiting_approval: ['queued', 'rejected', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionAgentTask(
  current: AgentTaskStatus,
  next: AgentTaskStatus,
): boolean {
  return transitions[current].includes(next);
}

export interface AgentApprovalRecord {
  readonly actionDigest: string;
  readonly target: string;
  readonly approvedBy: string;
  readonly requestedBy: string;
  readonly expiresAtMs: number;
  readonly consumedAtMs: number | null;
}

export interface AgentApprovalRequest {
  readonly actionDigest: string;
  readonly target: string;
  readonly nowMs: number;
}

/**
 * An approval is valid only for the exact action digest and target, before its
 * expiry, once, and when reviewer and requester are distinct principals.
 * Callers must compute actionDigest from canonicalized action + parameters.
 */
export function matchesAgentApproval(
  approval: AgentApprovalRecord,
  request: AgentApprovalRequest,
): boolean {
  if (!approval.actionDigest || !request.actionDigest ||
      approval.actionDigest !== request.actionDigest) return false;
  if (!approval.target || approval.target !== request.target) return false;
  if (!approval.approvedBy || !approval.requestedBy ||
      approval.approvedBy === approval.requestedBy) return false;
  if (!Number.isFinite(approval.expiresAtMs) ||
      !Number.isFinite(request.nowMs) ||
      approval.expiresAtMs <= request.nowMs) return false;
  if (approval.consumedAtMs !== null) return false;
  return true;
}
