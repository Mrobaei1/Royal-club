# Royal Club — Agent team catalogue and extensible framework

**Status: dormant blueprint only.** This catalogue does not create user accounts or agent identities, issue credentials, grant permissions, schedule jobs, connect external providers, or start an agent runtime.

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
16. Community and moderation — triage reports; no permanent sanction by default.
17. Advertising operations — campaign analysis and drafts; no spend, publication or user contact.

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

## Delivery order in Phase 4

1. Maintain typed role templates and game-specialist factory with validation tests.
2. Reconcile templates with the existing owner-only task-definition/proposal control plane.
3. Design persistent agent identity, grant/revocation lifecycle, audit and admin review UI without seeding privileged identities.
4. Add read-only reporting adapters only after separate owner approval and staging validation.
5. Add other domain adapters one at a time with negative authorization, scope isolation, revocation, replay, concurrency and failure-closed tests.
6. Require explicit owner approval before creating identities, granting capabilities, enabling schedules, sending external messages or running production tasks.

## Existing implementation boundary

The API already contains a dormant owner-only task-definition/proposal workflow and delegated-permission tables. It intentionally has no agent execution endpoint. This PR extends the role catalogue only; it does not enable or deploy the runtime. No production deployment or migration, SMS activation, paid feature, APK build, scheduled task or production grant is part of this work.
