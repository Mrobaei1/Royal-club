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


### Migration fail-closed validation — 2026-11-04

The migration now verifies the expected data types, nullability, defaults, foreign keys and index definitions before COMMIT, and raises an exception rather than silently accepting a conflicting pre-existing object. The complete migration statement sequence, including this verification block and the case-folded username index, was re-applied in a single transaction on isolated branch `br-crimson-mouse-baq7v9aa`; all 13 statements completed successfully on the repeat run. Production remained unchanged.


## Final source-parity and deployment-provenance findings — 2026-11-04

### Source/catalog name parity

The repository's `schema-parity.ts` originally compared explicit index names only. The Production snapshot had a legacy case-sensitive `users_username_unique_idx`, while the source declaration requires `LOWER(username)`. The migration adds the equivalent case-folded index as `users_username_casefold_unique_idx`. The parity checker now reads `pg_get_indexdef`, normalizes that validated case-folded index to the source index name, and ignores only the known mismatched legacy definition. New unit tests cover both the legacy-alias case and an already-correct source index.

The source declaration parser and the same normalized catalog comparison were run against the isolated Neon repair branch:

| Catalog | Source | Isolated branch | Difference |
|---|---:|---:|---:|
| Public base tables | 35 | 35 | 0 |
| Public columns | 301 | 301 | 0 |
| Explicit indexes (after known legacy-index normalization) | 34 | 34 | 0 |

No missing or extra table, column, or explicit-index names remained. This is full **name-level** parity only; it does not replace complete source-wide semantic validation of all column definitions, defaults, nullability, FKs, checks, and index expressions.

### Production Function is behind source

Read-only Neon metadata still reports active Function deployment 81, created `2026-10-31T10:24:43Z`, with no bundled Git SHA in deployment metadata. GitHub history shows the source commit `b74c05ff68b9cd3334d07a2d084983b0b48ad7cc` (2026-10-31 11:24:28Z) added trigger authentication, successful cleanup logging, and deployment provenance; later API changes also followed. Thus active deployment 81 predates the provenance/trigger-hardening commit by about one hour and cannot be accepted as the current source. Function telemetry shows invocation begin/end pairs, but no application-level `Scheduled empty-room cleanup completed/failed` log records were found in the last seven days.

The existing manual-only `deploy-neon-function.yml` workflow already bundles the current Function, injects `ROYAL_CLUB_GIT_SHA`, runs the schema parity gate, verifies the health endpoint SHA, and performs registration/login/profile/friend/match smoke tests. The workflow is deliberately manual-only and Production deployment must remain owner-approved. This PR now also makes `ROYAL_CLUB_OWNER_USER_ID` mandatory and rejects missing/non-numeric owner identity before deployment; this prevents a release that silently omits the owner binding. The value itself was not read or exposed.

WBS 7.2 remains Blocked until the approved workflow deploys and the live health SHA matches the approved main commit. WBS 7.4 remains In progress until the same deployment proves the authenticated scheduled route and emits its outcome logs. WBS 6.2 remains Blocked until the owner confirms the numeric ID is the actual owner account. WBS 7.6 remains Blocked pending secure CORS/network/log-access acceptance.


## Superseding verification — 2026-11-04 23:31 local

This section supersedes any earlier statements in this ledger that said the latest exact-head CI was pending.

- PR #166 current observed head: `2273698e200e19887d3f41294a679eafebf77282`; PR state open, not merged.
- All four workflows completed successfully on this exact head: `Validate Royal Club` (API build/tests, API integration tests and Flutter analyze/tests), `Royal Club validation` (API build/tests and Flutter analyze/tests), `Backgammon engine audit`, and `Royal Club Web Preview` (build succeeded; deploy step correctly skipped for a PR preview).
- The manual Production deployment workflow was not run. It is workflow-dispatch only, restricted to `main` and the confirmed Production Neon project/branch. Its pre-deploy gates include API build/tests, read-only schema check, required explicit owner ID, function deployment readiness, health check with exact build SHA, and registration/profile/friend smoke tests.
- Neon Production trigger is confirmed enabled every minute and targets `royalclubapi` at `/internal/cleanup-expired-empty-rooms`. Active Function deployment remains #81 from 2026-10-31; no newer deployment was made. Thus trigger configuration and source CI are verified, but the deployed bundle does not yet contain the latest source changes, and production route outcome/provenance remains unverified.
- Isolated schema-repair branch currently reports 35 public tables and 301 columns, with the additive case-fold username index present. Production read-only verification still reports zero of the two target tables, zero of the three target columns and zero of the two target indexes; no Production schema change occurred.
- WBS 7.3 remains Blocked only on the remaining release/recovery gates: source-wide semantic catalog comparison (not merely name counts), app compatibility acceptance, backup/restore rehearsal, rollback/recovery evidence and explicit owner-approved Production migration. The isolated additive migration itself and repeat-run/fail-closed validation are complete.
- WBS 7.2 remains Blocked on owner-approved manual deployment and exact live SHA verification. WBS 6.2 remains Blocked on secure confirmation that the configured numeric owner ID identifies the GM account. WBS 7.6 remains Blocked on secure CORS/network/log-access acceptance. WBS 7.4 remains In progress pending a deployment-backed production route/outcome check.
- No WBS points are awarded by this evidence update. No Production migration, deployment, config/network change, secret retrieval, APK build or PR merge occurred.


## Backup inventory and restore rehearsal — 2026-11-04

Read-only Production backup inventory found one retained manual snapshot:
- Snapshot: `phase5-restore-acceptance-20261031`, created `2026-10-31T11:09:06Z`.
- Production branch snapshot schedule: empty (no scheduled snapshots configured).
- This does not satisfy the WBS 7.5 acceptance requirement for three recent recovery points or an approved recurring backup schedule.

A restore rehearsal was initiated from that snapshot. Neon finalized the restored branch immediately because the restore call used its default `finalize=true`; this temporarily made the restored snapshot branch the default branch named `production`. The original Production branch ID was preserved, and the branch/function inventory showed the API Function remained attached to that original branch. The branch names and default-branch pointer were then restored to the original Production branch ID (`br-misty-flower-bavs47dm`). Post-correction verification confirmed:
- Original branch ID is again named `production`, and is again the project's default/primary branch.
- Original API Function `royalclubapi` deployment 81 and the enabled one-minute cleanup trigger remain attached to the original Production branch.
- Original Production catalog remains 33 public tables / 289 columns.
- The restored snapshot branch is retained separately as `restore-rehearsal-2026-11-04`; it contains 33 tables / 289 columns from the 2026-10-31 snapshot.

No SQL writes, schema migrations, Function deployments, or data updates were performed during this rehearsal. The default-branch pointer was temporarily changed and then restored; this operational mistake is explicitly recorded. The rehearsal demonstrates that the retained snapshot can be restored into a branch, but it does not prove a complete application recovery, acceptable RPO/RTO, three-point retention, or a production cutover/rollback plan. Do not delete either branch without explicit owner approval.

WBS 7.5 remains Blocked pending a configured and owner-approved schedule with at least three recent recovery points, an end-to-end application restore validation, measured recovery time/data-point, and an approved runbook.


## Source-wide column type/nullability comparison — 2026-11-04

A read-only comparison was run between the 301 column declarations parsed from `apps/api/src/server.ts` on `main` and `information_schema.columns` on the repaired isolated Neon branch:
- Source declarations: 301 columns.
- Repaired isolated catalog: 301 columns.
- Missing/extra column names: 0 / 0.
- Data-type mismatches: 0.
- Nullability mismatches: 1.

The single discrepancy is `users.username`: source declares `username TEXT` without `NOT NULL`, while both the original Production branch and the repaired isolated branch report `is_nullable = NO`. Read-only counts on both branches show 0 NULL usernames and 0 empty usernames (3 users in each branch at audit time). The database's stronger NOT NULL constraint is preserved; it was not relaxed. This needs an explicit source/schema decision before semantic parity can be called complete. Do not infer that the other semantic dimensions are complete from this pass: defaults, generated/identity properties, all FK/check definitions and full index expressions still need independent comparison.

WBS 7.3 remains Blocked. The comparison closes the type/name portion for all 301 columns and isolates one nullability discrepancy; it does not close the remaining constraints/defaults/index and recovery/release gates.


## Cross-package exact-head CI sweep — 2026-11-06

The following open PR heads were rechecked against GitHub Actions. These are validation results only; they do not constitute merge or product acceptance.

| PR | Exact head | Result |
|---|---|---|
| #133 Hokm integration | `fd3d96bb7b66da1ba2372f0309bf0e6bbe5f55a8` | API build/unit tests, Flutter analyze/tests, API integration tests, backgammon audit and Web Preview build passed; preview deploy skipped |
| #166 schema/blocker closure | `8a28743c070836e421ec010098c2354700c96361` | All four repository validation workflows passed |
| #167 wallet localization | `6be7d5ac622faaeb51cdbe458e53290b7be06d1e` | All four repository validation workflows passed |
| #168 home welcome-card removal | `7897e7aa5eb22b1d0da15a1428f1246c0c0afdb0` | All four repository validation workflows passed |
| #169 owner subscription-plan creation | `aa5e974a55392c2234936f6cfe6510c05b51e479` | All four repository validation workflows passed |
| #170 WBS criteria/retention policy | `6a837daf4ec5b56cf4373921b8ff61573c76ebd9` | All four repository validation workflows passed |
| #86 standalone chess | `a4653feedd39f1be4edb2341d776d37da3fcbed3` | Root validation, API validation, Web Preview, isolated chess validation and backgammon audit passed |
| #110 Manch foundation | `89679ace53bb81adbe5dd7fc27a6f5d6d9c8aea0` | Root/API validation, Web Preview and backgammon audit passed |
| #137 Hokm mobile draft | `44ed6ba172627b9a690353a43e20f3e3192f593d` | Root/API validation, Web Preview and backgammon audit passed |
| #144 UNO home integration | `7d30c6a34d923df1023871aa1b5a508671b15fe1` | UNO standalone CI, root/API validation, Web Preview and backgammon audit passed |
| #148 subscription plans draft | `7d9c959e8550dd460d1d2589934d54b24f645175` | All four repository validation workflows passed |
| #114 owner analytics draft | `524f5d52c0360abef40971f8e913665b0ec8cfa5` | Root/API validation, Netlify/Web Preview and backgammon audit passed |
| #104 owner protection draft | `108fad95c5499c1841df728c07c37de8f1c24a2c` | Root/API validation, Web Preview and backgammon audit passed |
| #97 infrastructure-agent proposal | `48baea053cca531e6ba2448bf10c40099e8cdf8c` | Root/API validation, Web Preview and backgammon audit passed |

Two legacy branches are duplicates of newer mainline-targeted PRs: #147 is superseded by #167 (wallet localization), #146 by #168 (home-card removal), and #148 overlaps #169 (admin plan creation). PR #145 is non-mergeable against current main and contains stale evidence text; its docs should not be merged over the newer blocker/WBS audit. These remain open and untouched pending explicit owner direction.

CI gaps are still not acceptance evidence: no device fleet run, production release, live Hokm worker, owner security review, recurring backup retention, or disaster-recovery exercise is claimed here.

## Cross-package regression work — 2026-11-06

Additional isolated feature-branch work after the original blocker audit:
- PR #133 Hokm production integration: fixed the test fixture to reflect the actual first-to-seven-tricks rule (a 4–3 score is not a completed hand). The current PR head `fd3d96bb7b66da1ba2372f0309bf0e6bbe5f55a8` passed all four required workflows: API build/tests, API integration tests, Flutter analyze/tests, and Web Preview; Backgammon engine audit also passed.
- PR #148 owner-managed subscription plans: added API integration coverage for unauthenticated creation (401), non-owner creation (403), duplicate codes (409), malformed/fractional duration and unsafe numeric price (400). Exact code head `658bcfc5e30466efa0d7c1c5283c75353715a8fc` passed all four workflows, including API integration and Flutter validation.
- PR #146 home welcome-card removal: added an explicit English-locale widget test. Exact code head `ef6852ce3945ed8eca6c746ba216a605916a2f43` passed all four workflows.
- PR #147 monthly subscription localization: exact code head `a365e2e8ac4f058fcb3f1ab3f2b4cb5edab6de73` passed all four workflows.
- PR #110 Iranian Manch: fixed a malformed test-group closure discovered by Flutter analyzer. The corrected test file has balanced delimiters and latest CI is running; no pass is claimed until all workflows complete.

These are feature-branch changes only. No PR was merged, no production deployment or migration was performed, no APK was built, and no WBS score is awarded solely for CI success. PR #137 remains a separate older Hokm mobile draft and requires reconciliation with PR #133 before any integration. Chess PR #86 remains standalone by product decision.


## CI checkout integrity finding — 2026-11-06

- The failed PR #166 validation jobs checked out `refs/remotes/pull/166/merge` and reported that `apps/api/src/hokm-room.test.ts` imports `apps/api/src/hokm/room.js`, which was missing.
- Inspection of that merge ref showed its merge commit `11a72c3b29e5b61f2a2a9cd571fd59e7b531b761` was created as `Merge ce66e70525a8d21d474f929e0de656c5b07aa9d9 into 678608cc5b410ea7523f200f64eadbe910f46c07`. The base commit `678608c` is a Hokm test-only commit that adds `hokm-room.test.ts` without the matching `hokm/room.ts` implementation.
- That is not the current `main` tree: the current main SHA observed during this audit is `07af6b0c9e91143ac03b4d836e44926c77e6dc81`, and neither Hokm path exists there. The PR #166 metadata still identifies `main` as its base. The merge ref is therefore stale or inconsistent with the PR's declared base.
- The three failed jobs were rerun, but GitHub again checked out the same stale merge ref and reproduced the same module-resolution failure. This is not evidence that the additive schema migration itself failed. Refresh the PR merge ref against the declared current base and rerun the checks before evaluating the code.
- No test was skipped or weakened, no Production state changed, and no WBS points are awarded from this CI anomaly.


## Central service-origin configuration scope — 2026-11-06

- Main now contains merged PR #181, which adds owner-only versioned storage/history and rollback for the public game-service configuration. The current editable schema and admin UI expose only the UNO origin.
- The mobile `ApiTransport` still uses the build-time `API_BASE_URL`. Its source explicitly disables remote runtime origin changes until a signed-config protocol, pinned verification key, expiry/version checks and rollback policy are implemented and tested.
- The admin UI also explicitly states that cryptographic signing is not enabled. Version history and owner-only access therefore do not yet satisfy the requested signed central configuration.
- Remaining implementation scope: define an allow-listed schema covering the central API and each online game/service; sign canonical config payloads with a server-held asymmetric private key; pin the public verification key in clients; enforce signature, expiry, monotonic version and rollback rules before applying any new origin; retain a safe last-known-good origin; add negative tests for tampering, replay, expired payloads, downgrade and unapproved hosts.
- A signing private key must be provisioned through the approved secret-management path. No key was generated, stored in the repository, or configured during this audit. No production origin was changed. This remains an open infrastructure/security package; no WBS points are awarded.


## Cross-package continuation audit — 2026-11-06

### Live repository baseline and exact-head review

- Live `main` observed at `bc4adbca18131cb4a8a79d0410055a9c6d7c4cb0`.
- PR #189 (owner step-up for delegated report mutations) is one commit ahead of `main`, mergeable, and its preceding exact head `a8e7a0cc87e4ecedeb8854b130486f2f442fe61e` passed all four repository workflows. A follow-up test-only commit `2729a2f4d330ba028804e55896335b53b91d3eb7` now adds negative integration cases for an expired step-up token and a token bound to a different session. No workflow run or status check surfaced for that new exact head at audit time; these added cases are therefore **not yet validated**.
- PR #166 latest inspected head: `5e22baa1970c6f83e94fb1cb63849bdc8a528768`; it remains open and unmerged. Its four repository workflows passed on that exact head. This does not close the outstanding Production/recovery gates described above.
- The latest heads of PR #133 (`098b8720a14c29f05e5d867f51f2377629a0c691`) and PR #137 (`6a36c5383f1f32aa403d78879e136e6fa42951dd`) surfaced Netlify preview success but no GitHub Actions workflow runs or combined CI checks in the exact-head lookup. Earlier successful runs on older heads do not validate these new heads.

### Branch synchronization and duplicate-work findings

A compare against live `main` found these open feature branches behind the current base: Hokm API #133 (36 commits), Hokm mobile #137 (36), Manch #110 (14), chess #86 (49), UNO #144 (30), analytics #114 (39), owner-protection foundation #104 (39), infrastructure proposal #97 (40), and schema blocker closure #166 (15). Several branches are also substantially ahead, so they require a controlled rebase/reconciliation rather than a blind merge. The current GitHub connector exposes no branch-rebase operation; no ref was force-moved and no merge was attempted.

Duplicate/overlapping PRs remain open for owner review: #147 is superseded by #167 (wallet localization); #146 by #168 (home welcome-card removal); #148 overlaps #169 (owner subscription-plan creation). PR #145 contains stale evidence and is not suitable to merge over the current audit. No duplicate PR was closed or merged.

### Criterion-level progress snapshot

The live `docs/WBS-CRITERION-SCORING-MATRIX-2026-11-03.md` contains 200 five-point criteria. Exactly two are explicitly marked Passed (2.5-A Persian RTL and 2.5-B English LTR, each supported by owner-confirmed Android acceptance); 198 remain Pending. The evidence-backed score in that matrix is therefore 10 / 1,000 = **1%**. This is the recorded criterion score, not a claim that only 1% of code exists. CI passes, unmerged PRs, source-only implementation and unperformed manual/Production acceptance do not earn additional points.

### Remaining hard acceptance gates

- Reconcile and validate the stale/diverged game branches against current `main`; rerun exact-head CI after synchronization.
- Complete the source-wide semantic database catalog audit and application-compatibility test on the isolated repaired branch.
- Establish scheduled backup retention with at least three recovery points and complete an end-to-end application restore/rollback rehearsal with measured RPO/RTO.
- Obtain secure owner confirmation for the numeric owner anchor and owner review of security/network/CORS configuration.
- Obtain explicit owner authorization before Production migration/deployment; then verify deployed Git SHA and cleanup route outcome logs.
- Provision and test the dedicated Hokm worker, then perform four-device acceptance; complete real-device/two-account/network-change checks for all applicable games.
- Complete the standalone chess and card-game integration/acceptance boundaries without violating the requirement to keep chess isolated until explicitly accepted.
- Preserve the no-APK, no-live-calling, no-agent-execution and no-financial-outflow boundaries unless separately authorized.

No WBS points were added by this continuation audit. No Production database write, deployment, secret read/change, backup-schedule mutation, APK build, branch force-update, PR merge or PR closure was performed.


## Superseding security-PR validation — 2026-11-06

The new exact head of PR #189, `2729a2f4d330ba028804e55896335b53b91d3eb7`, completed validation after the earlier cross-package snapshot:
- API build/unit tests and API integration tests passed.
- Flutter analyze/tests passed.
- Backgammon engine audit passed.
- Web Preview build passed; deployment was correctly skipped for a pull request.
- The new expired-token and cross-session-token negative integration cases are included in that exact-head run.

PR #189 remains open/unmerged. PR #166's latest commit in this documentation branch changes documentation only; the preceding code-bearing head `5e22baa1970c6f83e94fb1cb63849bdc8a528768` retains its four successful validation workflows. No Production action or WBS score change follows from these checks.
