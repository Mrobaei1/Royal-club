/**
 * Dormant catalog of agent role templates.
 *
 * These are design-time templates only: importing this module does not create
 * identities, grant permissions, enqueue work, or start an agent runtime.
 */
export type AgentCapability = 'read' | 'recommend' | 'execute' | 'approve';
export type AgentApprovalMode = 'human_required' | 'human_for_sensitive' | 'read_only';

export interface AgentTemplate {
  readonly code: string;
  readonly title: string;
  readonly responsibility: string;
  readonly defaultCapabilities: readonly AgentCapability[];
  readonly approvalMode: AgentApprovalMode;
  readonly gameScoped: boolean;
}

const readOnly = ['read'] as const satisfies readonly AgentCapability[];
const readRecommend = ['read', 'recommend'] as const satisfies readonly AgentCapability[];

/** Role templates are extensible; game-specific instances are parameterized by gameCode. */
export const AGENT_TEMPLATES: readonly AgentTemplate[] = Object.freeze([
  { code: 'orchestrator', title: 'Central Orchestrator', responsibility: 'Coordinate bounded task plans and route work to approved specialist roles; never bypass their permissions.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'membership', title: 'Membership Operations', responsibility: 'Review registration, membership status, and suspicious account patterns using minimum necessary data.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'trust_safety', title: 'Trust and Safety', responsibility: 'Triage abuse, cheating, fraud, and security signals; preserve evidence and recommend proportionate action.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'game_operations', title: 'Game Specialist', responsibility: 'Review rules, game integrity, match quality, and game-specific incidents for one configured gameCode.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: true },
  { code: 'leagues', title: 'Leagues and Tournaments', responsibility: 'Prepare schedules, standings, registration reviews, disputes, and rule-version reports.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'wallet_audit', title: 'Wallet and Ledger Audit', responsibility: 'Reconcile ledger records and flag anomalies; no debit, refund, correction, or credit authority by default.', defaultCapabilities: readOnly, approvalMode: 'read_only', gameScoped: false },
  { code: 'deposit_review', title: 'Deposit Evidence Review', responsibility: 'Compare trusted provider evidence against claims and route uncertain or mismatched cases to a human.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'customer_support', title: 'Customer Support', responsibility: 'Classify and draft responses to support cases without exposing private data beyond case scope.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'growth_marketing', title: 'Growth and Marketing', responsibility: 'Analyze acquisition and retention and prepare campaign proposals; no spend or publication authority.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'content_communications', title: 'Content and Communications', responsibility: 'Prepare in-app announcements and content drafts; external delivery requires separate approval.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'analytics_reporting', title: 'Analytics and Reporting', responsibility: 'Produce privacy-minimized metrics, trend analysis, and auditable management reports.', defaultCapabilities: readOnly, approvalMode: 'read_only', gameScoped: false },
  { code: 'platform_operations', title: 'Platform Operations', responsibility: 'Inspect service health and redacted operational telemetry and recommend safe remediation.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'community_moderation', title: 'Community and Moderation', responsibility: 'Triage lobby and social reports within an explicitly scoped moderation workflow.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
  { code: 'advertising', title: 'Advertising Operations', responsibility: 'Prepare and analyze approved advertising plans; no spend, publish, or user contact authority.', defaultCapabilities: readRecommend, approvalMode: 'human_required', gameScoped: false },
]);

export function getAgentTemplate(code: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((template) => template.code === code);
}

/** Produces a stable game-scoped role code without creating an agent instance. */
export function gameAgentTemplateCode(gameCode: string): string | null {
  const normalized = gameCode.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(normalized)) return null;
  return `game_operations:${normalized}`;
}
