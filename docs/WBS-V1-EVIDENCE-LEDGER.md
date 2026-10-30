# Royal Club — WBS v1.0 Evidence Ledger

- **Baseline:** Owner-approved WBS v1.0
- **Baseline weight:** 1,000 points
- **Verified leaf count:** 53 (6 + 7 + 10 + 7 + 7 + 8 + 8)
- **Audit status:** Initial ledger established; item-by-item evidence scoring is in progress.
- **Scoring rule:** No points are earned by assumption. A package remains unscored until its criteria and current-main evidence are inspected. CI evidence, merged source, deployment evidence and manual acceptance are distinct.
- **Important:** This ledger does not change WBS scope or weights. No APK, production deployment, migration, payment activation or agent execution is authorized by this document.

## Status definitions

- **Pending audit:** Evidence has not yet been sufficiently inspected and reconciled against the package's complete acceptance criteria.
- **In progress:** Some measurable criteria are evidenced; remaining criteria and earned fraction must be recorded.
- **Blocked:** A specific external or technical blocker prevents progress; record owner/action.
- **Complete:** Every acceptance criterion is satisfied and evidence is linked.
- **Earned points:** Remain **0 pending audit** until a defensible fraction is established; this is not a claim that the package has no implementation.

## Package-by-package ledger

| WBS ID | Weight | Acceptance outcome | Audit status | Evidence required / next audit action |
|---|---:|---|---|---|
| 1.1 | 15 | Product and non-functional requirements | **Pending audit** | Approved requirements, current product decision records, traceability |
| 1.2 | 15 | Architecture boundaries and provider portability | **Pending audit** | Architecture docs, source boundaries, API/database integration tests |
| 1.3 | 15 | Traceable product/privacy/game decisions | **Pending audit** | Decision log and server-side privacy/security tests |
| 1.4 | 15 | Project governance and evidence reporting | **Pending audit** | WBS/roadmap PRs, change control, evidence ledger |
| 1.5 | 10 | Data lifecycle, privacy, retention, backup/restore and DR | **Pending audit** | Approved policies, tested backup/restore and recovery evidence |
| 1.6 | 10 | Roadmap and phase dependencies | **Pending audit** | Approved roadmap and current dependency review |
| 2.1 | 20 | Registration/login, six-character password, sessions and recovery | **Pending audit** | API/client tests and accepted end-to-end account flow |
| 2.2 | 20 | Phone/OTP foundation with real provider gated | **Pending audit** | Provider integration tests; real-device flow; activation approval if applicable |
| 2.3 | 20 | Server-side profile privacy and account editing | **Pending audit** | Authorization/negative tests across public surfaces |
| 2.4 | 20 | Persian/English localization coverage | **Pending audit** | Localization inventory, automated coverage and dynamic-content tests |
| 2.5 | 20 | RTL/LTR manual Android acceptance | **Pending audit** | Device screenshots/checklist for supported sizes and dialogs |
| 2.6 | 15 | Security closure | **Pending audit** | JWT/session/rate-limit/CORS/secret/owner-config tests and environment review |
| 2.7 | 15 | VPN on/off continuity | **Pending audit** | Two-state real-device account/session acceptance |
| 3.1 | 45 | Backgammon legal rules and edge cases | **Pending audit** | Engine unit/property/regression tests for all listed rule cases |
| 3.2 | 35 | Royal board UI in offline/online modes | **Pending audit** | Widget tests and visual/device acceptance against approved design |
| 3.3 | 25 | Server-authoritative online match lifecycle and 60s expiry | **Pending audit** | API integration tests for create/join/invite/expiry/cancel/version/cleanup |
| 3.4 | 25 | Server-validated online moves and reconnect state | **Pending audit** | API tests for cumulative dice, bar, dice/turn integrity and races |
| 3.5 | 25 | Disconnect leases and temporary AI takeover | **Pending audit** | PR #67 exact-head CI, code review, two-device disconnect/reconnect/race acceptance |
| 3.6 | 15 | Online surrender scopes and cancellation | **Pending audit** | API/client tests for game/match loss, cancel, result and idempotency |
| 3.7 | 15 | Offline training isolated from ranking | **Pending audit** | Offline AI/restart tests proving online state and ranking isolation |
| 3.8 | 20 | Chess/card-game entry points and MVP flows | **Pending audit** | Navigation retention plus agreed MVP tests for each game |
| 3.9 | 10 | Future game extension points | **Pending audit** | Architecture tests/review for Uno/Mafia extensibility without rewrite |
| 3.10 | 15 | Two-account/device game acceptance | **Pending audit** | Signed manual regression record across independent accounts/devices |
| 4.1 | 20 | Friend lifecycle by username and max 100 | **Pending audit** | API authorization, duplicate/race and 100/101 boundary tests |
| 4.2 | 25 | Private chat text/images/emoji; no voice/video | **Pending audit** | API/client tests for audience, media, emoji and message lifecycle |
| 4.3 | 15 | Targeted notifications and clear-all | **Pending audit** | Isolation, localization, lifecycle and clear-all tests |
| 4.4 | 15 | Host-approved spectator access; no replay | **Pending audit** | Authorization tests for host/friend/follower/finished-match cases |
| 4.5 | 15 | Username-only public identity | **Pending audit** | Privacy tests for profile, friends, chat, leaderboard, history and spectator |
| 4.6 | 15 | Avatar/username editing and privacy | **Pending audit** | Entitlement, token/free policy and privacy tests |
| 4.7 | 15 | Social UX language/theme/device acceptance | **Pending audit** | Persian/English and theme real-device acceptance |
| 5.1 | 25 | Non-transferable credit-token ledger | **Pending audit** | Transactional/idempotency/concurrency/audit tests |
| 5.2 | 20 | Subscription entitlements and expiry | **Pending audit** | Server-authoritative entitlement, pricing and expiry tests |
| 5.3 | 25 | XP, levels, Elo and leaderboard | **Pending audit** | Bounded-growth, ties, retry, cancellation and edge-case tests |
| 5.4 | 35 | Weekly league lifecycle | **Pending audit** | Format, minimum, rest/byes, fixtures, results, appeals, incidents and audit tests |
| 5.5 | 15 | League entry consumes subscription-day entitlement once | **Pending audit** | Ledger/entitlement idempotency tests; no wallet debit |
| 5.6 | 10 | Owner-controlled monetization gates | **Pending audit** | Negative tests proving paid flows disabled absent owner approval |
| 5.7 | 10 | Manager league/wallet UI acceptance | **Pending audit** | Manual Persian/English acceptance; activation remains separately gated |
| 6.1 | 20 | Admin mobile/desktop UX and isolation | **Pending audit** | Role-based navigation and API authorization negative tests |
| 6.2 | 20 | Secure owner identity | **Pending audit** | Numeric/configured owner identity evidence; username-only escalation denied |
| 6.3 | 25 | Manager/assistant permission matrix and 50 ceiling | **Pending audit** | Grant/revoke/scope/limit/deny-by-default tests |
| 6.4 | 20 | Dormant agent task/proposal/approval/audit model | **Pending audit** | Model tests and proof execution remains disabled |
| 6.5 | 20 | Audit, redaction, kill switch and cancellation | **Pending audit** | Security tests for cancellation/revocation/redaction and kill switch |
| 6.6 | 15 | Agent Center categories/monitoring/status | **Pending audit** | UX/API tests; external actions require human approval |
| 6.7 | 10 | Deposit/payment adapter if in scope | **Pending audit** | Provider validation, idempotency and human-review evidence; otherwise owner disposition |
| 6.8 | 10 | Owner-facing admin/agent UX acceptance | **Pending audit** | Manual acceptance and proof no privileged activation without approval |
| 7.1 | 25 | Exact-commit CI reliability | **Pending audit** | Required workflow runs on exact proposed SHA |
| 7.2 | 20 | Controlled API deployment and health checks | **Pending audit** | Approved deployment record and latest-source smoke verification |
| 7.3 | 25 | Database migration/source reconciliation | **Pending audit** | Schema diff, approved migration plan, tested rollback/recovery |
| 7.4 | 15 | Expired room/invite cleanup under serverless idle | **Pending audit** | Scheduler/config proof, idle-period integration test and observability |
| 7.5 | 20 | Monitoring/logging/runbooks/backup restore | **Pending audit** | Redaction/alert/runbook evidence and tested latest-three restore |
| 7.6 | 20 | Production security/configuration | **Pending audit** | CORS/network/secrets/owner/SMS/least-privilege review |
| 7.7 | 20 | Two-device E2E, network, Android and regression acceptance | **Pending audit** | Signed test matrix with device/network evidence |
| 7.8 | 15 | Release candidate/APK gated by explicit approval | **Pending audit** | Release notes/rollback checklist; APK only after separate owner instruction |

## Verified repository facts at ledger creation

1. WBS v1.0 and roadmap documentation are merged on `main` through PR #68 and PR #69. This supports governance/documentation evidence for 1.4 and roadmap evidence for 1.6, but does not by itself complete either package.
2. PR #67 (`fix/pr61-rebased-on-current-main`) is a draft and is not merged. Its recorded implementation and CI cannot be counted as merged mainline functionality. Two-independent-device acceptance remains outstanding and is owned by the project owner.
3. PR #67 is relevant to 3.5; do not award completion points before review, merge, exact-head checks and manual acceptance are all reconciled.
4. WBS v1.0 has **53** leaf rows, not 47. The count correction is documentation-only; total weights remain 1,000 points.
5. Prior informal project percentages are not a WBS score. The official numeric score remains **pending** until this ledger is populated with item-level evidence and earned fractions.

## Audit execution order

1. Verify live `main` SHA and required CI; preserve exact refs for every evidence record.
2. Audit package source and automated tests, starting with P1 packages 3.1–3.6 and 7.1/7.4.
3. Audit privacy/security packages 2.3, 2.6, 4.5 and 6.2–6.5 as high-risk cross-cutting controls.
4. Audit remaining account, social, wallet, league, admin and operations packages.
5. Record real-device/production acceptance separately; do not infer it from source or CI.
6. Calculate earned points only after every row has a documented fraction and evidence reference.

## Change log

| Date | Change |
|---|---|
| 2026-10-30 | Initial evidence ledger created against WBS v1.0; leaf count verified as 53; no weights or product scope changed. |
