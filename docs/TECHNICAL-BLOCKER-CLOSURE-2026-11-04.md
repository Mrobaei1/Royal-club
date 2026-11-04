# Royal Club — Technical Blocker Closure Audit

Date: 2026-11-04
Repository baseline inspected: `main` at `bdae8ef5956fdcfa256c1b77f925d6f43c0f61b3`
Scope: read-only production verification and technical preparation. No production writes, migrations, deployment, secret reads, network-policy changes, or APK builds were performed.

## Executive result

This audit advances the technical investigation for WBS 6.2, 7.2, 7.3, 7.4 and 7.6. It does **not** mark any of those packages complete. Two findings are materially clearer:

- WBS 7.4: the Neon schedule trigger is enabled and is invoking the API Function once per minute. The current snapshot contains no expired empty waiting rooms, so the actual deletion effect cannot yet be proven from this observation.
- WBS 6.2: the active Function environment metadata includes the `OWNER_USER_ID` variable name. Its value was not retrieved; owner identity remains subject to secure verification and acceptance.

## Read-only evidence

### WBS 7.4 — expired-room cleanup

Production Neon project: `Royal-Club-API` (`crimson-moon-58282245`).
Production branch: `production` (`br-misty-flower-bavs47dm`).

Trigger inventory confirms:

- Trigger ID: `trigger-612bdbb2-b904-4aa3-b35a-4e6f4914822d`
- Name: `Royal Club expired empty-room cleanup`
- Function: `royalclubapi`
- Path: `/internal/cleanup-expired-empty-rooms`
- Schedule: `* * * * *`
- Enabled: `true`

Neon Function telemetry returned paired `invoke begin` / `invoke end` records for the Function at one-minute intervals, including 17:03–17:52 UTC on 2026-11-04. This confirms scheduled Function invocations, not that the cleanup endpoint deleted a row.

A read-only catalog/data query at the audit time returned:

- Expired empty waiting rooms: 0
- All empty waiting rooms: 0

Because there were no eligible rows, the snapshot cannot demonstrate successful deletion. Keep 7.4 in progress until a controlled, non-production test proves an expired room and its related notices are removed, and the production endpoint's safe execution outcome is observable without exposing user data.

### WBS 7.3 — source / production schema drift

The latest source-to-production comparison recorded in `docs/PHASE-1-SECURITY-REVIEW.md` found:

| Object | Source | Production | Missing |
|---|---:|---:|---:|
| Tables | 35 | 33 | 2 |
| Columns | 301 | 289 | 12 |
| Explicit indexes | 34 | 33 | 1 |

Missing tables:
- `account_customization_pricing`
- `auth_token_revocations`

Missing columns:
- `account_customization_pricing.id`
- `account_customization_pricing.avatar_change_price_credits`
- `account_customization_pricing.username_change_price_credits`
- `account_customization_pricing.updated_by`
- `account_customization_pricing.updated_at`
- `auth_token_revocations.jti`
- `auth_token_revocations.user_id`
- `auth_token_revocations.expires_at`
- `auth_token_revocations.created_at`
- `backgammon_matches.turn_started_at`
- `users.avatar_change_count`
- `users.token_version`

Missing explicit index: `auth_token_revocations_expiry_idx`.

The current `apps/api/src/server.ts` executes schema DDL and data updates during application startup. Therefore a routine Function deployment is not a safe substitute for a reviewed migration.

Required technical sequence before any production migration:
1. Define immutable, versioned migration files with checksums and a migration-history table.
2. Reconcile each missing object against the exact source declaration, including types, defaults, nullability, foreign keys, checks and index definition.
3. Make the migration idempotent where safe and fail closed on unexpected pre-existing definitions.
4. Test forward application, rerun behavior, rollback/recovery and application compatibility against an isolated Neon branch restored from production.
5. Verify a restorable backup/recovery point and record the recovery procedure.
6. Only after these steps, request explicit owner approval for the production change.

No migration SQL was applied to Production in this audit. The missing objects are recorded, not silently repaired.

### WBS 7.2 — deployed-source provenance

Existing read-only evidence identifies active Function deployment 81, but Neon deployment metadata does not expose a bundled Git commit SHA. Production health checks establish endpoint and database availability only; they do not prove which source revision is running.

Technical closure requires a deployment artifact provenance mechanism that records an immutable Git SHA/build ID in the deployed artifact and exposes it through a protected or non-sensitive diagnostic surface. The next approved deployment must then be matched against that SHA and smoke-tested. No deployment was performed.

### WBS 7.6 — production security configuration

Read-only project metadata reports an empty Neon allowed-IP list. This is not automatically a defect; the API/Function networking topology must first be assessed to avoid blocking legitimate serverless connections.

The active Function metadata lists `OWNER_USER_ID` and `CORS_ORIGINS` as configured variable names. Their values and all secret values were deliberately not read. SMS remains disabled per the existing security review.

Remaining work:
- document the expected public origins and verify them through the authorized secure workflow;
- review whether Neon IP restrictions are compatible with the actual Function egress model;
- confirm owner-ID binding through a secure owner-controlled check;
- verify external log access/retention and least privilege;
- preserve the no-production-mutation gate until the owner approves the reviewed release.

## WBS status adjustments recommended

- **6.2:** retain as blocked pending secure verification of the configured numeric owner identity and owner acceptance. Presence of the variable name alone is insufficient.
- **7.2:** retain as blocked pending immutable deployment provenance and owner-approved deployment/smoke test.
- **7.3:** retain as blocked pending a versioned migration, isolated-branch forward/rollback tests, and recovery evidence.
- **7.4:** change from blocked to **in progress**: the schedule and one-minute invocations are now verified; deletion-effect acceptance remains open.
- **7.6:** retain as blocked pending secure configuration review and owner-approved production acceptance.

## Safety boundary

No production SQL writes, DDL, data updates, migration, deployment, environment-variable change, secret retrieval, IP-policy change, SMS activation, paid activation, delegated grant, Agent activation, or APK build was performed. This document is an evidence update and technical execution plan, not production acceptance.


## Isolated schema-repair migration test — 2026-11-04

An isolated Neon validation branch was created from the Production branch snapshot; Production was not modified.

- Test branch: `schema-repair-validation-2026-11-04`
- Branch ID: `br-crimson-mouse-baq7v9aa`
- Parent: Production branch `br-misty-flower-bavs47dm`
- Migration artifact: `apps/api/migrations/20261104_001_reconcile_production_schema.sql`
- Migration source commit: `7dbc92e6148e0f8cac6adafee0b206e2dbb35162`

The migration was applied to the isolated branch using a transaction, then the same statements were run a second time to test repeatability. Results:

| Check | Result |
|---|---:|
| Missing tables present | 2 / 2 |
| Target missing columns present | 12 / 12 |
| Missing explicit index present | 1 / 1 |
| Default singleton pricing row | 1 |
| Legacy avatar backfill candidates remaining | 0 |
| Named non-negative user constraints | 2 validated |
| Second application | Passed without duplicate-object errors |

The test confirms the additive repair statements work against a fresh Production snapshot and are repeatable on that branch. It does **not** establish complete semantic parity for every table/column in the application, test a full application deployment against the repaired branch, prove backup restoration, or authorize production execution. The isolated Neon branch is retained as validation evidence and must not be mistaken for Production.

### Next acceptance steps for WBS 7.3

1. Compare full catalog definitions (types, defaults, nullability, foreign keys, checks and indexes), not just object names.
2. Run the API build and integration suite against the repaired isolated branch.
3. Test application rollback compatibility while retaining the additive schema.
4. Complete a separate backup/restore rehearsal and document recovery time/data-point evidence.
5. Request explicit owner approval before any Production migration or deployment.


### WBS 7.4 — isolated expired-room deletion test

On the same isolated Neon validation branch, a synthetic user, expired empty waiting room, and linked notification were inserted inside a transaction. The exact cleanup CTE used by `cleanupExpiredEmptyRooms()` was then executed.

Observed results:
- One expired empty room was deleted.
- Its linked notification was deleted.
- Follow-up query returned zero matching test rooms and zero matching test notifications.
- The synthetic user and test notification fixture were removed in the same validation transaction.

This proves the cleanup SQL's deletion behavior against the cloned schema. It does not prove the deployed Function route's authorization, scheduled trigger-to-route binding, or production deletion of an eligible room. WBS 7.4 therefore remains In progress.


A final catalog count on the repaired isolated branch now matches the source inventory exactly:

| Catalog | Source declarations | Repaired isolated branch |
|---|---:|---:|
| Public base tables | 35 | 35 |
| Public columns | 301 | 301 |
| Explicit (non-constraint-backed) indexes | 34 | 34 |

This is a count/name-level reconciliation for the previously identified drift, not a complete semantic definition comparison. Column types/defaults/nullability and all FK/check/index definitions still require the separate semantic review listed above.


## Semantic schema review and CI evidence — 2026-11-04

The repaired isolated branch was reviewed against the current source declarations for the audited objects. Column type, nullability and defaults were inspected for the two new tables and the three repaired existing-table columns; the expected foreign keys, primary keys, check constraints and expiry index were inspected in PostgreSQL catalogs. The definitions for the new tables and the added turn timestamp match the current source declarations.

The review found one additional pre-existing semantic drift: Production's legacy `users_username_unique_idx` is case-sensitive and excludes empty strings, while source requires uniqueness on `LOWER(username)` for non-null usernames. On the isolated Production clone, there were zero blank usernames and zero case-folded duplicate groups. The migration now adds an additive `users_username_casefold_unique_idx` on `LOWER(username)` with the source predicate, preserving the legacy index without destructive replacement. The index was applied and verified on the isolated branch. The migration and test both remain idempotent by using `IF NOT EXISTS`.

The exact PR head `107bda4c4d20bbad6448154770889684eaad886c` has the following successful GitHub Actions jobs on the prior commit immediately before this semantic-index hardening: API build/unit tests, API integration tests (including scheduled-cleanup route 403-without-trigger / 200-with-valid-trigger and deletion assertion), Flutter analyze/tests, and backgammon engine/AI/board regression. A fresh exact-head CI run is required after the latest index migration/test edits before this change is considered validated.

WBS 7.3 remains Blocked: targeted semantic definitions have been reviewed and the username uniqueness drift is addressed in the additive migration, but source-wide catalog parity, application compatibility against the repaired branch, backup/restore rehearsal, rollback/recovery evidence and owner-approved Production migration remain open. WBS 7.4 remains In progress: trigger configuration points to the route, route authentication and deletion behavior pass API integration tests, and the SQL CTE passed the isolated Neon test; however, the deployed Function bundle's commit provenance and production endpoint outcome remain unverified.
