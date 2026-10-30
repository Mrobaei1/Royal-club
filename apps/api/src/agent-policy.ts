import type { AgentCapability } from './agent-catalog.js';

export type AgentSensitiveAction =
  | 'wallet_credit' | 'wallet_debit' | 'wallet_refund' | 'wallet_correction'
  | 'role_change' | 'moderation_penalty' | 'competition_result_override'
  | 'advertising_spend' | 'external_message' | 'production_config'
  | 'database_migration' | 'deployment' | 'destructive_operation';

export interface AgentGrant {
  readonly active: boolean;
  readonly capabilities: readonly AgentCapability[];
  readonly gameCodes?: readonly string[];
  readonly resourceIds?: readonly string[];
}

export interface AgentAuthorizationRequest {
  readonly runtimeEnabled: boolean;
  readonly killSwitchEnabled: boolean;
  readonly grant: AgentGrant | null;
  readonly capability: AgentCapability;
  readonly resource?: { readonly gameCode?: string; readonly resourceId?: string };
  readonly sensitiveAction?: AgentSensitiveAction;
}

export type AgentAuthorizationDecision =
  | { readonly allowed: true; readonly reason: 'authorized' }
  | { readonly allowed: false; readonly reason: 'runtime_disabled' | 'kill_switch' | 'missing_grant' | 'inactive_grant' | 'capability_denied' | 'scope_denied' | 'owner_only_action' };

/** Fail-closed policy check. This is a guard primitive, not an execution runtime. */
export function authorizeAgentAction(request: AgentAuthorizationRequest): AgentAuthorizationDecision {
  if (!request.runtimeEnabled) return { allowed: false, reason: 'runtime_disabled' };
  if (request.killSwitchEnabled) return { allowed: false, reason: 'kill_switch' };
  if (!request.grant) return { allowed: false, reason: 'missing_grant' };
  if (!request.grant.active) return { allowed: false, reason: 'inactive_grant' };
  if (request.sensitiveAction) return { allowed: false, reason: 'owner_only_action' };
  if (!request.grant.capabilities.includes(request.capability)) return { allowed: false, reason: 'capability_denied' };

  const gameCode = request.resource?.gameCode;
  // If a grant is scoped, the request must identify a matching resource.
  // Omitting the resource must never widen a scoped grant into global access.
  if (request.grant.gameCodes !== undefined) {
    if (!gameCode || !request.grant.gameCodes.includes(gameCode)) {
      return { allowed: false, reason: 'scope_denied' };
    }
  } else if (gameCode) {
    return { allowed: false, reason: 'scope_denied' };
  }
  const resourceId = request.resource?.resourceId;
  if (request.grant.resourceIds !== undefined) {
    if (!resourceId || !request.grant.resourceIds.includes(resourceId)) {
      return { allowed: false, reason: 'scope_denied' };
    }
  } else if (resourceId) {
    return { allowed: false, reason: 'scope_denied' };
  }

  return { allowed: true, reason: 'authorized' };
}
