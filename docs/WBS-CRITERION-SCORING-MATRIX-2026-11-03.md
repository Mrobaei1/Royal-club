# Royal Club — WBS criterion-level scoring matrix

**Baseline:** WBS v1.1 · **Latest audit:** 2026-11-12 · **53 leaf packages · 1,000 points**

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
| 2.1-A | Registration/login end-to-end | 5 | Passed | API integration CI run 42486568179; registration, logout, fresh email/password login and authenticated profile round-trip |
| 2.1-B | Six-character password policy | 5 | Passed | API unit CI run 42486568179; Unicode character minimum and 128 UTF-8 byte maximum regression tests |
| 2.1-C | Session lifecycle/logout/revocation | 5 | Passed | API integration CI run 42486568179; logout idempotency, old-token rejection, password-reset revocation and token-version invalidation |
| 2.1-D | Recovery/account flows | 5 | Passed | API integration CI run 42487784052; phone OTP recovery, non-enumeration, one-time code consumption, password replacement and prior-session revocation |
| 2.2-A | OTP normalization/digest/expiry/limits | 5 | Passed | API integration CI run 42478821103; OTP digest, expiry, cooldown, attempt exhaustion, daily limits and normalization regression tests |
| 2.2-B | Purpose-bound register/login/link ownership | 5 | Passed | API integration CI run 42478821103; purpose-bound register/login/link, cross-purpose rejection, duplicate phone-link and unverified profile-edit tests |
| 2.2-C | Provider credentials encrypted and owner-controlled | 5 | Passed | API integration CI run 42478821103; owner-step-up settings test verifies AES-256-GCM ciphertext at rest and secret-free reads |
| 2.2-D | Production activation gated and approved device/provider acceptance | 5 | Pending | Not audited |
| 2.3-A | Self-profile privacy | 5 | Passed | API integration CI run 42487826951; JWT-subject self-profile isolation and foreign userId query-spoofing regression test |
| 2.3-B | Public APIs suppress private identity | 5 | Passed | API integration CI run 42486935392; username-only public friend/chat projections, private-field absence and opponent-email-free match history assertions |
| 2.3-C | Legacy/empty profile privacy | 5 | Passed | Flutter CI run 42487475637; null/blank/non-string username fallback tests and username-only display helper across Friends, Chat, Leaderboard and Hokm |
| 2.3-D | Cross-account authorization | 5 | Passed | API integration CI run 42486935392; foreign profile userId spoofing and outsider private-chat read/send/edit/delete regression test |
| 2.4-A | ARB parity | 5 | Passed | Flutter CI run 42486568179; Persian and English ARB locale/key parity tests |
| 2.4-B | Visible static UI localization | 5 | Passed | Flutter CI run 42487826939; screen-by-screen bilingual source audit across auth/account/admin/social/game/wallet/analytics and chess/UNO/Manch/Hokm surfaces |
| 2.4-C | Dynamic errors/notifications localization | 5 | Passed | Flutter CI run 42486568179; appError translations and localized friend/match notification title/body tests |
| 2.4-D | Locale-switch regression tests | 5 | Passed | Flutter CI run 42486568179; Persian/English locale switching, RTL/LTR direction and selected-language UI text tests |
| 2.5-A | Persian RTL on Android | 5 | Passed | Owner-confirmed manual Android check, 2026-11-04; no issue reported |
| 2.5-B | English LTR on Android | 5 | Passed | Owner-confirmed manual Android check, 2026-11-04; no issue reported |
| 2.5-C | Dialogs/forms/overflow | 5 | Pending | Not audited |
| 2.5-D | Dynamic text/directional UI | 5 | Pending | Not audited |
| 2.6-A | JWT/session negative tests | 5 | Passed | API integration CI run 42486568179; expired/malformed/missing JWTs, logout revocation, password-reset version bump, and explicit token-version invalidation across protected routes |
| 2.6-B | Rate limits/CORS/network controls | 5 | Passed | API integration CI run 42487192996; account-bound login throttling across changing remote addresses, unknown-origin CORS denial, trustProxy disabled and OTP cooldown/daily limits |
| 2.6-C | Sensitive log redaction | 5 | Passed | API unit CI run 42478821167; request body/header/cookie/query-string redaction, route-template serialization, IP omission and server-generated request IDs |
| 2.7-A | Same account VPN off/on | 5 | Pending | Not audited |
| 2.7-B | Identity/session continuity | 5 | Passed | API integration CI run 42487784052; authenticated session and account identity remain stable after remote-address/VPN IP changes |
| 2.7-C | Access/game/social recovery | 5 | Passed | API integration CI run 42487784052; friend list and active backgammon match state recover after remote-address change |

### 3.0 Games and backgammon

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 3.1-A | Legal moves/blocked points | 5 | Passed | `apps/api/src/backgammon-rules.test.ts`: legal moves for both sides and blocked-point rejection; Flutter engine tests cover legal/illegal moves. Exact-head PR #204 API run [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379), Flutter run [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332), and backgammon audit [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed. |
| 3.1-B | Dice/doubles/four-dice sequences | 5 | Passed | API/mobile tests cover maximum dice use, doubles as four dice, higher-die priority and sequential two-die moves; exact-head PR #204 API/Flutter/backgammon audit runs [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379), [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332), [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed. |
| 3.1-C | Hits/blots | 5 | Passed | API batch-move test and Flutter audit prove hitting a single opposing blot transfers that checker to the bar; exact-head PR #204 API and backgammon audit runs [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) and [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed. |
| 3.1-D | Correct-side bar entry | 5 | Passed | API and Flutter tests verify mandatory bar entry, correct entry direction for both players, blocked-entry rejection and hitting on entry; exact-head PR #204 API/Flutter/backgammon runs passed: [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379), [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332), [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383). |
| 3.1-E | Bearing-off exact/overshoot priority | 5 | Passed | API/mobile regressions verify exact and oversized bear-off, prohibit bearing off outside the home board or with a checker on the bar, and require the nearest eligible occupied lower point rather than skipping a closer checker; exact-head PR #204 API/Flutter/backgammon runs passed. |
| 3.1-F | Turn transitions | 5 | Passed | API/mobile tests cover multi-die sequences, maximum usable dice, blocked bar-entry pass, turn completion when no die remains, and terminal-state rejection; exact-head PR #204 API/Flutter/backgammon runs passed. |
| 3.1-G | Malformed state fails closed | 5 | Passed | API rule tests reject malformed board counts, invalid bar/off counters, missing checkers, sparse arrays, impossible dice lengths, invalid dice and null higher-die moves without mutating state; exact-head PR #204 API build/unit and backgammon audit passed. |
| 3.1-H | Mirrored host/guest regression | 5 | Passed | Mirrored positive/negative player tests verify direction, bar-entry and nearest-checker bear-off rules; server temporary-AI tests also verify guest-direction legal moves and guest bar entry. Exact-head PR #204 API/Flutter/backgammon audit passed. |
| 3.1-I | Independent rules audit | 5 | Passed | Independent `Backgammon engine and AI tests` workflow [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed; audit suite includes deterministic seeded play, legal-move invariants, 15-checker inventory preservation, dice validity, bar entry, hits and bear-off regressions. |
| 3.2-A | Approved visual design | 5 | Pending | Not audited |
| 3.2-B | Shared online/offline board | 5 | Passed | `apps/mobile/lib/royal_backgammon_board.dart` is the shared visual board used by offline practice and the online wrapper in `apps/mobile/lib/online_match_screen.dart`. Flutter widget tests exercise the online board hit targets and the shared rendering path. Exact-head PR #204 Flutter analyze/tests run [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332) passed. |
| 3.2-C | Checker orientation/stack/count | 5 | Passed | `apps/mobile/test/online_backgammon_board_test.dart` verifies all 24 unique opening-point hit targets, outer-side stack orientation, first-checker anchoring and six-checker stack geometry; engine audit verifies all 15 checkers per player remain accounted for after legal moves. Exact-head PR #204 Flutter run [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332) and backgammon audit [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed. |
| 3.2-D | Dice/highlights/player panels | 5 | Pending | Not audited |
| 3.2-E | Responsive Android sizes | 5 | Pending | Not audited |
| 3.2-F | Themes/locales | 5 | Pending | Not audited |
| 3.2-G | Real-device visual acceptance | 5 | Pending | Not audited |
| 3.3-A | Create/join/invite authorization | 5 | Passed | API integration tests create an online match, authorize host-to-friend invitation, expose the invitation only to the invitee, accept it using the canonical room ID, and reject unauthorized/nonparticipant operations. PR #77 exact-head API integration [41185385432](https://github.com/Mrobaei1/Royal-club/actions/runs/41185385432) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.3-B | 60-second expiry | 5 | Passed | API tests verify a new empty room expires within 59–60 seconds, invite freshness is capped at 60 seconds, and notifications older than 61 seconds are removed. PR #77 exact-head API integration [41185385432](https://github.com/Mrobaei1/Royal-club/actions/runs/41185385432) passed. |
| 3.3-C | Cancellation/stale invite rejection | 5 | Passed | Tests verify expired-room invite acceptance returns 410, marks the invite rejected, clears its notification, and leaves room membership unchanged; match cancellation proposals support both rejection and acceptance. PR #77 API integration [41185385432](https://github.com/Mrobaei1/Royal-club/actions/runs/41185385432) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.3-D | Versioning/concurrency | 5 | Passed | Concurrent guest joins serialize to exactly one 200 and one 409; the resulting membership is checked against the successful account. Online commands use expected state versions and stale commands are rejected. PR #78 API integration [41186501241](https://github.com/Mrobaei1/Royal-club/actions/runs/41186501241) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.3-E | Idle cleanup | 5 | Pending | Not audited |
| 3.4-A | Server-authoritative legality/state | 5 | Passed | API integration verifies server-owned match state, denies spectator move/roll commands, rejects malformed persisted boards on read/roll/move, and checks that client commands cannot bypass server rules. PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.4-B | Cumulative dice | 5 | Passed | API integration applies a two-die 2+3 batch atomically, asserts both moves and final board, consumes all remaining dice and advances the turn clock only after the full sequence. PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.4-C | Bar entry/turn integrity | 5 | Passed | API and Flutter engine tests verify mandatory and correct-side bar entry, blocked-entry rejection, bar-first move enforcement, turn completion and clock integrity; exact-head PR #204 API/Flutter/backgammon runs [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379), [42475968332](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968332), [42475968383](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968383) passed. |
| 3.4-D | Reconnect canonical resync | 5 | Passed | Disconnect integration tests verify heartbeat reconnect clears AI takeover, the overdue AI turn is committed before human control returns, and the returning player can issue a legal command against the restored authoritative state. Separate network-change integration verifies the same account recovers the identical active board. PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.4-E | Duplicate/tampered/racing move protection | 5 | Passed | Exact-head PR #229 (`5a24363c3045d28f97f58a1137807cd5bc1fe695`) API integration test races two identical batch move submissions with the same expected state version and asserts exactly one 200 and one 409. Existing server integration also rejects corrupt persisted board state, stale/duplicate winning moves, and ensures replay cannot award duplicate XP. PR #229 API integration, API build/tests, Flutter analyze/tests and backgammon audit all passed before merge. |
| 3.5-A | Heartbeat/presence | 5 | Passed | Backgammon disconnect integration tests create participant presence records and verify authenticated heartbeats keep the active match lease alive. PR #67 exact-head API integration [41176915070](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915070) and current-main PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.5-B | Lease/grace period | 5 | Passed | Tests verify a fresh heartbeat delays takeover, a 30-second stale heartbeat crosses the configured 18-second default grace, and active heartbeat extends the match lease. PR #67 API integration [41176915070](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915070) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.5-C | Temporary AI legal turn | 5 | Passed | Unit/integration tests verify legal maximum-dice AI turns, bar-entry priority, blocked-entry pass, higher-die rule, guest direction, corrupt-state refusal and one-time turn completion. PR #67 exact-head backgammon/API checks [41176915022](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915022) and [41176915070](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915070) passed. |
| 3.5-D | Reconnect handback | 5 | Passed | Integration tests verify reconnect heartbeat clears `takeoverActive`, processes an overdue turn before restoring presence, and allows the returning human to roll using the refreshed state version. PR #67 API integration [41176915070](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915070) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.5-E | Expiry/race/duplicate prevention | 5 | Passed | Integration tests verify stale human requests are fenced, concurrent state polls commit exactly one AI turn/state-version increment, and no-legal-move takeover passes once. The API serializes takeover under the match-row lock. PR #67 API integration [41176915070](https://github.com/Mrobaei1/Royal-club/actions/runs/41176915070) and PR #204 API integration [42475968379](https://github.com/Mrobaei1/Royal-club/actions/runs/42475968379) passed. |
| 3.6-A | Single-game resignation | 5 | Passed | API integration tests cover game-scope resignation, invalid scope, nonparticipant denial, board/turn/dice reset and result consistency. Exact-head PR #58 API integration [41019744686](https://github.com/Mrobaei1/Royal-club/actions/runs/41019744686) passed. |
| 3.6-B | Match surrender | 5 | Passed | API integration tests cover match-scope surrender, winner/result recording, duplicate-request rejection and the PostgreSQL transaction fix. Exact-head PR #58 API integration [41019744686](https://github.com/Mrobaei1/Royal-club/actions/runs/41019744686) passed. |
| 3.6-C | Confirm/cancel UX; Winner/result consistency; Idempotent repeat requests | 5 | Pending | Not audited |
| 3.7-A | Offline training isolation | 5 | Passed | Source audit: `apps/mobile/lib/engine_backgammon_screen.dart` explicitly defines an engine-connected local screen with no network/account requirement and imports only the local `BackgammonEngine`/`BackgammonAI` for training; it has no API transport, match, progression, wallet, XP or Elo service calls. `BackgammonEngine` state is limited to board/checkers/bar/bear-off/dice/turn/terminal state. Exact-head PR #227 Flutter tests passed and merged as `00936a98ae4aaefae17b5ee31d004d344ef50648`. |
| 3.7-B | Local AI/two-player | 5 | Pending | Not audited |
| 3.7-C | Restart/exit reset; No online-state mutation; No online XP/Elo | 5 | Passed | PR #227 verifies offline restart restores the initial board and clears bar/off/dice/terminal state; exact-head Flutter test passed and merged as `00936a98ae4aaefae17b5ee31d004d344ef50648`. PR #243 adds navigation-level exit/reopen coverage and verifies a fresh local engine/initial board after leaving training; exact-head Flutter analyze/tests run `129012010178` and backgammon engine audit `129012009311` passed, merged as `72cde2b1564863a14c7b3b3d96fb1361581414b0`. Source audit confirms the offline screen/engine/AI have no account, network, match, progression, wallet, XP or Elo dependency. (2026-11-09) |
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
| 4.1-A | Username search/privacy | 5 | Passed | Exact-head PR #230 (`05f60c75bf094120e1a4db571f69315d2c664b43`) verifies authenticated username search returns the requested account while omitting full name, email and phone. API integration, API build/tests, Flutter analyze/tests and backgammon audit passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.1-B | Friend request lifecycle | 5 | Passed | Exact-head PR #230 verifies request creation, duplicate-request rejection, incoming inbox visibility, concurrent accept with exactly one commit, and reciprocal friend lists. All exact-head CI checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.1-C | Remove/race handling | 5 | Passed | Exact-head PR #230 verifies concurrent accept is serialized exactly once, friend removal updates both users' lists, and repeated removal returns 404. All exact-head CI checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.1-D | 100-friend cap | 5 | Passed | Existing exact-head integration test seeds 99 accepted friends, races two pending acceptances, asserts exactly one 200/one 409 and a final count of exactly 100, then rejects another request over the limit. PR #230 exact-head API integration suite passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.2-A | Audience authorization | 5 | Passed | Exact-head PR #230 verifies accepted friends can send/read private text while an unrelated account receives 403 for history and send attempts; image audience denial is also asserted. All exact-head CI checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.2-B | Text delivery | 5 | Passed | Exact-head PR #230 verifies a friend-sent private message is persisted and returned in the conversation history for the participant. API integration and all other exact-head checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.2-C | Image authorization | 5 | Passed | Exact-head PR #236 (`64132a3e116ee96a8ced994e864cb75e35b6e2a4`) verifies an accepted friend can send a supported PNG data URL and retrieve it from private-chat history. PR #230 separately verifies an unrelated account receives 403 when attempting image send. API integration, API build/tests, Flutter analyze/tests, backgammon audit and web preview checks all passed before PR #236 merged as `c0e123843e89cf42549a62db028be62d66c7adc0`. |
| 4.2-D | Emoji | 5 | Passed | Exact-head PR #230 sends Persian text with multiple Unicode emoji and verifies the exact content round-trips through private-chat history. API integration and all other exact-head checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.2-E | Edit/delete; no calls; voice disabled | 5 | Passed | Exact-head PR #237 (`7f4d8e8786d501cc3314f5ce3f6c64b31efa6ccc`) verifies only the original sender can edit a message, delete-for-both replaces the content for both participants, delete-for-me hides only the requesting participant's copy, and unrelated accounts cannot edit/delete another pair's messages. API integration, API build/tests, Flutter analyze/tests and web preview checks passed before merge (`253a3bc44dc2a0bb0128acc91beb4db767cbe589`). Source audit of `apps/mobile/lib/chat_screen.dart`, `apps/mobile/pubspec.yaml`, API routes and current dependency/file inventory confirms no live voice/video call, microphone, WebRTC, TURN or media-signalling feature; chat exposes text/image/emoji only and future voice messages remain disabled/deferred. |
| 4.3-A | Recipient targeting | 5 | Passed | Exact-head PR #230 verifies friend-request notifications are visible to the intended recipient, unrelated system notifications remain scoped to their own account, and an unrelated user's inbox does not expose another recipient's rows. API integration and all other exact-head checks passed before merge (`7feee98b6ef9307379040a94d60d4c1f3e677afb`). |
| 4.3-B | Localized read/unread lifecycle | 5 | Passed | API integration verifies per-notification read handling and account-scoped read-all behavior without mutating another user's rows. `apps/mobile/lib/notifications_screen.dart` renders unread/read states, unread count, Persian/English actions, directionality and localized title/body; `apps/mobile/test/notifications_localization_test.dart` verifies friend-request, friend-accepted and match-invite translations. Exact-head PR #230 Flutter/API integration checks passed before merge. |
| 4.3-C | Clear-all isolation and Android acceptance | 5 | Pending | API clear-all isolation is covered: clearing one account leaves another account's notifications intact. Physical Android notification-screen acceptance is not evidenced yet and remains required before this criterion can pass. PR #230 exact-head integration [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. |
| 4.4-A | Host permission | 5 | Passed | Integration verifies the host explicitly enables/disables spectators; after disabling, the spectator snapshot is denied. PR #230 merged; [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 4.4-B | Friend/follower and active-match eligibility | 5 | Passed | A non-friend cannot see the live match; after accepted friendship, the same user can see the active match and read its spectator snapshot. PR #230 merged; [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 4.4-C | Finished restriction/no replay | 5 | Passed | Spectators cannot submit game moves; after the match is marked finished, the spectator snapshot returns 404 and the match is not replayable through the spectator route. PR #230 merged; [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 4.5-A | Username-only public identity | 5 | Passed | Exact-head integration asserts username-only projections in user search, friend lists, chat conversations, spectator snapshots, match history and leaderboard; full names/private email are absent. PR #230 merged; [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. PR #240 extends safe public labels to online lobby/match/spectator screens. (2026-11-09) |
| 4.5-B | Legacy/empty profile audit | 5 | Passed | Shared public-identity helper and Flutter regressions cover null, empty, whitespace and non-string legacy usernames with neutral localized fallback across Friends, Chat, Leaderboard and Hokm. PR #218 merged; exact-head Flutter run [42487475637](https://github.com/Mrobaei1/Royal-club/actions/runs/42487475637) passed. PR #240 applies the same fallback to online lobby, online match and spectator screens; exact-head Flutter run [42570901549](https://github.com/Mrobaei1/Royal-club/actions/runs/42570901549) passed. (2026-11-09) |
| 4.5-C | No private identity leak/regression | 5 | Passed | JWT-subject self-profile isolation plus public search/friend/chat/spectator/history/leaderboard assertions prevent full name, email and phone leakage. PR #214 API run [42486935392](https://github.com/Mrobaei1/Royal-club/actions/runs/42486935392) and PR #230 [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed; PR #240 preserves username-only public labels in lobby and match surfaces. (2026-11-09) |
| 4.6-A | Avatar rules | 5 | Passed | API rejects MIME spoofing, malformed and over-650-KiB images; accepts valid PNG, supports clearing, keeps first avatar free and applies owner-configured subsequent pricing with ledger entries. PR #230 [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 4.6-B | Username edit policy | 5 | Passed | API validates username format/reserved owner identity; integration verifies owner-managed change price, successful rename, unchanged-name zero charge and ledger debit. PR #230 exact-head API integration `42569680272` passed; PR #242 adds short/invalid/duplicate username tests and same-IP per-account rate-limit isolation, merged as `4ec23be3f6bf0f5b1ddc795cc6fe71411577facc`; exact-head API integration `129010484614` and API build/tests passed. (2026-11-09) |
| 4.6-C | Private account details | 5 | Passed | Self-profile returns private fields only for the authenticated JWT subject; public/social projections omit another user's email/full name/phone. PR #230 [PR #230 exact-head API integration 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 4.7-A | Persian RTL | 5 | Passed | Static UI audit includes Friends, Chat, Notifications and Leaderboard; localization widget test asserts Persian RTL. Owner-confirmed Persian RTL Android check recorded 2026-11-04; exact Flutter validation [run 42487826939](https://github.com/Mrobaei1/Royal-club/actions/runs/42487826939) passed. (2026-11-09) |
| 4.7-B | English LTR | 5 | Passed | Static UI audit includes social screens; localization widget test asserts English LTR. Owner-confirmed English LTR Android check recorded 2026-11-04; exact Flutter validation [run 42487826939](https://github.com/Mrobaei1/Royal-club/actions/runs/42487826939) passed. (2026-11-09) |
| 4.7-C | Themes/layout/accessibility device test | 5 | Pending | Bilingual source and widget coverage exists, but a dedicated real-device matrix for themes, layout overflow and accessibility has not been recorded. Keep pending until device acceptance is supplied. |

### 5.0 Wallet, progression, leagues

| WBS criterion | Acceptance criterion | Points | Score | Evidence |
|---|---|---:|---:|---|
| 5.1-A | Non-transferable credits | 5 | Passed | Integration attempts `POST /api/v1/wallet/transfer`, receives 404, and verifies neither sender nor recipient balance changes and no wallet ledger rows are created. Merged PR #241; exact-head API integration [run 42571306114](https://github.com/Mrobaei1/Royal-club/actions/runs/42571306114) passed. (2026-11-09) |
| 5.1-B | Auditable ledger | 5 | Passed | Wallet history exposes transaction ID, amount, balance-after, type, description and timestamp; subscription purchase tests verify exact debit and resulting balance, while concurrent purchase tests assert exactly one ledger debit. Exact-head API integration: PR #231 [run 42569482558](https://github.com/Mrobaei1/Royal-club/actions/runs/42569482558) and PR #230 [run 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 5.1-C | Atomic balance | 5 | Passed | Exact-head PR #231 (`d0853b4087606b12d46d9a6e2e251a37436d1b77`) disposable-PostgreSQL integration test issues two simultaneous 300-credit purchases against a 300-credit balance; asserts one 200/one 409, zero final balance, exactly one -300 ledger debit and balance_after=0. API integration, API build/tests, Flutter analyze/tests and backgammon audit passed before merge. |
| 5.1-D | Idempotent concurrency | 5 | Pending | Not audited |
| 5.1-E | Owner adjustments | 5 | Passed | Integration verifies owner credit without step-up is denied (403), fresh owner step-up succeeds, and the credited amount/balance-after/type/description are recorded in the audit ledger. Merged PR #241; exact-head API integration [run 42571306114](https://github.com/Mrobaei1/Royal-club/actions/runs/42571306114) passed. (2026-11-09) |
| 5.2-A | Manager plans | 5 | Passed | PR #192 exact head `02dac555352ea0d70e391168272a24cc44c66299`; owner step-up protected create-plan API/UI; API integration run `42230679256`, API build/tests and Flutter analyze/tests run `42230679251` (2026-11-07). |
| 5.2-B | Transactional activation | 5 | Passed | Exact-head PR #231 (`d0853b4087606b12d46d9a6e2e251a37436d1b77`) disposable-PostgreSQL integration test asserts only the winning concurrent purchase creates one active subscription; rejected purchase creates no second subscription. API integration, API build/tests, Flutter analyze/tests and backgammon audit passed before merge. |
| 5.2-C | Expiry/removal | 5 | Pending | Not audited |
| 5.2-D | Server-controlled prices | 5 | Passed | Subscription activation sends forged client `priceCredits=1` and `durationDays=1`; API still charges the configured server plan price (300 credits) and applies its configured 30-day duration. Merged PR #241; exact-head API integration [run 42571306114](https://github.com/Mrobaei1/Royal-club/actions/runs/42571306114) passed. (2026-11-09) |
| 5.3-A | XP policy | 5 | Pending | Not audited |
| 5.3-B | Permanent levels/curve | 5 | Passed | `apps/api/src/player-progression.ts` and `player-progression.test.ts` verify cumulative XP thresholds, level 100 at 79,439 XP, and permanent levels after XP loss; exact-head API validation CI run `43183126874` passed (PR #249, 2026-11-12). |
| 5.3-C | Elo/leaderboard | 5 | Passed | `backgammon-rating.ts`/tests verify zero-sum Elo; PostgreSQL integration asserts 1016/984 rating updates, global and weekly leaderboard results, and exclusion of unfinished/unresolved matches; exact-head integration CI run `43183126917` passed (PR #249, 2026-11-12). |
| 5.3-D | Ties/draws/unfinished matches | 5 | Pending | Not audited |
| 5.3-E | Retry/audit | 5 | Passed | `awardProgression` persists unique `(match_id,event_key,user_id)` events with conflict-safe insertion; integration test verifies two participant events and stale winning-move replay does not award XP twice; exact-head integration CI run `43183126917` passed (PR #249, 2026-11-12). |
| 5.4-A | Manager config | 5 | Pending | Not audited |
| 5.4-B | Entry/minimum participants | 5 | Pending | Not audited |
| 5.4-C | Fixtures/byes/rest fairness | 5 | Pending | Not audited |
| 5.4-D | Results/finals | 5 | Pending | Not audited |
| 5.4-E | Appeals/incidents/reschedule | 5 | Pending | Not audited |
| 5.4-F | Audit history | 5 | Pending | Not audited |
| 5.4-G | Manager UI acceptance | 5 | Pending | Not audited |
| 5.5-A | Free-by-default entry | 5 | Passed | Owner-created league defaults to `entryMode=free` and `subscriptionDaysCost=0`; integration confirms free entry succeeds and wallet balance remains unchanged. PR #230 exact-head API integration [run 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 5.5-B | Dedicated entitlement ledger | 5 | Passed | Subscription-day league entry records one dedicated `league_entitlement_ledger` row with the exact days consumed and before/after subscription expiry. PR #230 exact-head API integration [run 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
| 5.5-C | Exactly-once/no wallet debit | 5 | Passed | Concurrent entries with separate idempotency keys return one created entry and one already-entered result; exactly one entitlement-ledger row is written and wallet balance remains unchanged. PR #230 exact-head API integration [run 42569680272](https://github.com/Mrobaei1/Royal-club/actions/runs/42569680272) passed. (2026-11-09) |
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
- Earned points currently evidenced: **510/1,000 (51.0%)** — 190 points across Phases 1, 2 and 7, 145 points across 29 verified Phase 3 criteria, 110 points across 22 verified Phase 4 criteria, and 65 points across 13 verified Phase 5 criteria. Evidence is linked criterion-by-criterion below. Remaining gates include subscription purchase idempotency, subscription expiry/removal, Android notification acceptance, social theme/layout/accessibility device acceptance, and two-device/Production release gates.
- Remaining criteria: **98 Pending** (490 points not yet earned).
- **Official project percentage: 51.0% (510/1,000 points; 102/200 criteria).** This is the evidence-backed WBS score calculated from the phase roll-up immediately below; it is not a claim that all implementation or release acceptance is complete. Pending subscription purchase idempotency, subscription expiry/removal, Android notification acceptance, social theme/layout/accessibility device acceptance, provider deployment portability, NFR target approval, physical VPN/device acceptance, owner-approved retention and application-level disaster recovery remain open.

## Required evidence record

For each criterion record: `criterion ID | pass/fail/blocked/not tested | exact evidence URL or commit | audit date | reviewer | blocker/owner decision`. A passing criterion is worth exactly 5 points. Re-audit after new commits or manual acceptance and retain prior evidence history.


## Phase 1 architecture/governance audit — 2026-11-08

Eleven criteria passed (55/80 Phase 1 points; 68.75% of WBS 1.0). In addition to the eight prior architecture/governance criteria, 1.2-C (server-authoritative game/economy negative tests), 1.3-A (free-by-default enforcement) and 1.3-C (username-only public identity/privacy) now pass based on exact-head CI and cross-module regression/source evidence. The 2026-10-26 owner decision confirms private chat is available to friends without a subscription, with non-friends blocked; current code and tests match it. Criteria 1.1-B, 1.2-B, 1.3-B and 1.5-A/B remain Pending. Physical VPN OFF/ON testing, legacy/empty-profile device acceptance under WBS 4.5, second-provider portability, owner-approved NFRs/retention, and application-level disaster recovery remain open.


## Phase roll-up — 2026-11-09 (backgammon rules-engine evidence audit)

The following percentages are calculated directly from the 200 criterion rows in this matrix. A criterion earns its full five points only when its status is `Passed`; Pending criteria earn zero. Weights are unchanged.

| WBS phase | Total weight | Passed criteria | Earned points | Progress |
| --- | ---: | ---: | ---: | ---: |
| Phase 1 — Architecture and project management | 80 | 11/16 | 55 | 68.75% |
| Phase 2 | 130 | 22/26 | 110 | 84.62% |
| Phase 3 | 230 | 29/46 | 145 | 63.04% |
| Phase 4 | 120 | 22/24 | 110 | 91.67% |
| Phase 5 | 140 | 13/28 | 65 | 46.43% |
| Phase 6 | 140 | 0/28 | 0 | 0.00% |
| Phase 7 | 160 | 5/32 | 25 | 15.63% |
| **Total** | **1,000** | **102/200** | **510** | **51.00%** |



## Phase 2 OTP/security and logging evidence audit — 2026-11-08

Three Phase 2 criteria now pass (15/130 points):
- **2.2-A Passed:** Iranian phone normalization, salted/digested OTP storage, single-use consumption, expiry, resend cooldown, bounded attempts, per-phone/global daily limits, and production simulator lock are covered by integration tests.
- **2.2-B Passed:** OTP challenges are purpose-bound for register/login/link/reset; cross-purpose use is rejected, registration and login bind to the verified phone, phone linking requires an authenticated account, duplicate ownership is rejected, and unverified profile phone edits are blocked.
- **2.2-C Passed:** SMS provider API keys are encrypted with AES-256-GCM using a server-side 32-byte key; settings endpoints require owner step-up; API responses expose only an `apiKeyConfigured` boolean; tests assert that plaintext and ciphertext fields are not returned. Activation remains disabled.
- Evidence: exact-head API integration run [42478821103](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821103/job/128726055974) and API build/test run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955), on PR #206 head `1446067e28615406dd7ae6121f11a0700ed3c0e0`; source/test files were unchanged by subsequent documentation-only PR #208.
- **2.2-D remains Pending:** live SMS/OTP activation and approved device/provider acceptance are not authorized or evidenced. No SMS was sent and no credentials were activated.


- **2.6-C Passed (5 points):** API logger tests verify request bodies, authorization/cookie/API-key headers, response cookies and query strings are redacted; request serialization uses route templates, omits client IP, and uses server-generated request IDs. Exact-head API unit/build run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955) passed with `logging-config.test.ts` included in `npm test`.


- **2.6-A Passed (5 points):** exact-head API integration tests prove expired, malformed and missing bearer tokens are rejected; logout revokes the current token; password recovery invalidates earlier sessions; and incrementing `users.token_version` invalidates previously issued tokens across both `/api/v1/me` and `/api/v1/friends`, while a fresh login succeeds. Evidence: PR #210 head `f5ab13e7ec13a099a1b59ba1ca09a6c060a0066c`, API integration run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826) and API build/unit run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797), all required checks passed before merge `b99b79b010b0af662909bbac2e669ca958e676a3`.


- **2.1-B Passed (5 points):** registration password validation requires at least six Unicode code points and caps the password at 128 UTF-8 bytes. Unit tests cover five-vs-six characters, Persian and emoji characters, exact 128-byte acceptance, 129-byte rejection, empty and non-string values. Exact-head API build/unit CI passed in PR #210 run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630797); the same source test was also included in PR #206's passing API build/test run [42478821167](https://github.com/Mrobaei1/Royal-club/actions/runs/42478821167/job/128726055955).


- **2.1-A Passed (5 points):** integration coverage exercises registration, authenticated self-profile access, logout, fresh email/password login, and a subsequent authenticated profile round-trip. OTP-based registration/login is also covered in the purpose-bound phone OTP test. Exact-head API integration CI passed in PR #210 run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826).
- **2.1-C Passed (5 points):** integration coverage proves logout revokes the active bearer token, repeated logout is idempotent, a new login restores access, password recovery invalidates all prior sessions, and incrementing `token_version` invalidates existing tokens across protected routes. Exact-head API integration CI passed in PR #210 run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630826).


## Localization evidence audit — 2026-11-08

- **2.4-A Passed (5 points):** Persian and English ARB files declare their correct locales and have identical message-key sets; parity is covered by Flutter tests.
- **2.4-C Passed (5 points):** common service/API errors map to English through `appError`; friend-request, friend-accepted and match-invite notification titles/bodies are translated by notification type and selected language.
- **2.4-D Passed (5 points):** widget tests switch between Persian and English, verify selected-language shared UI text, and assert RTL for Persian and LTR for English.
- Exact-head Flutter analyze/test CI passed on PR #210 head `f5ab13e7ec13a099a1b59ba1ca09a6c060a0066c`, run [42486568179](https://github.com/Mrobaei1/Royal-club/actions/runs/42486568179/job/128749630554). PR #206 also ran the same localization test suite successfully on its exact head.
- **2.4-B remains Pending:** full visible static UI localization across all app screens has not yet been exhaustively audited; no broad completion claim is made.


- **2.3-D Passed (5 points):** integration tests prove caller-supplied foreign `userId` cannot redirect a self-profile update, and private chat is restricted to the two accepted friends. A third account is denied message reads and sends; attempts to edit/delete another pair's messages affect zero rows. Exact-head API integration CI passed on PR #214 head `36b052fedb6a4b6944ad28f94fab91ee42d31fb5`, run [424...](https://github.com/Mrobaei1/Royal-club/actions/runs/42486935392/job/128750743909); the required API, Flutter, backgammon and web checks all passed before merge `7f3505fd2120517221d2d04c8713c3c125a47850`.


- **2.3-B Passed (5 points):** current API integration tests assert that public user search and incoming friend projections expose usernames but omit full name/email, chat conversation projections expose username without full name, and match history does not expose opponent email. Hokm API tests also assert private hands and undealt deck are never returned to unauthorized viewers. Exact-head API integration CI passed on PR #214 head `36b052fedb6a4b6944ad28f94fab91ee42d31fb5`, run [42486935392](https://github.com/Mrobaei1/Royal-club/actions/runs/42486935392/job/128750743909).


- **2.6-B Passed (5 points):** API integration tests prove account-bound login throttling is not bypassed by switching remote addresses: ten failed attempts are allowed, the eleventh returns 429 across two network addresses, and a separate account remains unaffected. The same exact-head integration suite verifies unknown-origin CORS preflights do not receive permission; API configuration has `trustProxy: false`; OTP resend cooldown and daily-limit behavior are also negative-tested. Evidence: PR #216 head `0ccbabd035c0282f86a8f9fc615d1ee964cfeaa9`, integration run [42487192996](https://github.com/Mrobaei1/Royal-club/actions/runs/42487192996/job/128751531735), passed before merge `9fbe93068095ad0f8d6944cbf50576ce7dad2a1e`.


- **2.3-C Passed (5 points):** legacy or blank public usernames now use neutral localized labels rather than private full name/email/phone. A single public-identity helper accepts only the public username field and is used by Friends, Chat, Leaderboard and Hokm screens. Flutter tests cover null, empty, whitespace and non-string legacy values and confirm username-only formatting. Exact-head Flutter CI passed on PR #218 head `ac3908d4aedc4cea6cec5b3659271cc020d54597`, run [42487475637](https://github.com/Mrobaei1/Royal-club/actions/runs/42487475637/job/128752407108); PR #218 merged as `851d5c70af0f58e11ef840a3e50d8393306bbea4`.


## Network-change identity and recovery evidence — 2026-11-08

- **2.7-B Passed (5 points):** API integration tests sign in a user, change the request remote address to a different network/VPN IP and confirm `/api/v1/me` still returns the same authenticated account identity.
- **2.7-C Passed (5 points):** the same account retains its accepted-friend list after a remote-address change and can recover the identical active backgammon match board/state from a different IP. The session remains tied to the verified account, not its IP address.
- Exact-head API integration CI passed on PR #221 head `1591e0498eeea3b2084038d2b554693175374ec8`, run [42487784052](https://github.com/Mrobaei1/Royal-club/actions/runs/42487784052/job/128753337846). Physical Android VPN OFF/ON acceptance remains separately pending under 2.7-A and Phase 1 1.3-B.


- **2.1-D Passed (5 points):** password recovery integration test verifies unknown phone requests do not reveal account existence or trigger a billable SMS, a purpose-bound reset OTP changes the password, the code is single-use, the old password stops working, the new password works, and all previously issued sessions are revoked. The development simulator is used only in tests; live SMS activation remains separately pending under 2.2-D. Exact-head API integration run [42487784052](https://github.com/Mrobaei1/Royal-club/actions/runs/42487784052/job/128753337846) passed.


- **2.3-A Passed (5 points):** API integration test creates two accounts and proves `GET /api/v1/me` returns only the private identity associated with the verified JWT subject. Supplying another user's ID as a query parameter cannot redirect the response; each account receives only its own email, full name and phone. Exact-head API integration run [42487826951](https://github.com/Mrobaei1/Royal-club/actions/runs/42487826951/job/128753465486) passed on PR #222 head `619742db619a8009d8cf849e902cc08e5671ea8a`; merged as `6677e8da9b41cfa00a8450aa2a3c0db021e59838`.


- **2.4-B Passed (5 points):** screen-by-screen static UI audit covered Main/auth, Account, Admin, Friends, Chat, Leaderboard, Notifications, Online Lobby/Match, Wallet, Owner Analytics, Spectator, Backgammon, Manch offline/online, Hokm/manager review, UNO online, and Chess lobby/game/admin/profile. User-visible static labels and prompts use bilingual `appText`, screen-local `t/_text/_t`, or explicit Persian/English locale branches. Language names and usernames are intentionally data values, not untranslated UI. ARB parity and locale-switch/RTL-LTR widget tests pass. Exact-head Flutter analyze/widget CI passed on PR #222 head `619742db619a8009d8cf849e902cc08e5671ea8a`, run [42487826939](https://github.com/Mrobaei1/Royal-club/actions/runs/42487826939/job/128753465277).

- Additional dynamic-error coverage merged in PR #224: invalid match-room ID and UNO sign-in, user-ID, configuration, signature and service-origin errors now translate through the shared English/Persian error mapper; Flutter regression tests cover both locales.


## Phase 5 progression evidence audit — 2026-11-12

Three criteria are newly passed after source, unit-test and PostgreSQL integration review:

- **5.3-B — Permanent levels/curve:** the XP curve is cumulative and levels are permanent. The unit tests verify the configured level-100 threshold (79,439 XP), boundary behavior, and that a quit penalty cannot reduce a stored level.
- **5.3-C — Elo/leaderboard:** the Elo update is zero-sum and tested across rating gaps. Integration coverage verifies server-side rating updates, leaderboard projections, weekly scoring, and exclusion of unfinished or winner-ambiguous matches.
- **5.3-E — Retry/audit:** progression events have a database uniqueness key per match/event/player and are inserted with conflict-safe semantics. Integration coverage verifies exactly one event per participant and no duplicate XP after replaying a stale winning move.

Exact-head evidence: PR #249 commit `8213864977b57b73e88bc0bad49f976631b662f2`; API validation run `43183126874` and PostgreSQL integration run `43183126917` both passed. The criteria **5.3-A** (complete policy coverage including resignation integration) and **5.3-D** (ties/draws/unfinished outcomes) remain Pending. This audit does not claim offline device acceptance or production release readiness.

## Phase roll-up — 2026-11-12

| WBS phase | Total weight | Passed criteria | Earned points | Progress |
| --- | ---: | ---: | ---: | ---: |
| Phase 1 — Architecture and project management | 80 | 11/16 | 55 | 68.75% |
| Phase 2 | 130 | 22/26 | 110 | 84.62% |
| Phase 3 | 230 | 29/46 | 145 | 63.04% |
| Phase 4 | 120 | 22/24 | 110 | 91.67% |
| Phase 5 | 140 | 13/28 | 65 | 46.43% |
| Phase 6 | 140 | 0/28 | 0 | 0.00% |
| Phase 7 | 160 | 5/32 | 25 | 15.63% |
| **Total** | **1,000** | **102/200** | **510** | **51.00%** |

