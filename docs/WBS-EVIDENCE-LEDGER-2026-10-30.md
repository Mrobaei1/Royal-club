# Royal Club — WBS v1.0 Evidence Ledger (rolling audit)

- **Audit date:** 2026-10-31
- **Governing baseline:** `docs/PROJECT-WBS-BASELINE.md`, WBS v1.0
- **Live main at this audit:** `7c7502dd70cff487def0768b6726c9451a4a00e6`
- **Documentation follow-up:** PR #70 merged as `22dbff4caf81e3507da31e38bc2905cc964baf41` (WBS count correction and evidence ledger; no application code changed).
- **Online disconnect implementation:** PR #67 merged as `69f315b2c2d38eba3c1e688ab48be77d17a2137c`.
- **Notification/empty-bar fixes:** PR #75 merged as `227563f82c63ec5e9e4d4fa6c3e78e27cd059d26`.
- **Invitation lifecycle fix:** PR #77 merged into `main` as `facba0469d431f7b223e308879637a41959faf9a` after all four exact-head workflows passed on `a3f019f6b79a67a9a9a8ac535730fe7222b9d1bc`.
- **Online board and join-race regression coverage:** PR #78 merged as `10e3921ab958d071ed012615d3b220be459281a2`; exact-head API integration, Flutter tests, engine audit and Web Preview passed.
- **Post-merge main verification:** PR #78 merge head `10e3921` passed API build/integration, Flutter, engine and Web Preview in runs `41186639789`, `41186639847`, `41186639831` (and exact PR-head runs below). Current docs-only main head `7c7502` has Production API/database health passed in `41186861447`; its remaining CI workflows were in progress at this audit.
- **Leaf package count:** **53** (six + seven + ten + seven + seven + eight + eight)
- **Total baseline weight:** **1,000 points**; the package weights below sum to exactly 1,000.
- **Purpose:** evidence inventory and status register; this is not yet the scored baseline.

## Important count correction

The roadmap previously said 47 packages. Counting the actual leaf IDs in the approved WBS tables gives **53**. This is a documentation/count correction only: no work package, scope, package weight, workstream weight or owner decision has been added, removed or changed. The WBS remains v1.0 and 1,000 points.

## Scoring discipline

- Status and earned points are separate. A source implementation or green CI does not complete a package whose manual, production or owner-approval criteria remain open.
- **No points are awarded in this initial inventory yet.** In-progress packages must first have their acceptance criteria split into explicit, evidence-backed sub-criteria and sub-weights under WBS §4. This prevents subjective partial credit and duplicate counting.
- Accordingly, **the official aggregate percentage remains pending baseline scoring**. This is not a claim that the project is 0% complete.
- A PR is evidence of work in progress until merged. PR #67 and PR #77 are merged, but their respective two-device/field acceptance gates remain open. Merges and green CI alone do not award completion points.
- Production deployment, schema mutation, real SMS, paid activation, agent execution/schedules and APK generation remain separately approval-gated.

## Status summary

- In progress: 35 packages
- Blocked: 13 packages
- Not started: 4 packages
- Blocked — approval gated: 1 packages
- Total: 53 packages / 1000 points.

## Package-by-package evidence register

| WBS | Weight | Status | Current evidence | Remaining acceptance / next action |
|---|---:|---|---|---|
| 1.1 | 15 | In progress | WBS v1.0; project checkpoint | Keep product/NFR decisions synchronized with implementation and manual acceptance. |
| 1.2 | 15 | In progress | apps/mobile; apps/api/src/server.ts; WBS §5 | Verify provider portability and architecture boundaries against deployed configuration. |
| 1.3 | 15 | In progress | WBS §6; project checkpoint §7 | Verify privacy/free-by-default/VPN rules across all public and account surfaces. |
| 1.4 | 15 | In progress | WBS v1.0 (PR #68); roadmap (PR #69); 53-package correction/evidence ledger (PR #70, merge `22dbff4`) | Complete scored evidence links, decision log and recurring milestone reporting. |
| 1.5 | 10 | In progress | WBS §6; execution roadmap P5 | Complete approved retention, backup/restore and disaster-recovery runbooks/tests. |
| 1.6 | 10 | In progress | EXECUTION-ROADMAP-v1 §2; WBS §6 | Roadmap is recorded; verify ongoing dependency review and continued chess/card scope. |
| 2.1 | 20 | In progress | docs/PHASE-1-3-READINESS.md §Phase 1; API auth tests | Verify full session lifecycle, recovery and end-to-end flows. |
| 2.2 | 20 | In progress | docs/PHASE-1-3-READINESS.md §OTP; docs/SMS-AUTH-ADMIN-CONFIG.md | Real provider activation and Android registration/login/linking acceptance remain gated. |
| 2.3 | 20 | In progress | apps/api/src/server.ts self-account/auth routes; apps/api/test/server.integration.test.ts privacy assertions | Complete manual audit of every public surface and legacy/empty profiles. |
| 2.4 | 20 | In progress | docs/PHASE-1-LOCALIZATION-AUDIT.md; readiness localization checklist | Re-run exact-head Flutter tests and close any remaining dynamic/navigation gaps. |
| 2.5 | 20 | Blocked | Readiness checklist — manual device acceptance open | Manual Persian RTL / English LTR acceptance on supported Android sizes. |
| 2.6 | 15 | Blocked | docs/PHASE-1-SECURITY-REVIEW.md; checkpoint production audit | Confirm owner configuration and complete deployed environment/network/security review. |
| 2.7 | 15 | Blocked | Execution roadmap P2; readiness checklist | Same-account VPN-on/VPN-off test on a real device. |
| 3.1 | 45 | In progress | apps/api/src/backgammon-rules.ts; backgammon engine audit CI | Complete edge-case audit and acceptance for legal sequences, dice, hits, bar, bear-off and turn transitions. |
| 3.2 | 35 | In progress | Shared `RoyalBackgammonBoard`; PR #78 merged as `10e3921`; Flutter widget test verifies all 24 unique opening-position hit targets | Complete visual orientation, color/piece-size, responsive, theme and real-device acceptance. |
| 3.3 | 25 | In progress | PR #77 merged as `facba046` adds expired-room invite rejection; PR #78 merged as `10e3921` proves concurrent guest joins yield exactly one 200 and one 409; 60-second room/invite expiry and cleanup endpoint remain in source | Verify expiry/cancellation/concurrency on devices and physical cleanup during serverless idle; no Neon schedule is configured. |
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
| 6.2 | 20 | Blocked | Checkpoint production audit: OWNER_USER_ID absent | Obtain owner-confirmed numeric configuration through the approved secure path; never infer it. |
| 6.3 | 25 | In progress | Delegated-permission source/tests; readiness checklist | Review full permission matrix/scopes/revocation and 50-assistant ceiling; do not seed grants. |
| 6.4 | 20 | In progress | PR #55 merged; agent task proposal source/docs | Complete capabilities/approval/state/audit model while execution stays dormant. |
| 6.5 | 20 | In progress | Permission/agent audit and kill-switch source/tests | Verify kill-switch, cancellation, revocation and secret-redaction controls end-to-end. |
| 6.6 | 15 | Not started | WBS §6 scope only; no complete evidence identified in this audit | Implement and verify Agent Center categories/monitoring UX without activating external actions. |
| 6.7 | 10 | Not started | No provider-validated deposit/payment adapter evidence identified | Only proceed after separate provider/security design and owner approval. |
| 6.8 | 10 | Blocked | WBS approval gate; no manual owner acceptance evidence | Complete owner-facing acceptance; do not activate identities, grants, schedules or financial actions. |
| 7.1 | 25 | In progress | Main `10e3921`: runs 41186639789, 41186639847, 41186639831 and Production health 41186639790 all passed. Current docs-only main `7c7502`: Production health 41186861447 passed; remaining workflows were pending/in progress at audit time. PR #78 head `96fa920`: runs 41186501237, 41186501241, 41186501258, 41186501259 all passed; PR #78 merged as `10e3921` | Continue requiring exact-head API build/unit/integration, Flutter analyze/tests, engine audit and Web Preview checks for every implementation PR. |
| 7.2 | 20 | Blocked | Neon `Royal-Club-API` production branch reports active Function deployment 80 (created before PR #77); latest post-merge health/database workflow 41186861447 passed but did not deploy PR #77; Neon does not expose bundled Git SHA | Independently attest deployed source provenance and complete production registration/login smoke tests; no new deployment without approval. |
| 7.3 | 25 | Blocked | Read-only Neon inspection: 33 public tables; 33 current `server.ts` table declarations; table names match with no missing/extra table | Complete column/index/migration-sequence reconciliation and documented rollback/recovery review; no production mutation without approval. |
| 7.4 | 15 | Blocked | apps/api/src/server.ts cleanup endpoint; checkpoint says no scheduled Neon trigger | Configure/verify approved scheduled trigger and idle/serverless cleanup observability. |
| 7.5 | 20 | Not started | WBS §6 and execution roadmap P5; no tested backup/restore evidence identified | Complete monitoring/runbooks and owner-approved latest-three backup/restore test. |
| 7.6 | 20 | Blocked | Checkpoint production security audit; owner/SMS secrets absent | Complete network/CORS/secrets/owner-ID/least-privilege acceptance with owner approval. |
| 7.7 | 20 | Blocked | Two-device and real Android acceptance gates remain open | Complete end-to-end network, layout, accessibility, performance and regression acceptance. |
| 7.8 | 15 | Blocked — approval gated | Owner instruction required; no APK authorization in current task | Prepare release notes/rollback readiness only; do not build or prepare APK until explicit approval. |


## Static source audit findings — 2026-10-30

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
