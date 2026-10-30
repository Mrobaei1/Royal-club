# Royal Club — Approved Project Work Breakdown Structure (WBS)

- **Baseline:** Owner-approved WBS v1.0
- **Effective date:** 2026-10-30
- **Repository:** https://github.com/Mrobaei1/Royal-club
- **Baseline source:** live `main` at `8359d5253991083dd1be6af91bc847b65ce63b0b`, plus the product decisions and readiness records available on that date
- **Total project weight:** **1,000 points (100%)**
- **Leaf work packages:** **53** (verified by counting the leaf rows in the seven workstream tables; documentation correction only, with no scope or weight change).
- **Leaf package count:** **53** (counted directly from the seven workstream tables; this is a documentation count correction only and does not change scope or weights).
- **Status:** Governing scope and measurement baseline. The initial item-by-item status audit is recorded separately from the weights; no aggregate completion percentage is asserted by this document.

This is the single source of truth for project-wide progress reporting. All future project percentages must be calculated from the leaf work packages and weights below. PR count, commit count, number of files, elapsed time, and subjective impressions are not progress measures.

## 1. Purpose and governance

The WBS decomposes Royal Club from product definition through production readiness. It includes engineering, automated verification, real-device acceptance, operations, and release gates. A feature is not complete merely because code exists or CI is green.

### Change control

1. The weights and scope in v1.0 are frozen as the baseline.
2. A scope change, new feature, removed feature, or weight change requires an owner-approved WBS revision (v1.1, v2.0, etc.) with a dated change log and recalculation impact.
3. Do not silently move weight between work packages to improve the reported percentage.
4. A PR may satisfy part of a work package, but it does not automatically complete that package.
5. Historical branches/PRs superseded by current `main` do not earn progress a second time.

### Completion evidence

A leaf work package can be marked **Complete** only when its listed deliverables and acceptance evidence are satisfied. Evidence must identify the relevant commit/PR, CI run(s), test report, deployment/read-only verification, or manual acceptance record as applicable.

- **Not started:** 0% earned.
- **In progress:** earn only the percentage of explicitly completed sub-criteria, supported by evidence. If the package has no measurable sub-criteria yet, it earns 0% until its acceptance criteria are decomposed.
- **Complete:** 100% earned after every acceptance criterion passes.
- **Blocked:** progress is not increased; record the blocker, owner decision needed, and next action.
- **Accepted exception:** counts only if the owner explicitly accepts the specific residual risk in writing. Record it; do not relabel it as technically complete.

A green workflow only earns the automated-test portion it actually ran. Production health on an older deployment does not prove the latest source is deployed. A source-level localization test does not prove real-device RTL/LTR. A UI screenshot does not prove server authorization or transactional integrity.

## 2. Weight summary

| WBS | Workstream | Weight | Share |
|---|---|---:|---:|
| 1.0 | Product scope, architecture and project governance | 80 | 8% |
| 2.0 | Accounts, onboarding, security foundations and localization | 130 | 13% |
| 3.0 | Games platform and backgammon-first gameplay | 230 | 23% |
| 4.0 | Social, profiles, communication and community experience | 120 | 12% |
| 5.0 | Wallet, subscriptions, progression, ranking and leagues | 140 | 14% |
| 6.0 | Administration, permissions and dormant agent platform | 140 | 14% |
| 7.0 | Infrastructure, production operations, QA and release readiness | 160 | 16% |
|  | **Total** | **1,000** | **100%** |

## 3. Detailed work packages and acceptance criteria

### 1.0 Product scope, architecture and governance — 80 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 1.1 | Product requirements and non-functional requirements are maintained: Android-first, Persian/English, Iran and international use, cost/security/extensibility priorities. | 15 |
| 1.2 | Architecture boundaries are documented and verified: Flutter client, API, PostgreSQL, provider portability, server-authoritative game/economy rules. | 15 |
| 1.3 | Product decisions are traceable: free-by-default policy, no IP/VPN-bound identity, username-only public identity, privacy and game scope. | 15 |
| 1.4 | Project governance is operational: WBS baseline, change control, decision log, evidence links and milestone reporting. | 15 |
| 1.5 | Data lifecycle, privacy, retention, backup/restore and disaster-recovery requirements are documented and approved. | 10 |
| 1.6 | Product roadmap and phase dependencies are reviewed; chess/card games remain in scope while backgammon is the current implementation priority. | 10 |
|  | **Subtotal** | **80** |

### 2.0 Accounts, onboarding, security foundations and localization — 130 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 2.1 | Registration/login, password policy, session lifecycle and account recovery work end-to-end; password minimum is six characters and identity is independent of IP/VPN. | 20 |
| 2.2 | Phone/OTP foundation is tested; real provider activation remains disabled until separately approved and real-device account flows are accepted. | 20 |
| 2.3 | Account/profile editing and privacy rules are enforced server-side; public surfaces never expose another user's full name, phone or email. | 20 |
| 2.4 | Persian and English localization coverage is complete, including validation/errors, dynamic content and navigation labels. | 20 |
| 2.5 | Persian RTL and English LTR are manually accepted on supported Android screen sizes, including dialogs, overflow, navigation and dynamic text. | 20 |
| 2.6 | Security closure: JWT/session negative cases, rate limits, CORS, secret redaction, owner configuration and deployed environment review are evidenced. | 15 |
| 2.7 | Same-account VPN-on/VPN-off continuity is manually verified without changing identity or losing access. | 15 |
|  | **Subtotal** | **130** |

### 3.0 Games platform and backgammon-first gameplay — 230 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 3.1 | Backgammon rules engine is correct and covered for legal moves, dice use/doubles, hits, bar entry, bearing off, turn transitions and edge cases. | 45 |
| 3.2 | Royal backgammon board UI is consistent across offline/online modes: approved visual design, responsive board, dice, checker states, player panels and themes. | 35 |
| 3.3 | Online match lifecycle is server-authoritative: create/join/invite, 60-second invite/empty-room expiry, cancellation, state versioning and safe room lifecycle. | 25 |
| 3.4 | Online moves are validated on the server; cumulative dice moves, legal bar entry, turn/dice integrity, race handling and reconnect state are accepted. | 25 |
| 3.5 | Disconnect handling is implemented and accepted: authenticated heartbeat/presence, per-player lease, configurable grace period, temporary AI legal moves, reconnect handback and race/expiry protection. | 25 |
| 3.6 | Online resignation/surrender works for game and match scopes, with correct confirmation/cancel behavior, winner/result recording and duplicate-request protection. | 15 |
| 3.7 | Offline backgammon training works independently of ranking/progression; restart and local AI/two-player behavior do not corrupt online state. | 15 |
| 3.8 | Chess and card-game entry points remain visible and their agreed MVP flows are implemented without destabilizing backgammon. | 20 |
| 3.9 | Future game extension points (including Uno and Mafia) are architected without requiring a rewrite of core account, lobby or game-service boundaries. | 10 |
| 3.10 | Full game acceptance passes on two independent accounts/devices and supported Android sizes, including network interruption and recovery. | 15 |
|  | **Subtotal** | **230** |

### 4.0 Social, profiles, communication and community experience — 120 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 4.1 | Friend search/add/remove/request lifecycle works by username; maximum 100 accepted friends is enforced by the API. | 20 |
| 4.2 | Private chat works for the approved audience and supports text, images, all supported emoji, edit/delete rules and delivery behavior. No voice/video chat is in scope. | 25 |
| 4.3 | Notifications are correctly targeted, localized, lifecycle-managed and support clear-all without affecting unrelated users. | 15 |
| 4.4 | Spectator access requires host permission and approved friend/follower status; finished-match restrictions apply and replay is not introduced. | 15 |
| 4.5 | Public profile, friend lists, chat, leaderboard, match history and spectator views consistently expose usernames only; audit legacy/empty profiles too. | 15 |
| 4.6 | Avatar, username editing, account details and profile UI follow approved token/free rules and do not leak private identity. | 15 |
| 4.7 | Social UX is manually accepted in Persian/English, light/dark themes and real Android layouts. | 15 |
|  | **Subtotal** | **120** |

### 5.0 Wallet, subscriptions, progression, ranking and leagues — 140 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 5.1 | Internal non-transferable credit-token wallet is server-authoritative with auditable ledger, safe transactions and owner-controlled adjustments. | 25 |
| 5.2 | Subscription plans, activation, expiry and entitlements work transactionally; prices are manager-controlled and client input is never authoritative. | 20 |
| 5.3 | XP/permanent level progression and Elo/weekly leaderboard policies are implemented and verified with examples, retries and result edge cases. | 25 |
| 5.4 | Weekly league lifecycle is complete: manager configuration, formats, participant minimum, fair rest/byes, fixtures/rounds, results, appeals, incidents/rescheduling and audit history. | 35 |
| 5.5 | League entry follows the approved free-by-default policy; if explicitly configured, consumes subscription-day entitlement exactly once via its dedicated ledger and never directly debits wallet credits. | 15 |
| 5.6 | Owner/manager monetization controls are tested end-to-end; all paid behavior remains disabled unless explicitly enabled by the owner. | 10 |
| 5.7 | Manager league and wallet/subscription interfaces are manually accepted in Persian/English before any live activation. | 10 |
|  | **Subtotal** | **140** |

### 6.0 Administration, permissions and dormant agent platform — 140 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 6.1 | Admin experience is usable on mobile and desktop; ordinary users do not see admin navigation or privileged data. | 20 |
| 6.2 | Owner identity is securely established through confirmed numeric owner configuration; no username/email-based privilege assignment. | 20 |
| 6.3 | Manager/assistant permission matrix, scopes, limits (including 50-delegate ceiling), grant/revoke workflows and deny-by-default enforcement are reviewed and accepted. | 25 |
| 6.4 | Agent task definitions/proposals, capabilities, approval requirements, state and audit model are complete while execution remains dormant by default. | 20 |
| 6.5 | Operational controls include auditable actions, secret redaction, emergency kill switch, cancellation and revocation enforcement. | 20 |
| 6.6 | Agent Center categories, monitoring/command UX and status reporting are implemented; external actions require explicit human approval. | 15 |
| 6.7 | Any deposit verification/payment adapter is separately provider-validated, idempotent and human-reviewed; no screenshot-only crediting or automatic approval. | 10 |
| 6.8 | Owner-facing admin/permission/agent UX is manually accepted; no identity, grant, schedule, email automation or financial action is activated without separate explicit approval. | 10 |
|  | **Subtotal** | **140** |

### 7.0 Infrastructure, production operations, QA and release readiness — 160 points

| ID | Work package / acceptance outcome | Points |
|---|---|---:|
| 7.1 | CI is reliable on the exact proposed commit: API build/unit/integration tests, Flutter analyze/tests, engine audit and web preview as applicable. | 25 |
| 7.2 | API deployment is repeatable and manually controlled; latest source is deployed only after owner-approved release and health/smoke verification. | 20 |
| 7.3 | Database migrations are reconciled with source, applied in an approved sequence, verified and have a tested rollback/recovery plan. | 25 |
| 7.4 | Scheduled cleanup for expired rooms/invites is configured and verified for serverless idle periods; failures are observable. | 15 |
| 7.5 | Monitoring, redacted logs, alerting, operational runbooks and owner-approved backup/restore (latest three recovery points) are tested. | 20 |
| 7.6 | Production security/configuration is accepted: network/IP controls, CORS, secrets, owner ID, SMS gates and least privilege. | 20 |
| 7.7 | End-to-end acceptance covers two devices, real network changes, Android layouts, accessibility, performance and regression checklist. | 20 |
| 7.8 | Final release candidate and APK are built/tested only after the owner's separate explicit APK approval; release notes and rollback plan are ready. | 15 |
|  | **Subtotal** | **160** |

## 4. Progress calculation

The project-wide percentage is:

`Progress % = (earned points across all leaf packages / 1,000) × 100`

For each leaf package:

`Earned points = package weight × evidence-backed completion fraction`

Completion fractions must be based on measurable acceptance criteria, not subjective estimates. Where a package has several criteria, split its weight evenly unless a documented sub-weight is more appropriate; record that sub-weight before scoring. Do not award points twice for the same evidence.

### Reporting rules

Every progress report must include:
- WBS version and audit date;
- total earned / 1,000 points and percentage;
- completed, in-progress, blocked and not-started weights;
- phase/workstream breakdown;
- evidence links for newly earned points;
- top blockers and next acceptance gates;
- any owner-accepted exceptions.

A PR merged without its required acceptance evidence may move a package from implementation to verification, but cannot automatically mark the package complete. A failed or cancelled CI run earns no test points. A deployment health check against an older deployment earns no latest-source deployment points.

## 5. Initial baseline status — 2026-10-30

The live repository and readiness documents show substantial implementation and automated coverage, but also material open acceptance gates. In particular:

- Account/password foundations, server-side privacy checks, wallet ledger foundations, friend limits, chat/image-message foundations, league foundations and backgammon engine/UI work have source/test evidence.
- OTP production activation, real-device RTL/LTR, full production security closure, owner identity configuration, ranking edge cases, two-device online acceptance, cleanup scheduling, production schema/source reconciliation and final owner sign-off remain open or require fresh evidence.
- The current `main` readiness checklist explicitly says disconnect/temporary-AI takeover is absent from `main`; PR #67 is an open draft recovery branch and is not counted as merged implementation.
- The 2026-10-30 checkpoint document contains an older main SHA than the live repository. Always prefer live GitHub refs and exact commit evidence over stale checkpoint metadata.
- Agent execution, delegated grants, schedules, real SMS, paid features, production deployment and APK creation remain gated by separate owner approval.

**Baseline scoring rule:** this v1.0 file fixes the scope and weights. The first numeric progress snapshot must be produced by a fresh item-by-item evidence audit against the live commit and latest CI. Do not reuse the earlier informal 45% estimate as a WBS score. Until that audit is complete, report the numeric WBS score as **pending baseline audit**, not as 0% and not as an invented estimate.

## 6. Scope constraints that remain in force

- Android-first; Persian and English; target Iran and international users.
- Backgammon is the current development priority; chess and card games remain in the product.
- All core games and social features are free initially. No monetization or payment activation without the owner's later explicit decision.
- Internal non-transferable credit-token wallet; manager-controlled prices. League entry does not directly debit wallet credits.
- Login identity must not depend on IP/VPN. Public views expose usernames, not full names or email.
- Friends maximum: 100. Private chat is for the approved audience; images and emoji are supported. No voice/video chat and no replay.
- Spectator access requires host permission and approved friend/follower status.
- Weekly league decisions: manager-selected minimum participants with audit trail; fair rest/bye balance and actual game counts; final stage only when format-compatible and explicitly approved; 24-hour appeals; reschedule double absence/technical interruptions where possible.
- Agent tooling stays dormant; no role is granted based only on a username. Financial, role, outbound-message, destructive and production actions require human approval.
- Production deployment/migrations, real SMS activation, paid behavior, agent activation/schedules and APK generation require their separate explicit owner approvals.
- **Do not build or prepare an APK until the owner explicitly asks for it.**

## 7. Revision history

| Version | Date | Change | Approval |
|---|---|---|---|
| 1.0 | 2026-10-30 | Initial project-wide WBS, 1,000-point weighting, evidence rules and baseline audit requirement. | Approved by project owner in conversation; implementation recorded in repository PR. |
