# Royal Club — Agent team catalogue and extensible framework

**Status: implementation in progress; runtime remains disabled.** Per the owner's 2026-11-11 decision, agent infrastructure and specialist workflows are to be implemented from the current development stage and then completed across the project. This authorizes engineering implementation only; it does not create live agent identities, issue credentials, grant runtime permissions, schedule jobs, connect production providers, or start an agent runtime.

## Architecture decision

The team is deliberately **open-ended**. The base team has specialist roles for current platform responsibilities and a parameterized game-specialist template for future titles. There is no hard cap of 12, 15, or any other number. A new game such as Uno, poker, or a later title can receive its own scoped specialist after that game is separately approved for development. Defining a template does not approve or release a game.

## Initial specialist role templates

The code catalogue includes these responsibilities:

1. Central orchestrator — coordinates plans and routes bounded proposals; cannot bypass another role's authorization.
2. Membership operations — signup, membership status, suspicious account signals.
3. Trust and safety — anti-cheat, abuse, fraud and security triage.
4. Backgammon specialist — rules, match integrity, disconnect recovery and quality.
5. Chess specialist — rules, match integrity, clocks and quality.
6. Card-games specialist — shared card-game rules and quality.
7. Future game specialist — one game-scoped profile generated from a validated game key.
8. Leagues and tournaments — registrations, schedules, standings and disputes.
9. Wallet and ledger audit — reconciliation and anomaly detection only.
10. Deposit evidence review — compare trusted provider evidence and route uncertain cases to a human.
11. Customer support — classify cases and draft replies within case scope.
12. Growth and marketing — acquisition and retention analysis; no spend or publication.
13. Content and communications — prepare in-app content; publication requires approval.
14. Analytics and reporting — privacy-minimized operational and product metrics.
15. Platform operations — health and redacted telemetry; no deploy or production changes.
16. Infrastructure & reliability — API/hosting/DNS/TLS health, incident diagnosis, safe recovery proposals and owner notifications; production changes remain owner-approved.
17. Community and moderation — triage reports; no permanent sanction by default.
18. Advertising operations — campaign analysis and drafts; no spend, publication or user contact.

The game-specialist template is instantiated by a stable game key (examples: `game_operations:uno`, `game_operations:poker`). These are identifiers/templates only, not live agents.

## Capability and approval model

- Default catalogue capabilities are read and recommend only.
- The type system can describe execute/approve as future capability vocabulary, but no template receives either by default.
- Every role requires human approval for actions; read-only roles remain read-only.
- Unknown permissions/capabilities must fail closed.
- A role template is not an identity and does not grant a user any authority.
- The orchestrator cannot elevate another agent or turn recommendations into execution.

## Mandatory security boundaries

- API-side authorization only; UI visibility is never a security boundary.
- No privilege by username, display name, email, or seeded database row.
- Wallet credit/debit/refund, subscription changes, role changes, moderation sanctions, competition-result overrides, external messages, ad spend, production configuration, deployment, migrations and destructive operations remain owner-only unless separately reviewed and explicitly authorized.
- Minimize personal data; public user identity remains username-only. No broad access to private messages.
- Every future grant must be scoped, attributable, revocable, audited, and time-bounded where practical.
- Kill switch, bounded task queue, rate limits, timeouts, safe retry/dead-letter handling and audit trail are prerequisites before runtime activation.
- No recurring schedules, daily email reports, SMS, external contact, or provider credentials are enabled by this catalogue.

## Delivery order — implementation starts immediately

1. Continue implementing typed specialist templates and game-specialist factory with validation tests.
2. Complete the owner-only task-definition/proposal lifecycle, including approve/reject/cancel decisions, audit history and clear dormant states.
3. Complete the Agent Center UX: role catalogue, task definitions, proposal review, monitoring/status views, search and responsive layouts.
4. Implement the persistent identity, scoped-grant and revocation model with deny-by-default enforcement, without activating identities or grants.
5. Implement the bounded task orchestration, cancellation, retry/dead-letter, kill-switch and redacted observability layers in a non-operational test harness.
6. Add read-only domain adapters and game specialists one at a time, with negative authorization, scope isolation, revocation, replay, concurrency and failure-closed tests.
7. Complete staging simulations, threat review, accessibility and multi-device acceptance. Keep all runtime entry points disabled until a separate explicit owner approval.
8. Require explicit owner approval before creating live identities, granting runtime capabilities, enabling schedules, sending external messages, connecting production providers, or running production tasks.

## Existing implementation boundary

The API already contains an owner-only task-definition/proposal workflow, role templates, delegated-permission tables, audit logging and fail-closed policy tests. The execution endpoint/runtime remains intentionally absent. The implementation programme now covers the complete control plane and a non-operational orchestration/test harness; no live agent execution is enabled by this decision. No production deployment or migration, SMS activation, paid feature, APK build, scheduled task or production grant is part of this work.

## Owner decision — 2026-11-11

- Agent implementation starts immediately and proceeds in parallel with the other Royal Club workstreams.
- Agent capabilities, control plane, Agent Center, scoped security, observability, simulation and test coverage are to be completed rather than deferred to a future project phase.
- **Runtime remains OFF** until the owner separately approves activation. The same separate approval remains required for live identities/grants, schedules, external communication, production providers, financial actions and production operations.
