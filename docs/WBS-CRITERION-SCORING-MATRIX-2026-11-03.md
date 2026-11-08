# Royal Club — WBS criterion-level scoring matrix

**Baseline:** WBS v1.1 · **Latest audit:** 2026-11-08 · **53 leaf packages · 1,000 points**

## Rules

- Every approved package weight is divided into equal **5-point criteria**, preserving the 1,000-point baseline.
- Each criterion earns 5 points only after its acceptance outcome is evidenced and passed. Failed, blocked, untested or unsupported criteria earn 0.
- **Every criterion begins Pending.** A criterion may be changed to Passed only in a dated evidence update that identifies its acceptance proof; this matrix records both the baseline and subsequent audited passes.
- CI proves only the checks actually run. Manual-device, Production, provider and owner-approval criteria require separate evidence.
- Record exact commit/PR, workflow run, test report, read-only verification or manual acceptance. Do not double-count evidence.

## Scoring table

### 1.0 Product, architecture, governance

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 1.1-A | Android-first/Iran+international requirements approved | 5 | Passed | Owner-approved WBS v1.1; architecture baseline and requirements traceability reviewed 2026-11-08. |
| 1.1-B | Persian/English and security/cost/extensibility NFRs measurable | 5 | Pending | Not audited |
| 1.1-C | Requirements trace to implementation and owner decisions | 5 | Passed | docs/REQUIREMENTS-TRACEABILITY.md maps approved decisions to WBS, implementation surfaces, evidence and residual gates (2026-11-08). |
| 1.2-A | Flutter/API/PostgreSQL boundaries respected | 5 | Passed | Static architecture review: README.md, apps/mobile/pubspec.yaml, apps/api/package.json and apps/api/src/server.ts; consolidated in docs/ARCHITECTURE-AND-NFRS.md (2026-11-08). |
| 1.2-B | Provider portability and deployment boundaries verified | 5 | Pending | Merged PR #207 adds passing provider-contract tests for `render.yaml`, standard Node API scripts/health route, `DATABASE_URL`/PostgreSQL driver and PostgreSQL 16 Compose readiness (`1dd7655256d7ee7839429ee5146c6dd4fb7e639d`). This validates the deployment blueprint statically only. A real Render staging deployment, health smoke, DB connection/portability check and teardown/rollback are still required before scoring. |
| 1.2-C | Server-authoritative game/economy rules negatively tested | 5 | Passed | PR #204 head `fb7021615e90325712b6668d6a6a88eefaad9c3c`: API build/unit + PostgreSQL integration run `42475968379`; Manch/Hokm/backgammon negative coverage; Chess isolated API/mobile run `42475968328`; backgammon engine audit `42475968383`. UNO least-privilege negative integration/standalone CI passed on PR #203 head `ee8ccf74e865ceb63665915cfe39193a70f2e70c`, run `42475232236`. All exact-head workflows passed. (2026-11-08) |
| 1.3-A | Free-by-default policy enforced | 5 | Passed | Core game/league routes have no mandatory subscription gate; league `subscription_days` is owner-opt-in and default is `free`/0 days. Private chat is friend-only but does not require a subscription, matching the owner's explicit 2026-10-26 decision; non-friends cannot message. Default customization prices are 0; VIP purchase is optional. Exact-head API/game CI: PR #204 runs `42475968379`, `42475968332`, `42475968328`, `42475968383`; UNO Standalone CI PR #203 run `42475232236`. (2026-11-08) |
| 1.3-B | IP/VPN-independent identity verified | 5 | Pending | Not audited |
| 1.3-C | Username-only public identity and privacy enforced | 5 | Passed | API payload assertions exclude fullName/email from friend, chat, leaderboard, match-history and spectator projections; Manch, Hokm, Chess and UNO tests/projections use usernames only. Static UI audit: friends/chat/lobby/leaderboard/Hokm/Chess surfaces use username or generic empty-profile fallback; fullName is limited to self-profile/auth and owner-only admin views. Exact-head PR #204 validation runs `42475968379`, `42475968328`, `42475968332`; UNO Standalone CI PR #203 run `42475232236`. Manual device and legacy-profile visual acceptance remains tracked under WBS 4.5. (2026-11-08) |
| 1.4-A | WBS baseline/change control maintained | 5 | Passed | Frozen WBS v1.1 baseline plus change-control rules in docs/PROJECT-GOVERNANCE.md; no scope/weight changes. |
| 1.4-B | Owner decisions and approvals traceable | 5 | Passed | Confirmed decisions and unresolved approvals recorded in docs/REQUIREMENTS-TRACEABILITY.md and docs/PROJECT-GOVERNANCE.md (2026-11-08). |
| 1.4-C | Evidence links and milestone reports current | 5 | Passed | WBS matrix and rolling evidence ledger refreshed 2026-11-08; exact links/SHAs and remaining gates retained. |
| 1.5-A | Data lifecycle/retention/deletion approved | 5 | Pending | Not audited |
| 1.5-B | Backup/restore/DR procedures documented and tested | 5 | Pending | Two isolated restores from snapshot `snap-spring-truth-ba9rbrg1` have identical 33-table/78-index/27-sequence structures and matching exact row counts in all 33 tables. See `docs/RESTORE-REHEARSAL-2026-11-08.md`. Still missing recurring backup schedule, measured RPO/RTO, application-level restore smoke tests and external email-link backup. (2026-11-08) |
| 1.6-A | Roadmap dependencies reviewed | 5 | Passed | docs/PHASE-DEPENDENCY-MAP.md reviews phase prerequisites, critical path, parallel work and approval gates (2026-11-08). |
| 1.6-B | Chess/card scope preserved with backgammon priority | 5 | Passed | Owner-approved WBS v1.1, README.md, execution roadmap and docs/REQUIREMENTS-TRACEABILITY.md preserve chess/cards while prioritizing backgammon. |

### 2.0 Accounts, security, localization

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 2.1-A | Registration/login end-to-end | 5 | Pending | Not audited |
| 2.1-B | Six-character password policy | 5 | Pending | Not audited |
| 2.1-C | Session lifecycle/logout/revocation | 5 | Pending | Not audited |
| 2.1-D | Recovery/account flows | 5 | Pending | Not audited |
| 2.2-A | OTP normalization/digest/expiry/limits | 5 | Passed | API integration CI run 42478821103; OTP digest, expiry, cooldown, attempt exhaustion, daily limits and normalization regression tests |
| 2.2-B | Purpose-bound register/login/link ownership | 5 | Passed | API integration CI run 42478821103; purpose-bound register/login/link, cross-purpose rejection, duplicate phone-link and unverified profile-edit tests |
| 2.2-C | Provider credentials encrypted and owner-controlled | 5 | Passed | API integration CI run 42478821103; owner-step-up settings test verifies AES-256-GCM ciphertext at rest and secret-free reads |
| 2.2-D | Production activation gated and approved device/provider acceptance | 5 | Pending | Not audited |
| 2.3-A | Self-profile privacy | 5 | Pending | Not audited |
| 2.3-B | Public APIs suppress private identity | 5 | Pending | Not audited |
| 2.3-C | Legacy/empty profile privacy | 5 | Pending | Not audited |
| 2.3-D | Cross-account authorization | 5 | Pending | Not audited |
| 2.4-A | ARB parity | 5 | Pending | Not audited |
| 2.4-B | Visible static UI localization | 5 | Pending | Not audited |
| 2.4-C | Dynamic errors/notifications localization | 5 | Pending | Not audited |
| 2.4-D | Locale-switch regression tests | 5 | Pending | Not audited |
| 2.5-A | Persian RTL on Android | 5 | Passed | Owner-confirmed manual Android check, 2026-11-04; no issue reported |
| 2.5-B | English LTR on Android | 5 | Passed | Owner-confirmed manual Android check, 2026-11-04; no issue reported |
| 2.5-C | Dialogs/forms/overflow | 5 | Pending | Not audited |
| 2.5-D | Dynamic text/directional UI | 5 | Pending | Not audited |
| 2.6-A | JWT/session negative tests | 5 | Passed | API integration CI run 42486568179; expired/malformed/missing JWTs, logout revocation, password-reset version bump, and explicit token-version invalidation across protected routes |
| 2.6-B | Rate limits/CORS/network controls | 5 | Pending | Not audited |
| 2.6-C | Sensitive log redaction | 5 | Passed | API unit CI run 42478821167; request body/header/cookie/query-string redaction, route-template serialization, IP omission and server-generated request IDs |
| 2.7-A | Same account VPN off/on | 5 | Pending | Not audited |
| 2.7-B | Identity/session continuity | 5 | Pending | Not audited |
| 2.7-C | Access/game/social recovery | 5 | Pending | Not audited |

### 3.0 Games and backgammon

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 3.1-A | Legal moves/blocked points | 5 | Pending | Not audited |
| 3.1-B | Dice/doubles/four-dice sequences | 5 | Pending | Not audited |
| 3.1-C | Hits/blots | 5 | Pending | Not audited |
| 3.1-D | Correct-side bar entry | 5 | Pending | Not audited |
| 3.1-E | Bearing-off exact/overshoot priority | 5 | Pending | Not audited |
| 3.1-F | Turn transitions | 5 | Pending | Not audited |
| 3.1-G | Malformed state fails closed | 5 | Pending | Not audited |
| 3.1-H | Mirrored host/guest regression | 5 | Pending | Not audited |
| 3.1-I | Independent rules audit | 5 | Pending | Not audited |
| 3.2-A | Approved visual design | 5 | Pending | Not audited |
| 3.2-B | Shared online/offline board | 5 | Pending | Not audited |
| 3.2-C | Checker orientation/stack/count | 5 | Pending | Not audited |
| 3.2-D | Dice/highlights/player panels | 5 | Pending | Not audited |
| 3.2-E | Responsive Android sizes | 5 | Pending | Not audited |
| 3.2-F | Themes/locales | 5 | Pending | Not audited |
| 3.2-G | Real-device visual acceptance | 5 | Pending | Not audited |
| 3.3-A | Create/join/invite authorization | 5 | Pending | Not audited |
| 3.3-B | 60-second expiry | 5 | Pending | Not audited |
| 3.3-C | Cancellation/stale invite rejection | 5 | Pending | Not audited |
| 3.3-D | Versioning/concurrency | 5 | Pending | Not audited |
| 3.3-E | Idle cleanup | 5 | Pending | Not audited |
| 3.4-A | Server-authoritative legality/state | 5 | Pending | Not audited |
| 3.4-B | Cumulative dice | 5 | Pending | Not audited |
| 3.4-C | Bar entry/turn integrity | 5 | Pending | Not audited |
| 3.4-D | Reconnect canonical resync | 5 | Pending | Not audited |
| 3.4-E | Duplicate/tampered/racing move protection | 5 | Pending | Not audited |
| 3.5-A | Heartbeat/presence | 5 | Pending | Not audited |
| 3.5-B | Lease/grace period | 5 | Pending | Not audited |
| 3.5-C | Temporary AI legal turn | 5 | Pending | Not audited |
| 3.5-D | Reconnect handback | 5 | Pending | Not audited |
| 3.5-E | Expiry/race/duplicate prevention | 5 | Pending | Not audited |
| 3.6-A | Single-game resignation | 5 | Pending | Not audited |
| 3.6-B | Match surrender | 5 | Pending | Not audited |
| 3.6-C | Confirm/cancel UX; Winner/result consistency; Idempotent repeat requests | 5 | Pending | Not audited |
| 3.7-A | Offline training isolation | 5 | Pending | Not audited |
| 3.7-B | Local AI/two-player | 5 | Pending | Not audited |
| 3.7-C | Restart/exit reset; No online-state mutation; No online XP/Elo | 5 | Pending | Not audited |
| 3.8-A | Chess entry point | 5 | Pending | Not audited |
| 3.8-B | Card/UNO entry state | 5 | Pending | Not audited |
| 3.8-C | Agreed MVP entry flow | 5 | Pending | Not audited |
| 3.8-D | Navigation state preservation; No backgammon regression | 5 | Pending | Not audited |
| 3.9-A | Game rules/state contracts | 5 | Pending | Not audited |
| 3.9-B | Account/lobby extension boundaries | 5 | Pending | Not audited |
| 3.10-A | Two-account/two-device test | 5 | Pending | Not audited |
| 3.10-B | Android size matrix | 5 | Pending | Not audited |
| 3.10-C | Network interruption/reconnect; Core game regression; Owner acceptance evidence | 5 | Pending | Not audited |

### 4.0 Social and community

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 4.1-A | Username search/privacy | 5 | Pending | Not audited |
| 4.1-B | Friend request lifecycle | 5 | Pending | Not audited |
| 4.1-C | Remove/race handling | 5 | Pending | Not audited |
| 4.1-D | 100-friend cap | 5 | Pending | Not audited |
| 4.2-A | Audience authorization | 5 | Pending | Not audited |
| 4.2-B | Text delivery | 5 | Pending | Not audited |
| 4.2-C | Image authorization | 5 | Pending | Not audited |
| 4.2-D | Emoji | 5 | Pending | Not audited |
| 4.2-E | Edit/delete; no calls; voice disabled | 5 | Pending | Not audited |
| 4.3-A | Recipient targeting | 5 | Pending | Not audited |
| 4.3-B | Localized read/unread lifecycle | 5 | Pending | Not audited |
| 4.3-C | Clear-all isolation and Android acceptance | 5 | Pending | Not audited |
| 4.4-A | Host permission | 5 | Pending | Not audited |
| 4.4-B | Friend/follower and active-match eligibility | 5 | Pending | Not audited |
| 4.4-C | Finished restriction/no replay | 5 | Pending | Not audited |
| 4.5-A | Username-only public identity | 5 | Pending | Not audited |
| 4.5-B | Legacy/empty profile audit | 5 | Pending | Not audited |
| 4.5-C | No private identity leak/regression | 5 | Pending | Not audited |
| 4.6-A | Avatar rules | 5 | Pending | Not audited |
| 4.6-B | Username edit policy | 5 | Pending | Not audited |
| 4.6-C | Private account details | 5 | Pending | Not audited |
| 4.7-A | Persian RTL | 5 | Pending | Not audited |
| 4.7-B | English LTR | 5 | Pending | Not audited |
| 4.7-C | Themes/layout/accessibility device test | 5 | Pending | Not audited |

### 5.0 Wallet, progression, leagues

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 5.1-A | Non-transferable credits | 5 | Pending | Not audited |
| 5.1-B | Auditable ledger | 5 | Pending | Not audited |
| 5.1-C | Atomic balance | 5 | Pending | Not audited |
| 5.1-D | Idempotent concurrency | 5 | Pending | Not audited |
| 5.1-E | Owner adjustments | 5 | Pending | Not audited |
| 5.2-A | Manager plans | 5 | Passed | PR #192 exact head `02dac555352ea0d70e391168272a24cc44c66299`; owner step-up protected create-plan API/UI; API integration run `42230679256`, API build/tests and Flutter analyze/tests run `42230679251` (2026-11-07). |
| 5.2-B | Transactional activation | 5 | Pending | Not audited |
| 5.2-C | Expiry/removal | 5 | Pending | Not audited |
| 5.2-D | Server-controlled prices | 5 | Pending | Not audited |
| 5.3-A | XP policy | 5 | Pending | Not audited |
| 5.3-B | Permanent levels/curve | 5 | Pending | Not audited |
| 5.3-C | Elo/leaderboard | 5 | Pending | Not audited |
| 5.3-D | Ties/draws/unfinished matches | 5 | Pending | Not audited |
| 5.3-E | Retry/audit | 5 | Pending | Not audited |
| 5.4-A | Manager config | 5 | Pending | Not audited |
| 5.4-B | Entry/minimum participants | 5 | Pending | Not audited |
| 5.4-C | Fixtures/byes/rest fairness | 5 | Pending | Not audited |
| 5.4-D | Results/finals | 5 | Pending | Not audited |
| 5.4-E | Appeals/incidents/reschedule | 5 | Pending | Not audited |
| 5.4-F | Audit history | 5 | Pending | Not audited |
| 5.4-G | Manager UI acceptance | 5 | Pending | Not audited |
| 5.5-A | Free-by-default entry | 5 | Pending | Not audited |
| 5.5-B | Dedicated entitlement ledger | 5 | Pending | Not audited |
| 5.5-C | Exactly-once/no wallet debit | 5 | Pending | Not audited |
| 5.6-A | Owner monetization control/audit | 5 | Pending | Not audited |
| 5.6-B | Paid behavior disabled absent approval | 5 | Pending | Not audited |
| 5.7-A | Persian/English manager UI | 5 | Pending | Not audited |
| 5.7-B | Manual acceptance before activation | 5 | Pending | Not audited |

### 6.0 Administration and Agents

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 6.1-A | Mobile admin usability | 5 | Pending | Not audited |
| 6.1-B | Desktop admin usability | 5 | Pending | Not audited |
| 6.1-C | Ordinary-user denial | 5 | Pending | Not audited |
| 6.1-D | Voice-message control manager-only/OFF | 5 | Pending | Not audited |
| 6.2-A | Numeric owner identity | 5 | Pending | Not audited |
| 6.2-B | Secure configuration | 5 | Pending | Not audited |
| 6.2-C | Fail-closed owner endpoints | 5 | Pending | Not audited |
| 6.2-D | No username/email privilege | 5 | Pending | Not audited |
| 6.3-A | Permission matrix | 5 | Pending | Not audited |
| 6.3-B | 50-delegate limit | 5 | Pending | Not audited |
| 6.3-C | Grant/revoke/audit | 5 | Pending | Not audited |
| 6.3-D | Voice setting authorization | 5 | Pending | Not audited |
| 6.3-E | Deny-by-default tests | 5 | Pending | Not audited |
| 6.4-A | Task definitions/capabilities | 5 | Pending | Not audited |
| 6.4-B | Human approval | 5 | Pending | Not audited |
| 6.4-C | Run state/cancellation/audit | 5 | Pending | Not audited |
| 6.4-D | Dormant execution | 5 | Pending | Not audited |
| 6.5-A | Privileged audit | 5 | Pending | Not audited |
| 6.5-B | Secret redaction | 5 | Pending | Not audited |
| 6.5-C | Kill switch | 5 | Pending | Not audited |
| 6.5-D | Immediate revoke/cancel | 5 | Pending | Not audited |
| 6.6-A | Agent Center categories | 5 | Pending | Not audited |
| 6.6-B | Monitoring/status accuracy | 5 | Pending | Not audited |
| 6.6-C | Safe command UX and human approval | 5 | Pending | Not audited |
| 6.7-A | Provider/settlement validation | 5 | Pending | Not audited |
| 6.7-B | Idempotency and human review; no screenshot credit | 5 | Pending | Not audited |
| 6.8-A | Owner UX acceptance | 5 | Pending | Not audited |
| 6.8-B | No activation without separate approval | 5 | Pending | Not audited |

### 7.0 Infrastructure, operations, release

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 7.1-A | API build/unit | 5 | Passed | PR #166 exact head `5b0898c0818533e543b3f8df85515aaa573a770d`; API build and tests passed in run `42223001081` (2026-11-06). |
| 7.1-B | API DB integration | 5 | Passed | PR #166 exact head `5b0898c0818533e543b3f8df85515aaa573a770d`; PostgreSQL integration passed in run `42223001021`. |
| 7.1-C | Flutter analyze/tests | 5 | Passed | PR #166 exact head `5b0898c0818533e543b3f8df85515aaa573a770d`; Flutter analyze/tests passed in runs `42223001021` and `42223001081`. |
| 7.1-D | Engine audit | 5 | Passed | PR #166 exact head `5b0898c0818533e543b3f8df85515aaa573a770d`; backgammon engine/AI audit passed in run `42223001007`. |
| 7.1-E | Web preview checks | 5 | Passed | PR #166 exact head `5b0898c0818533e543b3f8df85515aaa573a770d`; Web Preview build passed in run `42223001210`; deployment correctly skipped on PR. |
| 7.2-A | Repeatable manual deployment | 5 | Pending | Not audited |
| 7.2-B | Owner approval | 5 | Pending | Not audited |
| 7.2-C | Source provenance | 5 | Pending | Not audited |
| 7.2-D | Health/smoke/rollback | 5 | Pending | Not audited |
| 7.3-A | Source/schema reconciliation | 5 | Pending | Not audited |
| 7.3-B | Migration order | 5 | Pending | Not audited |
| 7.3-C | Tables/columns/indexes | 5 | Pending | Not audited |
| 7.3-D | Rollback test | 5 | Pending | Not audited |
| 7.3-E | Recovery test | 5 | Pending | Not audited |
| 7.4-A | Scheduled cleanup | 5 | Pending | Not audited |
| 7.4-B | Idle-runtime cleanup | 5 | Pending | Not audited |
| 7.4-C | Observability/alerts | 5 | Pending | Not audited |
| 7.5-A | Monitoring/runbooks | 5 | Pending | Not audited |
| 7.5-B | Redacted logs | 5 | Pending | Not audited |
| 7.5-C | Alerts/incident response | 5 | Pending | Not audited |
| 7.5-D | Backup retention/restore | 5 | Pending | Not audited |
| 7.6-A | Network/IP controls | 5 | Pending | Not audited |
| 7.6-B | CORS/HTTPS | 5 | Pending | Not audited |
| 7.6-C | Secrets | 5 | Pending | Not audited |
| 7.6-D | Owner/SMS gates and least privilege | 5 | Pending | Not audited |
| 7.7-A | Two-device acceptance | 5 | Pending | Not audited |
| 7.7-B | Network recovery | 5 | Pending | Not audited |
| 7.7-C | Android/accessibility/localization | 5 | Pending | Not audited |
| 7.7-D | Performance/regression | 5 | Pending | Not audited |
| 7.8-A | Separate release/APK approval | 5 | Pending | Not audited |
| 7.8-B | Release candidate/version/notes | 5 | Pending | Not audited |
| 7.8-C | APK and rollback only after approval | 5 | Pending | Not audited |

## Audit summary

- Packages decomposed: **53/53**
- Acceptance criteria: **200**
- Points represented: **1000/1,000**
- Earned points currently evidenced: **120/1,000 (12.0%)** — prior 115 points plus 5 points for criterion 2.6-A after exact-head API build/unit and PostgreSQL integration CI passed.
- Remaining criteria: **176 Pending** (880 points not yet earned).
- Official project percentage: **12.0% evidence-backed minimum**; this remains a partial criterion audit, not a claim that only 11.0% of code exists. The six recently closed criteria are supported by exact-head negative-test CI, friend-only free chat/free-by-default route audit, username-only privacy regressions, OTP digest/expiry/rate-limit and purpose-binding tests, and encrypted owner-controlled SMS credential tests. Provider deployment portability, NFR target approval, physical VPN/device acceptance, owner-approved retention and DR acceptance remain open.

## Required evidence record

For each criterion record: `criterion ID | pass/fail/blocked/not tested | exact evidence URL or commit | audit date | reviewer | blocker/owner decision`. A passing criterion is worth exactly 5 points. Re-audit after new commits or manual acceptance and retain prior evidence history.


## Phase 1 architecture/governance audit — 2026-11-08

Eleven criteria passed (55/80 Phase 1 points; 68.75% of WBS 1.0). In addition to the eight prior architecture/governance criteria, 1.2-C (server-authoritative game/economy negative tests), 1.3-A (free-by-default enforcement) and 1.3-C (username-only public identity/privacy) now pass based on exact-head CI and cross-module regression/source evidence. The 2026-10-26 owner decision confirms private chat is available to friends without a subscription, with non-friends blocked; current code and tests match it. Criteria 1.1-B, 1.2-B, 1.3-B and 1.5-A/B remain Pending. Physical VPN OFF/ON testing, legacy/empty-profile device acceptance under WBS 4.5, second-provider portability, owner-approved NFRs/retention, and application-level disaster recovery remain open.


## Phase roll-up — 2026-11-08 (updated after OTP evidence audit)

The following percentages are calculated directly from the 200 criterion rows in this matrix. A criterion earns its full five points only when its status is `Passed`; Pending criteria earn zero. Weights are unchanged.

| WBS phase | Total weight | Passed criteria | Earned points | Progress |
| --- | ---: | ---: | ---: | ---: |
| Phase 1 — Architecture and project management | 80 | 11/16 | 55 | 68.75% |
| Phase 2 | 130 | 7/26 | 35 | 26.92% |
| Phase 3 | 230 | 0/46 | 0 | 0.00% |
| Phase 4 | 120 | 0/24 | 0 | 0.00% |
| Phase 5 | 140 | 1/28 | 5 | 3.57% |
| Phase 6 | 140 | 0/28 | 0 | 0.00% |
| Phase 7 | 160 | 5/32 | 25 | 15.63% |
| **Total** | **1,000** | **24/200** | **120** | **12.00%** |



## Phase 2 OTP/security and logging evidence audit — 2026-11-08

Three Phase 2 criteria now pass (15/130 points):
- **2.2-A Passed:** Iranian phone normalization, salted/digested OTP storage, single-use consumption, expiry, resend cooldown, bounded attempts, per-phone/global daily limits, and production simulator lock are covered by integration tests.
- **2.2-B Passed:** OTP challenges are purpose-bound for register/login/link/reset; cross-purpose use is rejected, registration and login bind to the verified phone, phone linking requires an authenticated account, duplicate ownership is rejected, and unverified profile phone edits are blocked.
- **2.2-C Passed:** SMS provider API keys are encrypted with AES-256-GCM using a server-side 32-byte key; settings endpoints require owner step-up; API responses expose only an `apiKeyConfigured` boolean; tests assert that plaintext and ciphertext fields are not returned. Activation remains disabled.
- Evidence: exact-head API integration run [42478821103](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821103/job/128726055974) and API build/test run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955), on PR #206 head `1446067e28615406dd7ae6121f11a0700ed3c0e0`; source/test files were unchanged by subsequent documentation-only PR #208.
- **2.2-D remains Pending:** live SMS/OTP activation and approved device/provider acceptance are not authorized or evidenced. No SMS was sent and no credentials were activated.


- **2.6-C Passed (5 points):** API logger tests verify request bodies, authorization/cookie/API-key headers, response cookies and query strings are redacted; request serialization uses route templates, omits client IP, and uses server-generated request IDs. Exact-head API unit/build run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955) passed with `logging-config.test.ts` included in `npm test`.


- **2.6-A Passed (5 points):** exact-head API integration tests prove expired, malformed and missing bearer tokens are rejected; logout revokes the current token; password recovery invalidates earlier sessions; and incrementing `users.token_version` invalidates previously issued tokens across both `/api/v1/me` and `/api/v1/friends`, while a fresh login succeeds. Evidence: PR #210 head `f5ab13e7ec13a099a1b59ba1ca09a6c060a0066c`, API integration run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826) and API build/unit run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797), all required checks passed before merge `b99b79b010b0af662909bbac2e669ca958e676a3`.
