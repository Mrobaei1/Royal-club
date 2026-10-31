# Royal Club — Phase 1–4 readiness checklist

Phase 4 home-screen implementation has started on `main`. This checklist tracks remaining release gates across Phases 1–4. A green CI run proves only the checks that actually ran; it does not prove production deployment health or real-device behavior.

## Verified by repository code and automated tests

- [x] Password registration validation rejects passwords shorter than six characters.
- [x] Authentication uses account credentials and does not bind identity to client IP/VPN exit IP; registration/login rate-limit keys use the submitted email after body parsing.
- [x] Public profile, friend, chat, match-history, leaderboard, and spectator payload tests check that another user's full name is not exposed.
- [x] Wallet credits are stored server-side with a transaction ledger; subscription activation checks available balance and uses a database transaction.
- [x] Non-owner authorization is enforced server-side for owner-only wallet-credit operations.
- [x] Friend limit is enforced by API code at 100 accepted friends.
- [x] Private chat, image-message storage, message editing/deletion, notifications, invitations, live spectators, and finished-match spectator restrictions have integration coverage.
- [x] Backgammon engine audit and Flutter/API CI checks passed on PR head `b6be07b4ba85ca31b4114f39c04c8826a4f152fe`.
- [x] APK generation is gated to a manual workflow dispatch with explicit build approval; normal pushes do not create APKs.

## Remaining acceptance gates for Phases 1–3 and Phase 4 release

### Phase 1 — account, security, language

- [x] OTP security foundation and automated coverage: owner-only encrypted settings/audit, Iranian phone normalization, HMAC-peppered OTP digests, dev/test-only simulator, expiry/single-use/attempt/cooldown/global-and-phone daily limits, Kavenegar adapter, connection check, explicitly confirmed test-message action, and API integration tests. Latest API build/integration tests passed on PR head `c19c4ca07060b6b0a9acc873476b3592584b9c1f`.
- [x] Purpose-bound OTP registration/login/phone-linking API endpoints and gated mobile UI are implemented and covered by API integration tests in simulator mode; verified-phone uniqueness is enforced, and ordinary profile edits cannot bypass verification. Existing email/password authentication remains available. Production use is fail-closed until the owner explicitly approves activation and configures the real provider. No real test SMS has been sent.
- [ ] Review the production activation/migration plan, perform the owner-approved provider connection/test-message workflow if authorized, and manually verify new-account registration, phone login, and linking on Android. See `docs/SMS-AUTH-ADMIN-CONFIG.md`.
- [x] Persian/English source-level localization coverage: matching ARB resources, bilingual `appText` coverage, mapped service errors, localized friend notifications and wallet fallback text, plus automated locale-selection, notification-copy, and RTL/LTR directionality tests. Flutter analyze/tests passed on PR head `ea97530af955bccf6d3a8af9ae8597066c8dbb61`.
- [ ] Manual device acceptance remains: review Persian RTL and English LTR, overflow, dialogs, navigation and dynamic text on real Android screen sizes. Generated-ARB consolidation for remaining inline bilingual strings is maintainability work, not evidence of untranslated UI. No additional languages are in scope. See `docs/PHASE-1-LOCALIZATION-AUDIT.md`.
- [ ] Complete security closure. Negative tests for expired/malformed JWTs, non-owner access, missing owner configuration, secret redaction, OTP lifecycle and delegated permission controls are covered by the API test suite. Remaining: verify the actual deployed environment and database schema, review host/network controls, confirm owner configuration, and perform final production security acceptance. See `docs/PHASE-1-SECURITY-REVIEW.md`.
- [x] Dormant delegated-permission foundation: owner-only grant/revocation/audit endpoints, fail-closed scoped enforcement, global kill switch, and a 50-delegate ceiling; API integration tests passed on PR head `c19c4ca07060b6b0a9acc873476b3592584b9c1f`. No grants are seeded and sensitive owner-only endpoints are not delegable.
- [ ] Complete the approved manager/assistant/agent permission matrix and supported operational scopes. Do not create/activate identities or assign grants without the manager's explicit decision. The numeric root-owner setting has now been validated and is present in active Neon Function deployment 81 (`OWNER_USER_ID`); this does not itself grant any delegated permissions. See `docs/FUTURE-AGENT-TEAM-CHARTER.md`, `docs/FUTURE-AGENT-PERMISSION-MATRIX.md`, and issue #24.

### Phase 2 — wallet, subscriptions, ranking

- [x] CI integration test passed for wallet debit, insufficient balance, subscription activation, active-subscription lookup, and ledger consistency.
- [x] Integration test passed for denying a normal user permission to credit a wallet. Owner plan/credit controls still need broader end-to-end acceptance testing.
- [ ] Confirm the initial monetization policy end-to-end: games and social features remain free unless the owner explicitly enables charges. Verify subscription and league-entry behavior against the configured product policy.
- [x] Main contains owner-controlled league configuration, disabled-by-default leagues, free-by-default entry, transactional/idempotent subscription-day consumption, a separate entitlement ledger, and manager-facing league controls. No league is seeded or enabled automatically. Historical PR #32 was closed without merge after being superseded by the integrated `main` implementation; do not merge its stale branch. Manual manager-UI acceptance and owner approval before any paid/subscription-day activation remain open.
- [x] Add weekly-leaderboard integration regression coverage for unfinished matches and finished matches with no determinable winner; the documented score policy remains 3 points per completed win. See merged PR #31.
- [ ] Verify all agreed ranking examples and rating updates end-to-end; draw handling remains unverified because the current match result model does not clearly represent a draw.

### Phase 3 — game and social experience

- [x] Main uses the shared Royal backgammon board for online and offline play, with automated coverage for point hit targets, cumulative moves, legal bar entry, and engine rules.
- [x] Historical PRs #33, #34, #35, #37, #38, #39 and #40 were closed without merge as superseded. Their invitation/room lifecycle, server-authoritative XP, shared board, invitation actions, and match-ID validation are represented in current `main` and newer tests. Do not reopen or merge those stale branches.
- [x] Source implements 60-second invitation/empty-room expiry, server-authoritative move handling, invitation cancellation, match cancellation proposals, and both game/match resignation scopes.
- [x] PR #77 merged as [`facba046`](https://github.com/Mrobaei1/Royal-club/commit/facba0469d431f7b223e308879637a41959faf9a): invitation acceptance now checks the room's own expiry while holding its row lock, expired-room invites are rejected without assigning a guest, and the mobile invitation countdown uses the server-provided expiry timestamp. Regression coverage verifies the 410 response, unchanged room membership, rejected invite status, canonical accepted-room ID, and read-all account isolation. All four exact-head workflows passed. This is automated evidence only; two-device acceptance and scheduled idle cleanup remain open.
- [x] PR #78 merged as [`10e3921`](https://github.com/Mrobaei1/Royal-club/commit/10e3921ab958d071ed012615d3b220be459281a2): API integration coverage verifies the canonical opening board and empty bar/off state after match activation, and serializes concurrent guest joins so exactly one succeeds. Flutter widget coverage verifies all 24 opening-point hit targets. Exact-head API, Flutter, engine and Web Preview checks passed; live two-device visual/network acceptance remains open.
- [x] PR #58 added integration tests for game-scope and match-scope resignation, invalid scope, non-participant access, board/turn/dice reset, winner recording, and repeat-resignation rejection. The test exposed and fixed a PostgreSQL bigint/text CASE-expression bug in the game-resignation path.
- [ ] Complete full online-match acceptance on two independent accounts/devices: invite expiry, notification lifecycle, server-authoritative legal/cumulative moves, bar entry, surrender/cancel, reconnect, and host re-invitation.
- [x] **Temporary AI takeover for backgammon is merged into `main` via PR #67** (merge commit [`69f315b`](https://github.com/Mrobaei1/Royal-club/commit/69f315b2c2d38eba3c1e688ab48be77d17a2137c), 2026-10-31). The source includes server-authoritative presence/heartbeat handling, overdue-turn processing, and reconnect recovery. PRs #81–#82 subsequently fixed shared online/offline checker orientation and spacing; PRs #83–#84 consolidated Agent Center permission-scope clarity and owner-only audit history. All are merged into `main`; PR #84 exact-head API integration, API build/tests, Flutter analyze/tests, engine audit, and Web Preview workflows passed. Two-device manual acceptance and current-source Production deployment remain separate gates. Card and chess execution remain future integrations. See [PR #67](https://github.com/Mrobaei1/Royal-club/pull/67) and `docs/ONLINE-DISCONNECT-AI-TAKEOVER.md`.
- [x] Automated coverage verifies invitation expiry, notification lifecycle, and physical cleanup on request. A production Neon trigger now invokes the protected cleanup endpoint once per minute while the serverless function is idle; first-run/idle-runtime behavior still needs monitoring.
- [x] API regression tests cover username-only public payloads and no full-name/email exposure in friend search/list, match history, leaderboard, and spectator views.
- [ ] Finish a manual username-only audit across every screen/API, including empty or legacy profiles.
- [ ] Verify theme and language behavior on every screen, not only the screens covered by widget tests.
- [ ] Run a real VPN-on/VPN-off test using the same account.
- [ ] Complete accessibility, layout, and performance checks on Android devices of different screen sizes.

### Final release gate

- [x] API build/unit/integration tests, Flutter analyze/tests, and backgammon engine audit passed on PRs #55, #56, and #58.
- [x] PR #58 integration run passed all 14 API integration subtests, including the new resignation test. PR #58 also passed API build/unit tests, Flutter analyze/tests, and the backgammon engine audit.
- [x] Active Neon Function deployment 81 was created on 2026-10-31 at 10:24:43Z after the owner configuration was validated. Neon metadata confirms deployment 81 is completed/active and includes the `OWNER_USER_ID` environment variable. The deployment workflow reported successful build, tests, packaging, deployment, API health, registration/profile/friend-request smoke tests, and Web Preview rebuild. Neon does not expose the bundled Git SHA, so exact source provenance is not directly attested. Deployment 81 predates PR #84; the owner-only agent audit endpoint added by PR #84 is merged to `main` but has not yet been deployed to Production.
- [x] Production schema reconciled: all 33 table names in the live public schema exactly match the 33 CREATE TABLE declarations in current apps/api/src/server.ts (no missing or extra tables).
- [ ] Independently confirm the post-deployment production registration/login smoke-test result. The latest-main API build/unit/integration suite passed in [run 41177353219](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353219), but the available Actions connector did not expose the exact non-PR deployment-run record.
- [x] Configure the production Neon scheduled trigger for expired-room cleanup. It is enabled once per minute; verify its first invocation and idle-runtime cleanup behavior.
- [x] Complete owner-approved production root-owner configuration: `OWNER_USER_ID` was validated and is present in active Neon Function deployment 81. Keep SMS disabled unless the owner separately approves provider activation and supplies the 32-byte encryption key.
- [ ] Complete two-device manual acceptance of the merged PR #67 behavior; CI does not prove real network-loss or Android lifecycle behavior.
- [ ] Complete manual Android/device/network acceptance and owner sign-off.
- [x] The owner-approved ARM64 APK 1.1.14+16 build, API/database health preflight, and artifact upload all passed in [run 41177336792](https://github.com/Mrobaei1/Royal-club/actions/runs/41177336792); artifact [13033688384](https://github.com/Mrobaei1/Royal-club/actions/runs/41177336792/artifacts/13033688384) expires 2026-11-07. The APK workflow is back to manual-dispatch-only on main commit [4171bb7](https://github.com/Mrobaei1/Royal-club/commit/4171bb7933a13eedb0bfc52ed51f7fe3c3d8b8bc).

## Latest automated verification

**PR #55 — owner agent-review UI and README refresh** (merged):
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41018699905) — passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41018699999) — passed.
- [Backgammon engine audit](https://github.com/Mrobaei1/Royal-club/actions/runs/41018699973) — passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41018699929) — passed.

**PR #56 — PostgreSQL TLS alias normalization** (merged):
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41018953696) — API build/unit and integration tests passed; Flutter analyze/tests passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41018953748) — passed.
- [Backgammon engine audit](https://github.com/Mrobaei1/Royal-club/actions/runs/41018953676) — passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41018953727) — passed.

**PR #58 — resignation SQL fix and integration tests** (merged as `7758638214fcdee5346f37a529bd419bece2c0d2`):
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41019744686) — API build/unit/integration tests and Flutter analyze/tests passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41019744610) — passed.
- [Backgammon engine audit](https://github.com/Mrobaei1/Royal-club/actions/runs/41019744583) — passed.
- The API integration workflow reported 14/14 subtests passing, including the new resignation scenario.

**PR #67 — server-authoritative backgammon disconnect / temporary AI takeover** (merged as `69f315b2c2d38eba3c1e688ab48be77d17a2137c` on 2026-10-31):
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353219) — API build/unit/integration tests and Flutter analyze/tests passed on main SHA `4171bb7933a13eedb0bfc52ed51f7fe3c3d8b8bc`.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353226) — API build/tests and Flutter analyze/widget tests passed on the same main SHA.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353203) — API and Flutter checks, Web Preview build, and GitHub Pages deployment passed on the same main SHA.
- [Royal Club Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353201) — the currently deployed API/database health workflow passed; this does not deploy the merged source.
- Two-device manual acceptance and Production deployment remain open.

### Production API status — 2026-10-31 live audit

- Neon Function royalclubapi reports active deployment 81, status completed, runtime nodejs24, created at 2026-10-31T10:24:43Z. Invocation URL: https://br-misty-flower-bavs47dm-royalclubapi.compute.c-8.eu-central-1.aws.neon.tech/.
- Deployment 81 is the active Production function. It was created after the owner configuration workflow completed; Neon metadata confirms the `OWNER_USER_ID` variable is present. The function deployment predates PR #84, so the new `/api/v1/admin/agent-task-audit` endpoint in current `main` is not yet live. Neon does not expose the bundled source commit SHA, so exact source provenance is not directly attested.
- Deployment 81 environment metadata lists CORS_ORIGINS, DATABASE_URL, JWT_SECRET, NEON_FUNCTION_RUNTIME, NODE_ENV, and OWNER_USER_ID. `SMS_CREDENTIALS_ENCRYPTION_KEY` is absent, so real SMS/OTP remains disabled. Ordinary email/password authentication remains available.
- Production schema now matches current API source exactly: 33 source table declarations, 33 production tables, zero missing, zero extra. This supersedes the 2026-10-30 audit that reported 13 tables and 17 missing tables.
- The deployment-81 workflow reported successful API health and smoke checks. Current Neon metadata confirms the function remains active with deployment status `completed`.
- Read-only Neon log review for the earlier deployment window found the old pg-connection-string TLS-alias warning only before deployment 80 and no subsequent ERROR/WARN records in that reviewed window. Continue monitoring after deployment 81.
- The production Neon branch has an enabled once-per-minute scheduled trigger for `/internal/cleanup-expired-empty-rooms`. A fresh read-only review confirmed the trigger is enabled and Neon function logs contain repeated invocation begin/end entries at one-minute intervals. The log backend did not expose route-level success attributes, so actual deletion correctness under idle conditions remains unverified. The production project's database IP allowlist is empty; review it as part of security acceptance without changing it until hosting connectivity requirements are confirmed. Neon snapshot-schedule inspection returned an empty schedule; backup/restore is not accepted.
- The deployment workflow includes production smoke tests for six-character registration/login, profile editing, friends, and online-match behavior. The exact non-PR deployment-run result was not available through the current Actions run-list interface, so production registration/login is not independently marked verified here. API integration tests passed on main in run 41177353219.
- The one-time API push trigger used for the 2026-10-31 rollout was removed; the current API deployment workflow is manual-only again. The Android APK workflow is also manual-dispatch-only after commit 4171bb7.
- Owner-approved Android ARM64 APK 1.1.14+16 was built and uploaded successfully on main commit 23375ac. Run 41177336792 passed setup, dependency install, analyze, tests, production API/database preflight, APK build, and artifact upload. Artifact ID: 13033688384; it expires 2026-11-07.
- Latest-main CI passed: API build/unit/integration and Flutter checks in run 41177353219, additional API/Flutter validation in run 41177353226, and Web Preview build/deploy in run 41177353203.

## Current decision

**Royal Club has a verified live API deployment and successful web/APK builds, but it is not yet release-ready.** Neon reports active Function deployment 81; owner configuration is present, production health and database connectivity passed, and the live 33-table schema matches the previously audited API source. PRs #81–#84 are merged into `main`; PR #84's new API endpoint still needs a separately approved Production deployment. The existing owner-approved ARM64 APK 1.1.14+16 remains the latest built artifact; no new APK was built in this consolidation.

Server-authoritative backgammon disconnect/temporary-AI handling remains merged via PR #67. Backgammon geometry/spacing fixes (PRs #81–#82) and Agent Center permission-scope/audit-history changes (PRs #83–#84) are also merged. Production deployment 81 includes the validated owner setting; the once-per-minute empty-room cleanup trigger is enabled and invocation begin/end logs are visible, but route-level deletion success under idle conditions remains unverified. Neon snapshot schedule is empty and no successful restore test is evidenced. The new PR #84 API endpoint is not yet deployed. Remaining gates include two-device acceptance, manual RTL/LTR/theme checks, VPN testing, final security review, backup/restore setup and test, full schema/migration reconciliation, final owner sign-off, and approved deployment of the latest source. League entry's free-by-default and opt-in subscription-day policy is implemented and covered by API integration tests; manager UI acceptance and owner approval before any paid activation remain open.

Do not activate agent identities, delegated grants, agent/task schedules, paid features, or real SMS without the corresponding explicit owner approval. The once-per-minute expired-room cleanup trigger is an operational room-lifecycle task; it does not activate agent automation. Keep production API deployment and APK workflows manual-only.

## Checkpoint verification — 2026-10-30 (main HEAD `6ef1cbe2faeb21157dff58bedc2848b22f6db238`)

All workflows triggered for this exact main commit completed successfully:
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158741): Flutter analyze/tests and API build/tests passed.
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158762): Flutter analyze/tests, API build/unit/integration tests passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158729): build and deploy jobs passed.
- [Royal Club Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158752): currently deployed API/database health check passed; this does not establish that latest source is deployed.

The four workflow job sets were inspected; all jobs were completed successfully. The open-PR list was empty at this checkpoint. See [canonical project checkpoint and new-chat handoff](PROJECT-CHECKPOINT-2026-10-30.md) for merged PR summary, production audit snapshot, unresolved release gates, product decisions, and continuation protocol.


## Phase 5 operational follow-up — 2026-10-31

- Added [Phase 5 Production Operations Runbook](PHASE-5-PRODUCTION-OPERATIONS-RUNBOOK.md), covering deployment, database change safety, cleanup trigger acceptance, backup/restore, monitoring, security, and WBS exit criteria.
- Read-only Neon checks confirmed deployment 81 is active, the cleanup trigger is enabled every minute, and the function has repeated invocation begin/end log entries. These do not prove route-level cleanup correctness.
- Read-only Neon snapshot-schedule query returned an empty schedule. No snapshot schedule was changed and no restore was performed in this pass because provider snapshots do not implement the requested 23:59 Asia/Tehran time-limited email-backup workflow, and enabling provider retention has cost/operational implications that need a separate explicit configuration decision.
- Table-name parity remains 33/33; column, constraints, index, migration-sequence parity, and rollback/recovery tests are not yet evidenced.
- Read-only database diagnostics found no long-running queries and no held locks at the time of inspection. These are point-in-time checks, not continuous monitoring.
- **Phase 5 remains open.** Outstanding gates: approved deployment of current main (deployment 81 predates PR #84), source/deployment provenance, complete schema and migration audit, approved backup policy plus isolated restore test, route-level cleanup acceptance, security review of network allowlist, and device-based E2E acceptance. No Production mutation or APK build was performed.

## Phase 5 restore verification — 2026-10-31

- PR #87 was merged after all four exact-head validation workflows succeeded. Merge commit: `6ad1c3818eb713b7f19bfe197b3a690a1179c76f`.
- Created manual Neon snapshot `snap-spring-truth-ba9rbrg1` at `2026-10-31T11:09:06Z` from Production and restored it to isolated non-primary branch `phase5-restore-test-20261031` (`br-crimson-rice-baahb4f3`) without finalizing or replacing Production.
- Read-only catalog comparison on Production and the restored branch matched: 33 public tables, 289 columns, 405 PostgreSQL constraints, and 78 indexes. All 33 explicit source-declared index names were present in Production.
- Selected row counts matched on Production and the restored branch: 3 users, 4 backgammon matches, and 2 wallet accounts. This proves a point-in-time restore plus selected checks, not a full row-by-row checksum or full application E2E acceptance.
- On the isolated restore branch, a synthetic expired empty waiting room and related notification were inserted. The same cleanup CTE used by `cleanupExpiredEmptyRooms()` deleted exactly 1 expired room and 1 related notification. This verifies the SQL path only; trigger-to-route success remains unverified because Neon logs expose only generic invocation begin/end entries.
- Attempted to configure daily Neon snapshots with seven-day retention. The provider rejected the request with `backup schedule creation is not enabled for this project` (HTTP 404); no schedule was changed. The manual snapshot does not satisfy the recurring 23:59 Asia/Tehran time-limited email-link backup requirement.
- The restored branch is retained for additional validation; deleting it requires separate explicit confirmation. No Production replacement, schema mutation, IP allowlist change, SMS/agent activation, or APK build was performed.
- **Phase 5 remains open.** Remaining gates include recurring backup/email-link workflow, route-level cleanup acceptance, current-main approved deployment with provenance evidence, semantic schema/migration review, final network/security review, and device-based E2E acceptance.
- Neon project owner is on the Free plan; current provider documentation says scheduled snapshots are unavailable on Free and only one manual snapshot is permitted. The manual snapshot created for the restore test uses that available recovery point. No plan/billing change was made.
