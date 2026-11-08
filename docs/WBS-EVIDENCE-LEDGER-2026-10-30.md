# Royal Club — WBS v1.1 Evidence Ledger (rolling audit)

- **Audit date:** 2026-11-08 (Phase 1 architecture/governance evidence refresh)
- **Governing baseline:** `docs/PROJECT-WBS-BASELINE.md`, WBS v1.1
- **Live main checked for this revision:** `d85960475299c2cb573d16a1c20b1be305025ed6`
- **Documentation follow-up:** PR #70 merged as `22dbff4caf81e3507da31e38bc2905cc964baf41` (WBS count correction and evidence ledger; no application code changed).
- **Online disconnect implementation:** PR #67 merged as `69f315b2c2d38eba3c1e688ab48be77d17a2137c`.
- **Notification/empty-bar fixes:** PR #75 merged as `227563f82c63ec5e9e4d4fa6c3e78e27cd059d26`.
- **Invitation lifecycle fix:** PR #77 merged into `main` as `facba0469d431f7b223e308879637a41959faf9a` after all four exact-head workflows passed on `a3f019f6b79a67a9a9a8ac535730fe7222b9d1bc`.
- **Online board and join-race regression coverage:** PR #78 merged as `10e3921ab958d071ed012615d3b220be459281a2`; exact-head API integration, Flutter tests, engine audit and Web Preview passed.
- **Post-merge main verification:** PR #78 merge head `10e3921` passed API build/integration, Flutter, engine and Web Preview in runs `41186639789`, `41186639847`, `41186639831` (and exact PR-head runs below). Current docs-only main head `7c7502` has Production API/database health passed in `41186861447`; its remaining CI workflows were in progress at this audit.
- **Leaf package count:** **53** (six + seven + ten + seven + seven + eight + eight)
- **Total baseline weight:** **1,000 points**; the package weights below sum to exactly 1,000.
- **Purpose:** rolling evidence inventory and status register. Criterion scoring is maintained in the WBS matrix; current score is a partial evidence-backed minimum.

## Important count correction

The roadmap previously said 47 packages. Counting the actual leaf IDs in the approved WBS tables gives **53**. This is a documentation/count correction only: no work package, scope, package weight, workstream weight or owner decision has been added, removed or changed. The WBS remains v1.0 and 1,000 points.

## Scope clarification — 2026-11-02 (WBS v1.1)

- PR #117, `release/promote-1.1.15-main`, is **closed and unmerged**. Its WebRTC calling and Cloudflare TURN implementation is not part of `main` and earns no WBS points.
- Live audio/video calls and video chat are explicitly excluded. No WebRTC calling stack, TURN service, TURN credentials, or related paid infrastructure is required or planned.
- Recorded voice messages are a future optional capability only. They remain OFF by default; current user-facing chat has no enabled microphone/send action. WBS 4.2 records this product boundary; WBS 6.1 and 6.3 include the dormant manager-only feature control/configuration and authorization requirements; WBS 7.6 requires any future provider credentials to remain server-side and redacted.
- This is a clarification and acceptance-criteria update inside existing packages. **The WBS remains 53 leaf packages and 1,000 points; no package weight is removed or transferred.**
- Because the approved WBS v1.0 inventory explicitly had no scored leaf-package fractions, the scope clarification does not create a new numeric project percentage. The official score remains **pending**, not 0%, and prior informal percentages are not accepted as an audited score.

## Scoring discipline

- Status and earned points are separate. A source implementation or green CI does not complete a package whose manual, production or owner-approval criteria remain open.
- **No points are awarded in this initial inventory yet.** In-progress packages must first have their acceptance criteria split into explicit, evidence-backed sub-criteria and sub-weights under WBS §4. This prevents subjective partial credit and duplicate counting.
- Accordingly, **the official aggregate percentage remains pending baseline scoring**. This is not a claim that the project is 0% complete.
- A PR is evidence of work in progress until merged. PR #67 and PR #77 are merged, but their respective two-device/field acceptance gates remain open. Merges and green CI alone do not award completion points.
- Production deployment, schema mutation, real SMS, paid activation, agent execution/schedules and APK generation remain separately approval-gated.

## Status summary

- In progress: 40 packages
- Blocked: 9 packages
- Not started: 3 packages
- Blocked — approval gated: 1 package
- Total: 53 packages / 1000 points.

## Package-by-package evidence register

| WBS | Weight | Status | Current evidence | Remaining acceptance / next action |
|---|---:|---|---|---|
| 1.1 | 15 | In progress | Owner-approved WBS v1.1; docs/ARCHITECTURE-AND-NFRS.md; docs/REQUIREMENTS-TRACEABILITY.md. Criteria 1.1-A and 1.1-C passed. | 1.1-B remains open: obtain owner-approved measurable performance, security, cost and extensibility targets. |
| 1.2 | 15 | In progress | Static source review of apps/mobile, apps/api/package.json and apps/api/src/server.ts; docs/ARCHITECTURE-AND-NFRS.md. Criterion 1.2-A passed. | Verify portability on a second provider/isolated deployment; complete current-head negative tests for authoritative game/economy boundaries (1.2-B/C). |
| 1.3 | 15 | In progress | WBS §6; project checkpoint §7 | Verify privacy/free-by-default/VPN rules across all public and account surfaces. |
| 1.4 | 15 | In progress | WBS v1.1; docs/PROJECT-GOVERNANCE.md; docs/REQUIREMENTS-TRACEABILITY.md; updated matrix and this rolling ledger. Criteria 1.4-A/B/C passed. | Continue refreshing evidence after each milestone; do not create a scheduled background job. |
| 1.5 | 10 | In progress | docs/DATA-LIFECYCLE-AND-RECOVERY.md; docs/TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md. | Obtain owner approval for retention/deletion and RPO/RTO; implement approved backup cadence and complete application-level restore/rollback drills (1.5-A/B remain Pending). |
| 1.6 | 10 | In progress | docs/EXECUTION-ROADMAP-v1.md; docs/PHASE-DEPENDENCY-MAP.md; README.md. Criteria 1.6-A/B passed. | Re-review dependencies after game/API contract changes; retain chess/card scope while backgammon remains priority. |
| 2.1 | 20 | In progress | docs/PHASE-1-3-READINESS.md §Phase 1; API auth tests | Verify full session lifecycle, recovery and end-to-end flows. |
| 2.2 | 20 | In progress | docs/PHASE-1-3-READINESS.md §OTP; docs/SMS-AUTH-ADMIN-CONFIG.md | Real provider activation and Android registration/login/linking acceptance remain gated. |
| 2.3 | 20 | In progress | apps/api/src/server.ts self-account/auth routes; apps/api/test/server.integration.test.ts privacy assertions | Complete manual audit of every public surface and legacy/empty profiles. |
| 2.4 | 20 | In progress | docs/PHASE-1-LOCALIZATION-AUDIT.md; readiness localization checklist | Re-run exact-head Flutter tests and close any remaining dynamic/navigation gaps. |
| 2.5 | 20 | In progress | Owner-confirmed Persian RTL and English LTR on 2026-11-04; readiness checklist | Remaining dialog/form, overflow, navigation, dynamic-text/directional UI and supported Android-size acceptance. |
| 2.6 | 15 | In progress | PR #151 merged; docs/PHASE-1-SECURITY-REVIEW.md; read-only Neon deployment 81 and API/database health evidence | Source-level auth/CORS/rate-limit/RBAC/log-redaction tests are evidenced; exact CORS/owner values, network policy, deployed-source provenance and owner-approved production acceptance remain open. |
| 2.7 | 15 | In progress | PR #155 merged; API integration tests; readiness checklist | Same JWT now verified across /me, /friends and active-match state after changed client IP; manual Android VPN OFF/ON/OFF acceptance remains open. |
| 3.1 | 45 | In progress | apps/api/src/backgammon-rules.ts; backgammon engine audit CI | Complete edge-case audit and acceptance for legal sequences, dice, hits, bar, bear-off and turn transitions. |
| 3.2 | 35 | In progress | Shared `RoyalBackgammonBoard`; PR #78 merged as `10e3921`; Flutter widget test verifies all 24 unique opening-position hit targets | Complete visual orientation, color/piece-size, responsive, theme and real-device acceptance. |
| 3.3 | 25 | In progress | PR #77/#78 merged; PR #159 merged as `c8d2e52` deduplicates cleanup paths; Neon trigger `trigger-612bdbb2-b904-4aa3-b35a-4e6f4914822d` is enabled on `* * * * *`; read-only verification 2026-11-04 confirms one-minute schedule | Automated tests cover expiry, invite rejection, scheduled endpoint authentication and physical deletion. Trigger configuration and invocation begin/end logs are verified; route-level deletion success during idle execution and two-device lifecycle acceptance remain open. |
| 3.4 | 25 | In progress | PR #78 merged as `10e3921` verifies the active match state returns the canonical 24-point opening board with empty bar/off; move/state routes remain server-authoritative | Complete two-device acceptance of authoritative state, cumulative moves, reconnect and live synchronization. |
| 3.5 | 25 | In progress | PR #67 merged as `69f315b`; main `4171bb7`; server-authoritative heartbeat/presence and temporary-AI implementation; main CI passed | Complete two-device disconnect/grace/AI/reconnect/handback acceptance; do not mark field-accepted on CI alone. |
| 3.6 | 15 | In progress | PR #58; apps/api/src/server.ts resignation route; integration tests | Verify UI confirmation/cancel, match-vs-game scope and duplicate behavior on devices. |
| 3.7 | 15 | In progress | Offline backgammon screen and engine tests | Verify offline restart/AI/local two-player and isolation from online/ranking state. |
| 3.8 | 20 | In progress | Main navigation/game entry screens; WBS §6 | Verify chess and card-game entry points and complete their agreed MVP flows. |
| 3.9 | 10 | Not started | WBS §6 product scope | Document and test extension boundaries for Uno/Mafia without implementing unapproved game features. |
| 3.10 | 15 | Blocked | PR #67 two-device gate; readiness checklist | Complete full game acceptance on two independent accounts/devices and supported Android sizes. |
| 4.1 | 20 | In progress | apps/api friend routes; readiness friend-limit checklist | Complete username-based lifecycle and API limit verification including boundary/race cases. |
| 4.2 | 25 | In progress | API chat/image-message integration tests; readiness checklist | Verify full emoji set, approved audience, delivery behavior and mobile UX. |
| 4.3 | 15 | In progress | PR #75 merged: valid read-all request body and DELETE /api/v1/notifications; API clear-all cross-account test; PR #77 merged with read-all account-isolation integration test | Complete manual notification UX acceptance on Android, including read-all and clear-all. |
| 4.4 | 15 | In progress | apps/api/test/server.integration.test.ts spectator scenarios | Complete host-permission and friend/follower device acceptance; retain no-replay rule. |
| 4.5 | 15 | In progress | apps/api/test/server.integration.test.ts public payload assertions | Static API scan found fullName only in own-account registration/auth/profile responses; public endpoints use usernames and have regression assertions. Complete manual UI and legacy/empty-profile audit. |
| 4.6 | 15 | In progress | Account/profile screens; readiness privacy checklist | Verify avatar/username edit pricing and private account-detail visibility. |
| 4.7 | 15 | Blocked | Execution roadmap P2; manual UX gate | Accept social UX in Persian/English, light/dark themes and real Android layouts. |
| 5.1 | 25 | In progress | Wallet ledger source and API integration tests; readiness checklist | Complete concurrency, idempotency, audit and owner-adjustment verification. |
| 5.2 | 20 | In progress | Subscription transaction source/tests; readiness checklist | Verify expiry, entitlements and manager-controlled prices end-to-end; keep paid activation disabled. |
| 5.3 | 25 | In progress | Progression/leaderboard source and tests; readiness checklist | Verify XP/levels and Elo examples, ties, draws, retries and bounded growth. |
| 5.4 | 35 | In progress | League source; WBS owner decisions; execution roadmap P3 | Complete fixtures, byes, appeals, incidents, audit history and manager acceptance. |
| 5.5 | 15 | In progress | League entitlement ledger source; readiness checklist | Verify subscription-day consumption exactly once and no direct wallet debit. |
| 5.6 | 10 | In progress | WBS §6; free-by-default policy; readiness checklist | Test owner/manager controls while ensuring paid behavior remains disabled absent approval. |
| 5.7 | 10 | Blocked | Execution roadmap P3 | Manual Persian/English manager UI acceptance before any activation. |
| 6.1 | 20 | In progress | Admin UI source; readiness checklist | Complete mobile/desktop usability and non-admin negative-access acceptance. |
| 6.2 | 20 | Blocked | Active Function metadata lists `OWNER_USER_ID`; its value was not retrieved. | Verify the numeric owner binding through the authorized secure path and obtain owner acceptance; never infer or expose the value. |
| 6.3 | 25 | In progress | Delegated-permission source/tests; readiness checklist | Review full permission matrix/scopes/revocation and 50-assistant ceiling; do not seed grants. |
| 6.4 | 20 | In progress | PR #55 merged; agent task proposal source/docs | Complete capabilities/approval/state/audit model while execution stays dormant. |
| 6.5 | 20 | In progress | Permission/agent audit and kill-switch source/tests | Verify kill-switch, cancellation, revocation and secret-redaction controls end-to-end. |
| 6.6 | 15 | Not started | WBS §6 scope only; no complete evidence identified in this audit | Implement and verify Agent Center categories/monitoring UX without activating external actions. |
| 6.7 | 10 | Not started | No provider-validated deposit/payment adapter evidence identified | Only proceed after separate provider/security design and owner approval. |
| 6.8 | 10 | Blocked | WBS approval gate; no manual owner acceptance evidence | Complete owner-facing acceptance; do not activate identities, grants, schedules or financial actions. |
| 7.1 | 25 | In progress | Main `10e3921`: runs 41186639789, 41186639847, 41186639831 and Production health 41186639790 all passed. Current docs-only main `7c7502`: Production health 41186861447 passed; remaining workflows were pending/in progress at audit time. PR #78 head `96fa920`: runs 41186501237, 41186501241, 41186501258, 41186501259 all passed; PR #78 merged as `10e3921` | Continue requiring exact-head API build/unit/integration, Flutter analyze/tests, engine audit and Web Preview checks for every implementation PR. |
| 7.2 | 20 | Blocked | Active Function deployment metadata still does not expose a bundled Git SHA; health checks prove availability only. | Add immutable build/commit provenance and complete owner-approved deployment plus registration/login smoke tests. |
| 7.3 | 25 | Blocked | Read-only source/catalog comparison: 35 source tables vs 33 Production; 2 tables, 12 columns and 1 explicit index missing. Additive migration artifact is tested on isolated Neon branch `schema-repair-validation-2026-11-04`; full semantic parity, app integration, backup/restore and rollback remain open. | Complete full catalog-definition comparison, API integration on the repaired branch, recovery rehearsal and owner-approved production migration; no Production mutation without approval. |
| 7.4 | 15 | In progress | Neon trigger `trigger-612bdbb2-b904-4aa3-b35a-4e6f4914822d` is enabled on `* * * * *`; Function invoke begin/end logs are present once per minute. Exact cleanup CTE deleted one synthetic expired room and its linked notification on isolated Neon validation branch `schema-repair-validation-2026-11-04`; follow-up counts were zero. | Verify deployed trigger-to-route authorization/binding and safe production outcome observability; production snapshot had no eligible expired rooms. |
| 7.5 | 20 | Not started | WBS §6 and execution roadmap P5; no tested backup/restore evidence identified | Complete monitoring/runbooks and owner-approved latest-three backup/restore test. |
| 7.6 | 20 | Blocked | Read-only metadata lists `OWNER_USER_ID` and `CORS_ORIGINS`; values were not read. Neon allowed-IP list is empty; architecture compatibility is not yet assessed. SMS remains disabled. | Complete secure CORS/owner-value review, network-policy decision, external log-access review and owner-approved production security acceptance. |
| 7.7 | 20 | Blocked | Two-device and real Android acceptance gates remain open | Complete end-to-end network, layout, accessibility, performance and regression acceptance. |
| 7.8 | 15 | Blocked — approval gated | Owner instruction required; no APK authorization in current task | Prepare release notes/rollback readiness only; do not build or prepare APK until explicit approval. |## Static source audit findings — 2026-10-30

- **Public identity:** a scan of current-main `apps/api/src/server.ts` found `fullName` in registration/phone-registration responses and the authenticated `/api/v1/me/profile` response, all for the account owner. Public friend, chat, leaderboard, match-history and spectator handlers use usernames; API integration tests assert that full names/emails are absent from the relevant payloads. This is source-level evidence only; the manual screen-by-screen and legacy/empty-profile audit remains open.
- **Clear-all notifications:** the mobile notifications screen has a confirmed delete-all action, `NotificationsService.deleteAll()` calls `DELETE /api/v1/notifications`, and the API deletes only rows for the authenticated `user_id`. The integration test verifies that clearing one account's notifications leaves the other account's notifications intact. Device UX acceptance remains open.
- **Read-all notifications:** the API updates unread rows only for the authenticated `user_id`; PR #77 merged the integration regression proving another account's unread rows remain untouched. The test passed in the API integration workflow on PR #77 head `a3f019f`.
- **Invitation popup expiry:** the lobby derives its countdown and auto-dismiss duration from the server-provided `expiresAt`, rather than starting a fresh 60-second client timer when a delayed invitation is displayed. This is merged in PR #77.
- **Online board source:** the online match screen fetches the authenticated `/matches/:id/state` snapshot; its local batch-move view is explicitly marked as a preview and is not submitted until confirmation. PR #78 now verifies the canonical opening state, empty bar/off and all 24 unique point hit targets. The reported visual symptom still requires real-device reproduction, so no speculative rendering change is made.

## Critical current blockers

1. **PR #67 / disconnect takeover:** merged into main as `69f315b`; automated checks passed, but the two-device acceptance gate is still open. Do not mark the takeover field-accepted until both accounts/devices verify grace period, exactly one AI turn, reconnect hand-back and concurrent polling.
2. **PR #77 / invite lifecycle:** merged into main as `facba046`; fixes stale-room invitation acceptance, server-aligned popup expiry, and adds read-all account-isolation and accepted-room-ID regression tests. All four exact-head workflows passed. The added regression tests do not replace two-device acceptance.
3. **PR #78 / board and room concurrency:** merged as `10e3921`; automated tests verify canonical initial board state, all 24 mobile point hit targets, and exactly one winner in concurrent guest joins. This still does not replace live two-device visual and network acceptance.
4. **Online board:** main's mobile screen obtains the match state from the authenticated `/matches/:id/state` endpoint and labels it server state. The rendering path also supports a local, explicitly unsubmitted batch-move preview. The user's reported incorrect-board symptom still requires real-device reproduction; no source change is justified from static inspection alone.
5. **Room/invite expiry:** source creates empty rooms with a 60-second expiry and invite cards are checked against a 60-second age. The API cleanup endpoint exists and is called by room/invite polling, but there is no configured Neon scheduled trigger in the latest production audit; serverless idle cleanup is therefore not proven.
6. **Production:** Neon reports active Function deployment 80 and 33 public tables; read-only comparison found all 33 current source table declarations present with no extra/missing table names. The exact deployed Git SHA is not exposed. No scheduled Neon trigger is configured; owner/SMS configuration and registration/login smoke acceptance remain separate gates. Latest post-merge production health workflow `41186861447` passed. No Production mutation or deployment was performed.
7. **Manual acceptance:** two-device match behavior, RTL/LTR, theme consistency, VPN continuity and Android layout/accessibility/performance remain open.

## Evidence sources

- [Approved WBS v1.0](PROJECT-WBS-BASELINE.md)
- [Execution roadmap v1.0](EXECUTION-ROADMAP-v1.md)
- [Phase readiness checklist](PHASE-1-3-READINESS.md)
- [Project checkpoint](PROJECT-CHECKPOINT-2026-10-30.md)
- [PR #67 — disconnect/temporary AI takeover](https://github.com/Mrobaei1/Royal-club/pull/67)
- [PR #58 — resignation SQL fix and tests](https://github.com/Mrobaei1/Royal-club/pull/58)

## Audit change log

| Date | Change | Scope / weight impact |
|---|---|---|
| 2026-10-30 | Initial 53-package evidence inventory; corrected roadmap count from 47 to 53. | None; WBS v1.0 scope and all weights unchanged. |
| 2026-10-30 | Recorded PR #70 merge (`22dbff4`) and its four successful exact-head workflows. | Documentation/evidence only; no earned WBS points assigned by merge or CI alone. |
| 2026-10-30 | Recorded PR #67 synchronization with current main (`18986e5`) and four successful exact-head workflows; two-device acceptance remains pending. | Historical record; later superseded by PR #67 merge. |
| 2026-10-31 | Recorded PR #67 merge (`69f315b`), PR #75 merge (`227563f`), Neon deployment 80, and read-only 33-table reconciliation. | Evidence/status refresh only; no partial points awarded. |
| 2026-10-31 | Added PR #77 stale-room invitation regression, notification read-all isolation test, accepted-room-ID assertion and server-aligned invitation popup expiry; merged as `facba046`. | Implementation evidence recorded; two-device acceptance remains open, so no completion points are awarded for the full acceptance packages. |
| 2026-10-31 | Added PR #78 API initial-board, concurrent-join and Flutter 24-point hit-target regression tests; merged as `10e3921`. | Test evidence only; real-device acceptance remains open and no full package completion points awarded. |
| 2026-10-31 | PR #79 refreshed the WBS evidence ledger and readiness checklist; merged as `7c7502d`. | Documentation only; no WBS points or aggregate percentage awarded. |


## Post-v1.1 merge evidence refresh — 2026-11-02

### Authoritative refs and scope state

- WBS v1.1 was merged into `main` by PR #118. Merge commit: [`2d79a53015632fe3b8707a1b17992a33757dcbca`](https://github.com/Mrobaei1/Royal-club/commit/2d79a53015632fe3b8707a1b17992a33757dcbca).
- The merge is documentation-only. The application-source baseline remains [`3a7d68354f628b43c0080b4ea5bebc6d241ea325`](https://github.com/Mrobaei1/Royal-club/commit/3a7d68354f628b43c0080b4ea5bebc6d241ea325); no application code, database, production configuration, deployment, TURN/WebRTC service, or APK was changed by PR #118.
- The WBS remains 53 leaf packages and 1,000 points. The live-calling exclusion and dormant future voice-note boundary are now part of the governing `main` documentation.
- The combined-status query for the documentation merge returned no status checks, and the commit workflow-run lookup returned no PR-triggered runs. This is recorded as **no CI evidence surfaced for the docs-only merge**, not as a pass or failure.

### Main-source evidence added since the previous ledger snapshot

The current application-source baseline commit `3a7d683` includes the following backgammon/security work in its commit diff and message:

- Fail-closed validation for malformed board/dice arrays, sparse arrays, checker inventory, bar/off counters and malformed persisted game state.
- Mirrored host/guest oversized bear-off priority checks and validation of a selected move before higher-die priority is applied.
- Shared integrity validation across online paths; corrupt positions are rejected before reads, rolls or temporary-AI takeover.
- Stale online batch-move previews and selections are discarded when authoritative state changes.
- Server-authoritative online turn-start timestamps and the 20-second turn clock, with clock persistence through a roll and reset only on turn transition.
- Online input is disabled while temporary AI owns the turn; active match leases are extended by player heartbeats.
- Centralized sensitive-request log redaction and an automated regression for session continuity when the apparent client network changes.

These are **source/commit evidence**, not a fresh exact-head test result. The current connector lookup exposed no combined status checks or PR-triggered workflow runs for `3a7d683`; therefore no new CI points are awarded solely from the commit message or test files. The two-device, real-network, Android lifecycle and visual acceptance gates remain open.

### Open pull-request handling

The repository search showed active, unmerged work including PRs #86 (isolated chess module), #97 (dormant infrastructure-agent proposal), #98 (API-origin resolver), #104 (owner-protection foundation), #107 (structured API logging), #110 (Iranian Manch foundation), and #114 (owner analytics dashboard). These branches are not part of `main` and are not counted as merged implementation or earned progress. Their own exact-head CI, code review, integration boundaries and owner approval gates must be checked before any merge. In particular, the chess module and Manch foundation remain isolated until their integration is explicitly accepted.

### Scoring decision

- The official project percentage remains **pending**. This refresh improves the traceability of current evidence but does not complete the 53-package, sub-criterion-by-sub-criterion scoring audit.
- Do not interpret the previous status distribution (35 in progress, 13 blocked, 4 not started, 1 approval-gated) as a percentage complete. It describes package status/weight only and may be superseded by later evidence.
- Do not award points for unmerged PRs, source-only claims that lack the required tests, stale Production health checks, or manual acceptance that has not been performed.
- The next scoring pass must split each leaf package's weight into measurable acceptance criteria under WBS §4, attach exact evidence to each criterion, and award only the verified fraction. Manual Android/two-device/VPN acceptance, owner approvals, Production provenance and backup/restore gates remain unearned until independently evidenced.

### Approval and safety gates reconfirmed

- No APK build or preparation is authorized by this audit.
- No Production deployment, migration, schema mutation, secret change, paid activation, SMS activation, agent activation, grant creation or scheduled agent action was performed or authorized by this documentation update.
- Live audio/video calling, WebRTC calling and TURN remain out of scope. Recorded voice messages remain future-optional and OFF by default.


## Technical blocker closure addendum — 2026-11-04

See [Technical Blocker Closure Audit](TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md) for exact read-only evidence and the isolated migration test.

- WBS 7.4 moves from Blocked to In progress: trigger schedule and recurring Function invocations are now verified; actual deletion remains unproven because no eligible expired room existed at observation time.
- WBS 7.3 remains Blocked: an additive migration has been authored and passed on an isolated Neon branch, including a repeat run; complete semantic parity, app integration, backup/restore and rollback are still required.
- WBS 6.2 remains Blocked: the active Function metadata contains the owner variable name, but secure value verification and owner acceptance remain open.
- WBS 7.2 and 7.6 remain Blocked: deployed-source provenance and secure production configuration/network acceptance remain open.
- No WBS points are awarded by this status update. No Production mutation, migration, deployment, secret retrieval, or network-policy change was performed.

- Additional 7.4 evidence: isolated Neon test branch proved the cleanup CTE deletes an expired empty room and its linked notification; no Production rows were changed.

## Technical closure follow-up — 2026-11-04 (latest exact-head audit)

- PR #166 remains open and unmerged on `chore/technical-blocker-closure-2026-11-04`. Latest observed commit after migration/test hardening: `107bda4c4d20bbad6448154770889684eaad886c`. Do not merge or deploy without explicit owner approval.
- CI on the immediately preceding head `ef5325f043ce846407529242720aa2e02d1566ab` passed: API build + `npm test`, API integration (`npm run test:integration` against PostgreSQL 16), Flutter analyze/tests, backgammon engine/AI/board regression, and Web Preview. A fresh exact-head run is required after the latest username-index change.
- WBS 7.3: targeted semantic catalog review confirmed audited new-table/column types, defaults, nullability, PK/FK/check constraints and expiry index. It found source drift in the legacy username index (case-sensitive DB index vs source-required `LOWER(username)`). The additive migration now creates `users_username_casefold_unique_idx`; isolated clone check found zero blank usernames and zero case-fold duplicate groups, and the new index was applied and verified on the isolated branch. Package remains Blocked pending full source-wide semantic parity, app compatibility, backup/restore, rollback/recovery and explicit Production approval.
- WBS 7.4: production trigger configuration confirms the enabled one-minute schedule targets `royalclubapi` at `/internal/cleanup-expired-empty-rooms`. Current source route rejects calls without a valid trigger invocation and returns deleted-room count; integration tests assert 403 without trigger, 200 with valid trigger and actual deletion. Isolated Neon CTE test also deleted one expired room and linked notification. Package remains In progress until deployed Function provenance and production outcome observability are proven.


## Latest technical audit — 2026-11-04 (source parity and stale Function)

- Source/catalog name parity was re-run against the repaired isolated Neon branch using the same parser and index-normalization logic as `apps/api/src/schema-parity.ts`: tables 35/35, columns 301/301, explicit indexes 34/34, with no missing or extra names. This is name-level parity, not full semantic parity of all source definitions.
- `schema-parity.ts` now reads `pg_get_indexdef` and normalizes the verified additive `users_username_casefold_unique_idx` to the source's `users_username_unique_idx`, ignoring only the known case-sensitive legacy definition. Added unit tests cover both legacy and already-correct indexes.
- Production Neon Function remains deployment 81, created `2026-10-31T10:24:43Z`; GitHub commit `b74c05ff68b9cd3334d07a2d084983b0b48ad7cc` at 11:24:28Z subsequently added trigger-auth validation, cleanup-success logging, and SHA provenance. The active Function is therefore older than those changes. No successful/failed cleanup application log was found in the last seven days; invocation begin/end alone do not prove route execution.
- Manual-only deployment workflow already verifies main/Production target, schema parity, and exact `ROYAL_CLUB_GIT_SHA` via the health endpoint, then runs registration/login/profile/friend/match smoke tests. PR #166 additionally makes the owner ID secret mandatory and validates numeric format before deployment; no secret value was read.
- 7.2 remains Blocked pending owner-approved deployment and exact live SHA match. 7.4 remains In progress pending deployment-backed route/outcome verification. 6.2 remains Blocked pending owner confirmation that the configured numeric ID is the owner account. 7.6 remains Blocked pending secure CORS/network/log access acceptance. 7.3 remains Blocked pending full semantic review, app compatibility, backup/restore and rollback evidence.
- No WBS points awarded. No Production migration/deployment/configuration change or APK build performed.


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


## Backup/restore evidence update — 2026-11-04

- Read-only Production backup inventory found one manual snapshot dated 2026-10-31 and an empty Production snapshot schedule. The WBS 7.5 requirement for three recent recovery points and tested recurring backups is not met.
- A branch restore from that snapshot completed and was catalog-checked: the restored snapshot contains 33 public tables / 289 columns. The original Production branch and API Function deployment 81 were preserved; the restored branch is retained separately.
- The restore call's default finalization temporarily changed the project's default-branch pointer. This was corrected immediately by restoring the original branch name and default pointer. Follow-up checks confirmed the original branch ID `br-misty-flower-bavs47dm` is again `production` and default, with its original Function and cleanup trigger. This was a branch-control-plane change only; no SQL writes, migration, data update, or deployment occurred. Full details and the correction are in [Technical Blocker Closure Audit](TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md).
- WBS 7.5 remains Blocked: one historical snapshot restore is not three-point retention, does not establish a recurring backup schedule, and does not complete end-to-end application recovery/RPO/RTO acceptance. No WBS points are awarded by this evidence update.


## Source-wide column semantic comparison — 2026-11-04

- Compared all 301 parsed source column declarations against the repaired isolated Neon catalog: 301/301 names, zero missing/extra names, zero data-type mismatches, and one nullability mismatch.
- The only mismatch is `users.username`: source DDL leaves it nullable; both Production and the isolated branch enforce NOT NULL. Read-only counts on both branches showed 0 NULL and 0 blank usernames (3 users on each at audit time). The stronger DB constraint was preserved; no relaxation was attempted.
- This resolves the type/name audit for all 301 columns but does not establish full defaults/identity/generated/FK/check/index-expression parity. WBS 7.3 remains Blocked pending the explicit username nullability decision, remaining semantic checks, application compatibility, and complete backup/restore/rollback acceptance. No WBS points are awarded from this partial audit.
- Full detail: [Technical Blocker Closure Audit](TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md).


## Cross-package CI audit — 2026-11-06

Exact-head GitHub Actions were checked for open implementation PRs. #133 Hokm's corrected head `fd3d96b` passed API build/unit, Flutter analyze/tests, API integration, backgammon audit and Web Preview build (deployment skipped). #167 wallet localization, #168 welcome-card removal and #169 admin plan creation each passed the four repository validation workflows. #170's WBS/retention documentation passed the same four workflows. Chess #86, Manch #110, Hokm mobile #137, UNO integration #144, subscription-plan draft #148, owner analytics #114, owner-protection #104 and infrastructure proposal #97 also have successful historical exact-head CI as recorded in the technical audit.

These results are not WBS points by themselves. No leaf score changes are made: CI does not prove physical-device acceptance, full game matches, load/multi-instance behavior, live worker provisioning, production schema/deployment, owner security acceptance, scheduled backup retention or disaster recovery. Duplicate/stale PRs #146/#147/#148 and stale/non-mergeable docs PR #145 remain unmerged; newer mainline PRs #168/#167/#169 carry the corresponding updates. Full evidence and exact SHAs are in [the technical blocker closure audit](TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md).

## Cross-package regression evidence — 2026-11-06

Verified feature-branch validation (no WBS points awarded solely from green CI):
- PR #133 Hokm production integration, head `fd3d96bb7b66da1ba2372f0309bf0e6bbe5f55a8`: API build/unit, API integration, Flutter analyze/tests, Web Preview, and Backgammon engine audit passed. A prior failed run exposed a stale 4–3 winner fixture inconsistent with first-to-seven scoring; corrected fixture is on the current head.
- PR #148 subscription plan administration, head `658bcfc5e30466efa0d7c1c5283c75353715a8fc`: all four workflows passed; added unauthenticated/non-owner and numeric boundary tests.
- PR #146 welcome-card removal, head `ef6852ce3945ed8eca6c746ba216a605916a2f43`: all four workflows passed; explicit English-locale widget coverage added.
- PR #147 subscription localization, head `a365e2e8ac4f058fcb3f1ab3f2b4cb5edab6de73`: all four workflows passed.
- PR #110 Iranian Manch: analyzer identified a malformed test-group closure; repaired on head `5bc0bb9feaa3a14bd72167aeb4226cd6ffda725f`; full CI is pending. Do not mark complete until all four workflows pass.

Open integration/release boundaries: all PRs remain unmerged; PR #137's older Hokm mobile draft must be reconciled with #133; PR #86 chess stays standalone. Production migration/deploy, secrets/owner-ID verification, backup/restore acceptance and device/load testing remain gated. Full detail in [Technical Blocker Closure Audit](TECHNICAL-BLOCKER-CLOSURE-2026-11-04.md).


## Current-mainline port and dependency audit — 2026-11-06

- PR #167 (wallet monthly-plan localization) and PR #168 (home welcome-card removal) are current-mainline ports of earlier draft fixes #147 and #146. Their exact heads `6be7d5ac622faaeb51cdbe458e53290b7be06d1e` and `7897e7aa5eb22b1d0da15a1428f1246c0c0afdb0` passed all four repository validation workflows. The earlier PRs remain open; do not merge both copies.
- PR #169 ports owner-managed subscription-plan creation to current mainline and now includes unauthenticated (401), non-owner (403), fractional-duration and unsafe-price rejection tests. Its CI failure is traced to the same missing `apps/api/src/hokm/room.ts` implementation referenced by the existing mainline `hokm-room.test.ts`; API integration and Flutter checks pass, while API unit/Web Preview test workflows fail at module resolution. PR #110 has the same dependency. PR #133 is the provider of that missing module and must be integrated first; do not bypass the test or claim these PRs fully green.
- PR #170 criterion matrix / data-retention policy documentation passed all four workflows. All 53 packages remain Pending until criterion-level evidence is individually reviewed; no WBS points are automatically awarded.
- PR #133 is being revalidated at its latest head; its merge is still a separate owner decision. No PR was merged, no Production change or APK build occurred.


## Cross-package follow-up — 2026-11-06 (latest branch corrections)

- PR #166 head `d9730916fccfb189360c4b997a9004b09e007ce7`: stale PR merge-ref diagnosis is recorded in the technical audit. The refreshed merge ref now targets current main `d0f7558406a427acb4cec1e5c50f215d57e941f6`. Earlier exact-head run on code-bearing commit `e3569008109f8a23885d76802d7e6e9dea65a298` passed API build/unit, API integration, Flutter analyze/tests, backgammon audit and Web Preview build. Fresh exact-head runs on `d973091` are in progress; no WBS points are awarded pending completion and remaining Production/recovery gates.
- PR #133 Hokm API head `6aec85771dcef35f5f6535d7d08bf182e82b3cd2`: two ordinary-player integration fixtures that incorrectly requested owner-controlled target 3 now use default target 7. The owner-controlled target-3 fixtures remain unchanged. This corrects test setup without weakening authorization. The PR remains Draft; this new head has no exact-head Actions evidence yet.
- PR #137 Hokm mobile head `6a36c5383f1f32aa403d78879e136e6fa42951dd`: the public lobby no longer exposes the 3/5/7 target selector to ordinary players; they create with default 7. The selector is shown only after the server-backed owner check, with widget tests added for ordinary and owner behavior. This is unverified by exact-head CI and remains Draft. The current Hokm auth adapter maps owner/player only; delegated manager identity is not yet wired into this setting.
- Mainline PR #181 adds versioned owner-managed game-service configuration and rollback for UNO only. The mobile API origin remains build-time configured; cryptographic signatures and a pinned verification key are not implemented. The requested signed, centrally managed API/all-game origin control remains incomplete pending a secure signing-key provisioning path.
- No PR was merged by this task. No Production migration/deployment, origin change, secret change, worker provisioning, APK build or WBS score change was performed.


## Criterion scoring update — 2026-11-07

- PR #166 was merged as `608754f4f387fba441111fb4ee440bebe7de1586`; its exact-head API build/unit, PostgreSQL integration, Flutter analyze/tests, backgammon engine audit and Web Preview build passed. These satisfy WBS 7.1-A through 7.1-E (25 points) in the criterion matrix.
- PR #189 was merged as `eb312f710d17a3ac7464f0b37eacd1f3dbc2feca`; owner report mutations now require fresh session-bound step-up while delegated access remains resource-scoped.
- PR #192 was merged as `bc0a7128ffaa6a2c4a6f496ced3827afaed0d7ae`; exact-head API integration, API build/tests, Flutter analyze/tests and Web Preview build passed. This satisfies WBS 5.2-A (5 points) for owner-managed plan creation with step-up protection.
- Together with the previously accepted 2.5-A/B evidence (10 points), the criterion matrix records 40/1,000 = 4.0% evidence-backed minimum. The remaining 192 criteria are pending. This is not a complete project percentage.
- Package status counts were reconciled against the current 53-row register: 40 In progress, 9 Blocked, 3 Not started, 1 Approval gated. No additional WBS points are inferred from PR merges alone.
- No Production migration/deployment, secret read, APK build, SMS/payment activation, or Agent activation was performed.


## Phase 1 architecture/governance audit refresh — 2026-11-08

- Created consolidated architecture/NFR baseline, requirements-to-implementation traceability and confirmed-decision log, project governance, data lifecycle/recovery requirements, and phase dependency/parallel-execution map.
- Updated the criterion matrix with eight evidence-backed passes: 1.1-A, 1.1-C, 1.2-A, 1.4-A, 1.4-B, 1.4-C, 1.6-A and 1.6-B (40 points of WBS 1.0). No criteria were reweighted or added.
- Phase 1 architecture/governance score is 40/80 = 50%. The whole-project score in the merged matrix is 80/1,000 = 8.0% evidence-backed minimum after PR #199 merged as 0677958e7912db2201c6a1ece33372a204c80fc5. PR #199 was documentation-only; no application CI was triggered and no runtime behavior changed.
- Still open: measurable numeric NFR targets and owner approvals; second-provider portability verification; exact-head negative tests for server-authoritative game/economy rules; full enforcement review of free-by-default, IP/VPN independence and public-identity privacy; owner-approved retention/deletion rules; three-point backup retention and application-level recovery/rollback tests.
- No Production mutation/deployment, secret retrieval/change, SMS/payment activation, agent activation, APK build, or owner-gated operation was performed.


## Phase 1 follow-up audit — 2026-11-08 (after PR #201)

- PR #201 merged as `81b7d4a5a33b7eb1930c2c97a2251859624de124`. It adds proposed measurable NFR/service targets, an isolated 1,000-concurrent-user load profile, and a proposed data-retention/deletion schedule.
- These values are explicitly proposals, not owner-approved SLOs or retention policy. No WBS points were added by PR #201.
- Phase 1 remains 40/80 (50%). Whole-project matrix remains 80/1,000 (8.0% evidence-backed minimum).
- Source review reconfirmed existing API integration assertions for account/session continuity across distinct socket remote addresses, username-only friend search projections, and username-only chat conversation projections. The corresponding changes are on main (including PR #162), but no exact-current-main test run was exposed by the available GitHub status/workflow query; WBS 1.3-B/C remain Pending until exact-head CI and the required device/privacy acceptance are attached.
- Source review of the subscription schema and league entry paths found a default VIP monthly plan priced at 300 internal credits, while league entry defaults to free and subscription-day entry is an explicit owner-configured mode. A complete endpoint-by-endpoint proof that every launch feature is free is not yet present; WBS 1.3-A remains Pending.
- WBS 1.2-B remains Pending: no verified second-provider deployment/rehearsal has been completed. WBS 1.2-C remains Pending: authoritative game/economy negative tests require exact-head, complete evidence across current modules.
- WBS 1.5-A remains Pending pending owner-approved retention/deletion durations and exceptions. WBS 1.5-B remains Pending pending approved backup cadence/retention plus an application-level isolated restore and rollback drill with measured RPO/RTO.
- No Production migration/deployment, data deletion, backup schedule mutation, secret/network change, SMS/payment activation, agent activation, APK build or financial action was performed.


## Phase 1 criterion 1.2-C closure — 2026-11-08

- PR #204 merged as `c1ec474753b4528b33ab783439f42a26a39e3000` after every exact-head check passed on `fb7021615e90325712b6668d6a6a88eefaad9c3c`: API build/unit and PostgreSQL integration (runs `42475968379`, `42475968332`), Chess isolated API/mobile validation (`42475968328`), backgammon engine audit (`42475968383`), and Web Preview (`42475968329`). The API integration command runs all `test/*.test.ts` files, including Manch server-authority negative tests and Hokm API integration cases; the API unit suite includes Hokm invalid-turn/card/state tests.
- Chess engine and route tests reject illegal moves, malformed commands/FEN, unauthorized access, stale claims, invalid draw requests and outsider moves. Backgammon tests reject malformed persisted state, wrong-turn/stale-version moves and invalid game commands. Wallet/league integration tests cover insufficient balance, unauthorized owner operations, free-by-default league entry, subscription-day gating, duplicate entry and no direct wallet debit.
- UNO runtime least-privilege negative tests (deny unrelated personal-column SELECT and schema CREATE) passed in UNO Standalone CI on exact current-main PR #203 head `ee8ccf74e865ceb63665915cfe39193a70f2e70c`, run `42475232236`; PR #203 merged as `a4e66ad6540c6342b2f2c0952cbeaaf35d5a8592` after its exact-head root validation also passed.
- Therefore WBS criterion 1.2-C is now Passed for 5 points. Phase 1 is 45/80 = 56.25%; whole-project evidence-backed minimum is 85/1,000 = 8.5%. WBS weights and all other criterion states remain unchanged.
- Remaining Phase 1 criteria: 1.1-B (owner approval of measurable NFR targets), 1.2-B (verified second-provider portability), 1.3-A (complete free-by-default enforcement audit), 1.3-B (physical Android VPN OFF/ON acceptance), 1.3-C (complete public-identity privacy audit including legacy/empty-profile acceptance), 1.5-A (owner-approved retention/deletion policy), and 1.5-B (approved backup cadence plus isolated restore/rollback with measured RPO/RTO).
- PR #204 brings chess and Hokm source into main but does not authorize or imply production activation. Q26 wording, next-hakem interpretation, the unresolved 120-second timing reference, dedicated Hokm worker/staging, four-device acceptance and production-like load remain release gates. No production migration/deployment, worker provisioning, APK build, SMS/payment activation, financial action or Agent runtime activation was performed.


## Phase 1 criteria 1.3-A and 1.3-C closure — 2026-11-08

- **1.3-A Passed (5 points):** current-main source audit across API, Manch, Hokm, Chess and UNO found no mandatory subscription gate on core game/social routes. League `subscription_days` entry is owner-opt-in and defaults to `free` with zero days; optional VIP purchase is not a usage prerequisite; account-customization prices default to zero. The user's explicit 2026-10-26 decision confirms private chat is available to friends without a subscription and non-friends cannot message. Current friend-only chat implementation and integration tests match that policy; the older checkpoint's subscriber-only wording is superseded.
- Free-by-default regression evidence: private chat is exercised as a free friend-only capability; backgammon, Manch, Hokm, Chess and UNO room/game paths have no subscription gate; free league entry succeeds without an active subscription and does not debit wallet credits. Subscription-day league entry is explicitly opt-in and negative-tested for users without entitlement. Voice messages remain unimplemented/disabled; the later three-round daily monetization limit is not active.
- **1.3-C Passed (5 points):** current-main API audit shows full name/email/phone only in registration/self-profile and owner-only admin views. Public friend, chat, leaderboard, match-history, spectator and game projections expose usernames only. API tests assert absence of fullName/email; Manch/Hokm/Chess/UNO tests cover public payload boundaries. Current Flutter friends, chat, lobby, leaderboard, Hokm and Chess screens display username or a generic fallback for empty legacy data, not private full name/email.
- Exact-head CI evidence: PR #204 head `fb7021615e90325712b6668d6a6a88eefaad9c3c` runs `42475968379`, `42475968332`, `42475968328`, `42475968383`, `42475968329` all passed; PR #203 head `ee8ccf74e865ceb63665915cfe39193a70f2e70c` UNO Standalone CI run `42475232236` passed.
- Phase 1 now has 11/16 criteria passed = 55/80 = 68.75%. Whole-project evidence-backed minimum is 95/1,000 = 9.5%; 181 criteria remain Pending. No weights changed.
- Remaining Phase 1 criteria: 1.1-B (owner approval of measurable NFR targets), 1.2-B (verified second-provider portability), 1.3-B (physical Android VPN OFF/ON acceptance), 1.5-A (owner-approved retention/deletion policy), 1.5-B (approved backup cadence plus isolated restore/rollback with measured RPO/RTO).
- Manual device and legacy/empty-profile visual acceptance remains tracked under WBS 4.5; this does not undo the API/source-level 1.3-C privacy enforcement pass. No paid behavior, SMS/payment, production change, APK build or Agent runtime was activated.

## Repeatable point-in-time restore audit — 2026-11-08

- Read-only inspection compared Production branch `br-misty-flower-bavs47dm` with two isolated restores of snapshot `snap-spring-truth-ba9rbrg1`: `br-crimson-rice-baahb4f3` and `br-plain-voice-balyjaip`.
- Production and both restore branches have identical structural object sets: 33 public tables, 78 indexes and 27 sequences. No missing/extra table, index or sequence names were found.
- Exact `COUNT(*)` queries across all 33 tables returned matching row counts for both restore branches (33/33). No personal row values were read.
- Current Production differs from the 2026-10-31 snapshot in post-snapshot tables (for example matches 6 vs 4, wallet accounts 3 vs 2, private messages 13 vs 10, notifications 12 vs 5). This is expected point-in-time divergence and shows why the snapshot's RPO must be measured rather than assumed.
- No SQL writes, migrations, cleanup, role changes, deployments, schedule changes, branch renames or branch deletions were performed in this audit. Neon Functions inventory confirms `royalclubapi` deployment #81 remains active on the current Production branch and no function is listed on Restore B. Restore B's `restored_as` points to the Production branch ID, and an earlier audit recorded a temporary Production-position swap; current historical lineage/compute reassignment remains unresolved. Full detail: `docs/RESTORE-REHEARSAL-2026-11-08.md`.
- **WBS 1.5-B remains Pending:** no recurring backup schedule, measured RPO/RTO, application-level restore smoke test, complete row checksum, external encrypted backup, or 23:59 Asia/Tehran email-link delivery is evidenced.


## Provider portability contract evidence — 2026-11-08

- PR #207 merged as `e3a3105f15f7751f6ff9f1f80813a93a5d49b175` after exact-head CI passed on `1dd7655256d7ee7839429ee5146c6dd4fb7e639d`.
- Added `apps/api/src/provider-portability.test.ts` to validate the existing Render blueprint's Node runtime, build/start commands, health-check path, standard PostgreSQL `DATABASE_URL`, JWT/CORS environment contract, and PostgreSQL 16 Docker Compose readiness.
- This is a static provider-contract test, not a real Render deployment. WBS 1.2-B remains Pending until a separate Render staging service/database is deployed, health and DB portability are smoke-tested, and teardown/rollback is verified. The Render connector was suggested but is not yet connected; no cloud resource was created.


## Owner executive analytics dashboard — current-main status — 2026-11-08

- The analytics API, event instrumentation, owner dashboard screen and admin navigation are already merged in PR #197 (`d85960475299c2cb573d16a1c20b1be305025ed6`). PR #114 was closed as a stale duplicate; its architecture/instrumentation/dashboard documents were refreshed and merged in PR #208.
- The old PR #114 head `9ab685f4af6b266fb293812e9d476fd5b16ee129` was 52 commits behind/diverged and had only Netlify preview checks; it is not a valid integration candidate.
- Its remaining Netlify proxy/redirect/workflow was deliberately not merged: the global `/api/*` redirect would affect Production, and `ROYAL_CLUB_API_ORIGIN` is not configured. Adopt only after Production and isolated preview API origins are configured and tested.
- Analytics limitations remain: no event producers for chess/cards/UNO/Mafia, process-memory latency samples reset on restart, PDF does not support Persian characters, and provider/Agent costs are not sourced. No Production deployment or preview API origin was enabled.

## Phase 2 OTP/security evidence audit — 2026-11-08

- **2.2-A Passed (5 points):** integration tests cover Iranian phone normalization, six-digit OTP format, salted/digested storage (plaintext code absent from DB), single-use consumption, expiration, cooldown, maximum attempts, per-phone/global daily limits, and production-mode simulator rejection.
- **2.2-B Passed (5 points):** registration/login/link/reset OTP challenges are purpose-bound. Tests reject registration codes on generic verification, verify phone ownership during registration, login and account linking, reject unverified profile phone edits, and reject linking a phone already owned by another account.
- **2.2-C Passed (5 points):** owner-step-up protected SMS settings encrypt provider API keys using AES-256-GCM with a server-side 32-byte key. Tests verify ciphertext-at-rest, no plaintext/ciphertext leakage in read responses, and activation rejection.
- Exact-head evidence: PR #206 head `1446067e28615406dd7ae6121f11a0700ed3c0e0`; API integration run [42478821103](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821103/job/128726055974) and API build/unit run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955) passed. The OTP implementation and integration tests were unchanged by the later docs-only PR #208.
- **2.2-D remains Pending:** live SMS activation, approved provider/device acceptance and any real SMS delivery require a separate explicit owner decision. No activation or real SMS send was performed.
- WBS weights unchanged. Total evidence-backed score: **110/1,000 (11.0%)**; Phase 2: **25/130 (19.23%)**; Phase 1 remains **55/80 (68.75%)**.


## Sensitive log redaction evidence — 2026-11-08

- **2.6-C Passed (5 points):** `apps/api/src/logging-config.ts` redacts request bodies, authorization/cookie/API-key/proxy-authorization headers and response cookies. Request serialization strips query strings (which may contain OTP/reset tokens), omits client IP, and prefers route templates; request IDs are generated server-side and caller-supplied IDs are disabled.
- Unit tests in `apps/api/src/logging-config.test.ts` cover redaction paths, query-string and IP omission, request ID uniqueness, and safe log-level fallback. Exact-head API unit/build run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955) passed on PR #206 head `1446067e28615406dd7ae6121f11a0700ed3c0e0`.
- WBS Phase 2 score is now 30/130 (23.08%); total evidence-backed score is 115/1,000 (11.5%). Criteria 2.6-A and 2.6-B remain Pending pending additional exact-head negative tests for token version invalidation and rate-limit/network boundaries.


## JWT/session revocation evidence — 2026-11-08

- **2.6-A Passed (5 points):** integration tests cover expired, malformed and missing JWTs, idempotent logout revocation, password recovery invalidating previous sessions, and explicit token-version invalidation. The new regression test increments a user's `token_version`, verifies old tokens are rejected on both self-profile and friends routes, then verifies a fresh login works.
- PR #210 exact head `f5ab13e7ec13a099a1b59ba1ca09a6c060a0066c` passed API integration run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826), API build/unit run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797), root Flutter tests/analyze, backgammon engine audit and Web Preview build. PR #210 merged as `b99b79b010b0af662909bbac2e669ca958e676a3`.
- Phase 2 score: **35/130 (26.92%)**; total evidence-backed score: **120/1,000 (12.0%)**. Criteria 2.6-B (explicit rate-limit/network-boundary negative tests) remains Pending.


## Registration password policy evidence — 2026-11-08

- **2.1-B Passed (5 points):** `isValidRegistrationPassword` enforces at least six Unicode code points and at most 128 UTF-8 bytes. Tests cover five/six-character boundary, Persian letters, emoji code points, 128/129-byte boundary, empty and non-string input.
- Exact-head evidence: PR #210 API build/unit run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797) passed; the same validation source/tests were included in PR #206 API build/test run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955). No policy change was made.
- Phase 2 score: **40/130 (30.77%)**; total evidence-backed score: **125/1,000 (12.5%)**.


## Registration/login and session lifecycle evidence — 2026-11-08

- **2.1-A Passed (5 points):** integration test `logout revokes the current bearer session while a fresh login creates a new session` exercises account registration, authenticated profile access, logout, email/password login and fresh authenticated profile access. Phone OTP registration/login is separately covered by the purpose-bound OTP integration test.
- **2.1-C Passed (5 points):** session tests prove current-token revocation, idempotent logout, fresh-login recovery, password-reset invalidation of all prior sessions, and explicit `token_version` invalidation across protected routes.
- Exact-head evidence: PR #210 API integration run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826) and API build/unit run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797) passed before merge `b99b79b010b0af662909bbac2e669ca958e676a3`.
- Phase 2 score: **50/130 (38.46%)**; total evidence-backed score: **135/1,000 (13.5%)**. Criterion 2.1-D remains Pending because the live recovery provider/device acceptance is not enabled or approved.


## Persian/English localization evidence — 2026-11-08

- **2.4-A Passed (5 points):** `app_fa.arb` and `app_en.arb` both declare their expected locale and have identical non-metadata message keys; `localization_resource_parity_test.dart` and `localization_test.dart` assert parity.
- **2.4-C Passed (5 points):** `appError` translates common API/service exceptions into English; notification localization tests cover friend request, friend acceptance and match invitation titles/bodies in Persian and English.
- **2.4-D Passed (5 points):** widget tests pump Persian then English locale, verify shared text follows the selected language and assert RTL/LTR directionality.
- Exact-head Flutter analyze/test run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630554) passed on PR #210 head `f5ab13e7ec13a099a1b59ba1ca09a6c060a0066c`. No localization code was changed by PR #210; the tests were run against current mainline source.
- **2.4-B remains Pending:** a complete screen-by-screen audit of all visible static UI strings is still required.
- Phase 2 score: **65/130 (50.0%)**; total evidence-backed score: **150/1,000 (15.0%)**.


## Cross-account authorization regression evidence — 2026-11-08

- **2.3-D Passed (5 points):** new integration test verifies a caller-supplied foreign `userId` cannot redirect `/api/v1/me/profile` updates to another account. Private chat is readable only by the two accepted friends; an unrelated account receives 403 on read/send, 404 on edit, and zero rows deleted when attempting to delete the pair's message.
- PR #214 exact-head API integration run [424...](https://github.com/Mrobaei1/Royal-club/actions/runs/42486935392/job/128750743909) passed, as did API build/unit, Flutter analyze/tests, backgammon engine audit and Web Preview build. PR #214 merged as `7f3505fd2120517221d2d04c8713c3c125a47850`.
- Phase 2 score: **70/130 (53.85%)**; total evidence-backed score: **155/1,000 (15.5%)**.


## Public identity projection evidence — 2026-11-08

- **2.3-B Passed (5 points):** public user search returns username and omits fullName/email; incoming friend requests omit email; chat conversation projections expose username and omit fullName; match history does not expose opponent email. Hokm integration tests verify nonparticipants cannot inspect room state and player views never include other players' hands or the undealt deck.
- Exact-head API integration run [42486935392](https://github.com/Mrobaei1/Royal-club/actions/runs/42486935392/job/128750743909) passed on PR #214 head `36b052fedb6a4b6944ad28f94fab91ee42d31fb5`; PR #214 merged as `7f3505fd2120517221d2d04c8713c3c125a47850`.
- Phase 2 score: **75/130 (57.69%)**; total evidence-backed score: **160/1,000 (16.0%)**. Criterion 2.3-C (legacy/empty profile privacy) remains Pending pending explicit empty/legacy payload regression coverage.


## Rate-limit, CORS and network-boundary evidence — 2026-11-08

- **2.6-B Passed (5 points):** new integration test proves login throttling is account-bound, not IP-bound: ten invalid attempts across two remote addresses return 401 and the eleventh returns 429; a separate account remains unaffected. Existing CORS test denies untrusted origins. API server config explicitly sets `trustProxy: false`, and OTP integration tests cover cooldown, attempt limits and daily limits.
- Exact-head evidence: PR #216 head `0ccbabd035c0282f86a8f9fc615d1ee964cfeaa9`; API integration run [42487192996](https://github.com/Mrobaei1/Royal-club/actions/runs/42487192996/job/128751531735), API build/unit run [42487192984](https://github.com/Mrobaei1/Royal-club/actions/runs/42487192984/job/128751531635), Flutter, backgammon and Web Preview checks all passed. PR #216 merged as `9fbe93068095ad0f8d6944cbf50576ce7dad2a1e`.
- Phase 2 score: **80/130 (61.54%)**; total evidence-backed score: **165/1,000 (16.5%)**. No Production rate-limit/CORS/network configuration was changed.


## Legacy/empty public profile privacy evidence — 2026-11-08

- **2.3-C Passed (5 points):** added `publicUsernameLabel` and `normalizedPublicUsername`, which accept only the public username field and use neutral localized fallback labels for null, blank, whitespace and non-string legacy values. Friends, Chat, Leaderboard and Hokm screens now use this shared helper; no private fullName/email/phone fallback is available through the helper.
- Flutter regression tests cover empty/legacy values and username formatting. Exact-head Flutter analyze/widget test run [42487475637](https://github.com/Mrobaei1/Royal-club/actions/runs/42487475637/job/128752407108) passed on PR #218 head `ac3908d4aedc4cea6cec5b3659271cc020d54597`; PR #218 merged as `851d5c70af0f58e11ef840a3e50d8393306bbea4`.
- Phase 2 score: **85/130 (65.38%)**; total evidence-backed score: **170/1,000 (17.0%)**.


## Network-change session and game/social recovery evidence — 2026-11-08

- **2.7-B Passed (5 points):** integration tests authenticate a user and then change the request remote address; `/api/v1/me` continues to resolve the same JWT subject and account identity.
- **2.7-C Passed (5 points):** after a network/IP change, the same authenticated account retains its accepted friend list and recovers the identical active backgammon match board/state. These API tests demonstrate session continuity independent of IP address.
- Exact-head evidence: PR #221 head `1591e0498eeea3b2084038d2b554693175374ec8`, API integration run [42487784052](https://github.com/Mrobaei1/Royal-club/actions/runs/42487784052/job/128753337846) passed. Physical Android VPN OFF/ON acceptance is not implied and remains pending.
- Phase 2 score: **95/130 (73.08%)**; total evidence-backed score: **180/1,000 (18.0%)**.


## Password recovery and account recovery evidence — 2026-11-08

- **2.1-D Passed (5 points):** password recovery integration tests cover unknown-number non-enumeration, purpose-bound reset OTP, one-time consumption, password replacement, rejection of the old password, acceptance of the new password and revocation of all prior sessions. The development simulator is isolated to test/development mode and does not send real SMS; production provider/device activation remains pending under 2.2-D.
- Exact-head API integration run [42487784052](https://github.com/Mrobaei1/Royal-club/actions/runs/42487784052/job/128753337846) passed on PR #221 head `1591e0498eeea3b2084038d2b554693175374ec8`.
- Phase 2 score: **100/130 (76.92%)**; total evidence-backed score: **185/1,000 (18.5%)**.


## Self-profile privacy evidence — 2026-11-08

- **2.3-A Passed (5 points):** integration tests verify `GET /api/v1/me` resolves the profile solely from the verified JWT subject. A foreign `userId` query parameter cannot switch identity; two test accounts each receive their own email/full name/phone and never the other account's private identity.
- Exact-head evidence: PR #222 head `619742db619a8009d8cf849e902cc08e5671ea8a`, API integration run [42487826951](https://github.com/Mrobaei1/Royal-club/actions/runs/42487826951/job/128753465486) passed; PR #222 merged as `6677e8da9b41cfa00a8450aa2a3c0db021e59838`.
- Phase 2 score: **105/130 (80.77%)**; total evidence-backed score: **190/1,000 (19.0%)**.
