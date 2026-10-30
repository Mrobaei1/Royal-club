# Royal Club — Scalable Agent Infrastructure Blueprint

**Status:** Phase 4 implementation blueprint and dormant role catalog. This document and its code templates do not create agent identities, grant permissions, execute tasks, configure external providers, or enable schedules.

## Owner decision recorded

Build the reusable agent foundation during Phase 4. Do not limit the platform to a fixed count of agents. Future games (including Uno, Poker, and other additions) must be able to receive game-scoped specialist templates without changing the central orchestration architecture.

## Design principle: templates, instances, and runtime are separate

1. **Role template:** versioned description of a responsibility, allowed capability ceiling, data scope, approval mode, and required tools. Templates are inert.
2. **Agent instance:** an owner-provisioned identity referencing a template, with a unique revocable credential and explicit resource scope. No instances are provisioned by this blueprint.
3. **Task/run:** a bounded work request with validated input, idempotency key, deadline, retry policy, state, and audit trail.
4. **Runtime:** isolated worker that can only invoke registered tools through server-side authorization. Runtime remains disabled until separately approved.
5. **Approval:** human decision bound to the exact proposed action, parameters, target, and expiry. Approval cannot be reused for a materially changed action.

## Initial role template families

The TypeScript catalog in `apps/api/src/agent-catalog.ts` defines inert starting templates:
- Central orchestrator
- Membership operations
- Trust and safety
- Game specialist (parameterized by game code, not a fixed list of games)
- Leagues and tournaments
- Wallet and ledger audit
- Deposit evidence review
- Customer support
- Growth and marketing
- Content and communications
- Analytics and reporting
- Platform operations
- Community moderation
- Advertising operations

The catalog is a starting set of role families, not a cap. Multiple instances may later be provisioned from one template with separate scopes. A future game specialist can be configured for `backgammon`, `chess`, `uno`, `poker`, or another validated game code without adding a new hard-coded agent type. Game adapters must remain isolated from each other and from the core match engine.

## Required infrastructure layers

### A. Registry and lifecycle
- Versioned templates and schema validation.
- Instance lifecycle: proposed, approved, active, paused, revoked, retired.
- No identity becomes active merely by being inserted or named.
- Each instance has owner, template version, purpose, scope, credential reference, and expiry/rotation metadata.
- Revocation is enforced on the next protected request and cancels queued work.

### B. Authorization
- Server-side deny-by-default checks on every tool and resource.
- Separate read, recommend, execute, and approve capabilities.
- Scope by resource, game, tenant, and action; never rely on UI visibility.
- No authority from username, email, display name, or template membership alone.
- Wallet correction/debit/refund, role changes, moderation penalties, competition result overrides, advertising spend, outbound communications, production configuration, migrations, deployment, and destructive actions remain owner-only or require explicit per-action approval.
- No wildcard permissions.

### C. Orchestration and task execution
- Orchestrator plans and routes work but cannot elevate specialist permissions.
- Bounded task queue with payload schema, idempotency, deadlines, concurrency limits, rate limits, retry ceilings, dead-letter handling, cancellation, and per-agent quotas.
- Tool allowlist and isolated credentials per integration.
- Workers must be stateless where practical; durable state belongs in the database.
- Treat user content, messages, uploads, web pages, and tool results as untrusted data, never as instructions to override policy.

### D. Human approval and audit
- Approval is bound to action hash, exact parameters, target, requester, reviewer, and expiry.
- Sensitive actions fail closed if approval service is unavailable.
- Audit actor, agent instance, task/run, action, target, scope, outcome, timestamp, reason, approval reference, and correlation ID.
- Redact passwords, OTPs, access tokens, API keys, payment secrets, and unnecessary personal data.
- Provide owner-visible pause, revoke, queue cancellation, and global kill switch.

### E. Observability and operations
- Per-agent health, task latency, success/failure, retries, token/cost budget, queue depth, and tool-call metrics.
- Alert on unusual volume, permission denials, repeated failures, budget exhaustion, and cross-scope attempts.
- Backups and daily reports are separate scheduled capabilities; they remain off until recipients, timezone, retention, and approval are configured.
- No autonomous production changes.

## Game extensibility contract

A game specialist receives only a validated `gameCode` and the minimum game-specific read model. Each game integration implements a versioned adapter contract:
- inspect game rules and configuration;
- read permitted match/league state;
- produce recommendations and test scenarios;
- submit proposals for human review.

A game adapter cannot write match state, alter rankings, award credits, or change published rules unless a future separately reviewed capability explicitly permits that action. Poker and other games must also pass applicable legal, age, regional, and responsible-play reviews before product launch; this agent blueprint does not authorize those games.

## Phased implementation in this project

1. **Now — dormant foundation:** catalog/types, registry schema design, lifecycle and permission model, task state machine, audit schema, approval contract, kill-switch design, tests and admin UX specification. No worker runtime, no seeded identities, no credentials, no grants.
2. **After foundation tests:** implement owner-only management UI/API and migration behind feature flags; staging only after explicit approval.
3. **Per-domain rollout:** start with read-only analytics/operations, then recommendation-only workflows, then narrowly scoped reversible actions if separately approved.
4. **Production activation:** requires owner identity verification, permission matrix signoff, migration/deployment approval, security tests, staging acceptance, and a separate explicit launch decision.

## Acceptance criteria

- A new game can receive a specialist template by configuration, not central-code rewrite.
- Templates cannot create identities or permissions.
- No agent can call tools outside its explicit scope.
- Read-only roles cannot execute or approve.
- Approval cannot authorize changed parameters or be replayed.
- Revocation and kill switch prevent new and queued execution.
- Retries cannot duplicate financial or state-changing effects.
- Audit logs are complete and secret-free.
- Ordinary users cannot enumerate or impersonate agents.
- All runtime and schedule switches default to off.

## Explicitly not authorized by this work

No production migration/deployment, agent identity provisioning, credential creation, permission grants, runtime activation, external messaging, payment-provider configuration, automatic wallet credit, advertising spend, scheduled report, APK build, or merge to `main`.
