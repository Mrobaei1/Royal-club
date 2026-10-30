# Royal Club — Execution Roadmap v1.0

- **Date:** 2026-10-30
- **Governing baseline:** Owner-approved WBS v1.0, 1,000 points, seven workstreams, 53 leaf packages.
- **Purpose:** Set the execution order, dependencies, exit gates and working rules for completing Royal Club efficiently.
- **Status:** Owner-confirmed execution order; it does not change WBS scope or weights.

## 1. Execution principles

1. The approved WBS v1.0 remains the single source of truth for scope, weights and progress. This roadmap orders the work; it does not redefine or reweight it.
2. Work in dependency order. Prefer finishing and verifying one coherent slice over opening many parallel, partially completed changes.
3. A task is complete only when implementation, relevant automated tests, review, and required manual/production acceptance evidence are recorded.
4. Every change must be based on current `main`, avoid overwriting newer work, and be delivered in a focused PR.
5. Merge only after exact-head CI is green, diff/review is clean, required approvals are present, and all applicable acceptance gates pass.
6. Keep monetization, real SMS activation, production migrations/deployments, agent execution/schedules, and other privileged external actions behind their separate owner-approval gates.
7. **Do not build or prepare an APK unless the owner explicitly authorizes it.**
8. Do not add daily build checks or background jobs without explicit approval.

## 2. Priority order

### P0 — Establish the control baseline

**WBS:** 1.4, 1.6, 7.1

Tasks:
- Verify and complete the documentation-only WBS v1.0 PR #68: confirm exact diff, current-head CI, review/merge rules, then merge only when all repository rules permit.
- Keep this roadmap linked to the WBS and maintain one evidence ledger for all 53 leaf packages.
- Reconcile current `main`, open PRs, CI status and known blockers before each execution batch.
- Replace provisional progress estimates with an item-by-item evidence audit; do not report an informal estimate as an official WBS score.

**Exit gate:** WBS v1.0 is present on `main`; roadmap is tracked; 53-package evidence ledger has an owner, status, evidence and next action for each package.

### P1 — Close critical backgammon and online-match correctness risks

**WBS:** 3.1–3.7, 3.10, 7.1, 7.7

Tasks, in order:
1. Complete the code/review/CI audit of PR #67 (disconnect presence and temporary AI takeover). Keep it draft until the two-device manual acceptance is recorded; do not merge on green CI alone.
2. Execute two-independent-device acceptance: disconnect, grace-period expiry, legal temporary AI move, reconnect, handback, simultaneous requests/races, and no duplicate turn/result.
3. Fix and verify the online board state/rendering issue; the online board must show server-authoritative match state, not a fabricated or stale board.
4. Verify invite/table lifecycle, including the agreed 60-second expiry when an invitation is not accepted, cancellation and cleanup under serverless idle conditions.
5. Audit and close rules-engine edge cases: doubles/all four dice, combined dice moves, bar entry from the correct side, hits, bearing off, blocked moves and turn completion.
6. Verify online surrender scopes (single game vs match), cancellation, countdown behavior and duplicate-request protection.
7. Verify offline training remains independent of ranking and does not mutate online state.

**Exit gate:** relevant engine/API/mobile tests pass on exact commits; two-device evidence is recorded; no known critical online-state or legal-move defect remains; PRs are reviewed and merged individually.

### P2 — Finish identity, privacy, localization and core social UX

**WBS:** 2.1–2.7, 4.1–4.7

Tasks:
- Verify registration/login, six-character minimum password, session lifecycle and recovery.
- Enforce username-only public identity across profiles, friend lists, chat, leaderboards, match history and spectator views; test legacy/empty profile cases. Full names remain visible only to their owner.
- Complete friend lifecycle and 100-friend API limit.
- Complete chat text/image/emoji flows and notification targeting, including clear-all.
- Complete avatar and username-edit rules without leaking private account data.
- Complete Persian/English navigation and dynamic labels; manually verify RTL/LTR, theme consistency and VPN on/off continuity on real devices.
- Keep voice/video chat out of scope.

**Exit gate:** API authorization/privacy tests pass; Persian and English flows are manually accepted on supported Android layouts; no public surface reveals full name, phone or email.

### P3 — Complete wallet, progression and weekly leagues

**WBS:** 5.1–5.7

Tasks:
- Verify the non-transferable credit-token ledger, idempotency, concurrency and audit history.
- Complete subscription entitlement/expiry and manager-controlled pricing, while paid activation remains disabled.
- Validate XP/levels and Elo/leaderboard behavior with bounded growth, ties, retries, cancellations and edge cases.
- Complete weekly league configuration and lifecycle using the owner-approved decisions: manager-selected minimum participants with audit history; balanced rests/byes and actual game-count reporting; finals dependent on format and manager decision; 24-hour appeals; rescheduling for double absence/technical disruption where possible.
- Ensure league entry consumes the approved subscription-day entitlement exactly once when configured; it must not directly debit wallet credits.
- Manually accept manager-facing interfaces before any live paid behavior is enabled.

**Exit gate:** ledger and entitlement integration tests pass; league scenarios and audit history are verified; owner confirms any activation separately.

### P4 — Secure administration and keep agent capabilities dormant

**WBS:** 6.1–6.8

Tasks:
- Complete mobile/desktop admin UX and verify ordinary users cannot see or access admin functions.
- Establish owner identity through secure configuration; never grant privileges based on username alone.
- Review and test the full manager/assistant permission matrix, scopes, revocation, and 50-assistant ceiling.
- Complete agent task/proposal, approval, audit and status models; keep execution dormant by default.
- Verify kill switch, cancellation, secret redaction and revocation enforcement.
- Keep schedules, outbound actions, role grants, financial actions and agent execution disabled until separately approved by the owner.

**Exit gate:** negative authorization tests pass; owner/assistant permissions are reviewed; privileged execution remains safely disabled absent explicit approval.

### P5 — Production operations, database integrity and resilience

**WBS:** 7.2–7.6, 1.5

Tasks:
- Reconcile source migrations with the live database schema; produce a reviewed migration sequence and rollback/recovery plan.
- Complete API deployment runbook, environment/secret review, CORS/network controls and health/smoke checks.
- Verify expired invite/room cleanup works even when the service is idle/serverless; add observability for failures.
- Complete redacted logging, monitoring, alerts and operational runbooks.
- Implement and test owner-approved backups and restore of one of the latest three recovery points; preserve the agreed 23:59 Asia/Tehran schedule only after configuration review and approval.
- Verify provider portability and disaster-recovery requirements.

**Exit gate:** production changes are owner-approved, migrations are reconciled and recoverable, latest deployed source is verified, cleanup/backup/restore evidence is recorded.

### P6 — Final end-to-end acceptance and release readiness

**WBS:** 3.10, 7.7, 7.8

Tasks:
- Run full regression on two independent accounts/devices and supported Android sizes.
- Verify Persian/English, themes, accessibility, performance, network interruption/recovery, privacy and game flows.
- Review all 53 WBS packages and confirm evidence links and residual blockers.
- Prepare release notes, rollback plan and release candidate checklist.
- Build/test APK only after a separate explicit owner instruction.

**Exit gate:** all mandatory WBS acceptance criteria are complete or have a specifically owner-accepted exception; release approval is recorded. APK remains unbuilt until explicitly authorized.

## 3. Work-in-progress limits and delivery cadence

- Keep no more than **two active implementation PRs** at once, excluding documentation/evidence-only work.
- Keep one primary critical path: P1 gameplay correctness first; start dependent work only when it does not destabilize that path.
- Each PR should address one coherent acceptance outcome, include tests, describe risk and list exact WBS IDs.
- After each merged PR: verify merge SHA, rerun or inspect exact-head checks, update evidence ledger, recalculate only earned points, then select the next task.
- If a task is blocked by external approval or manual device access, record the blocker and proceed only with independent, non-conflicting work.
- Report progress at each completed gate, not as a promise of background work.

## 4. Priority rules for conflicts

When two tasks compete for attention, use this order:
1. Data loss, security/privacy exposure, unauthorized access or incorrect financial/game state.
2. Online backgammon correctness and match integrity.
3. Account, social and localization acceptance.
4. Wallet, progression and league correctness.
5. Admin/agent governance and operational readiness.
6. Cosmetic polish and non-blocking enhancements.
7. Release packaging, which remains approval-gated.

A production or financial risk can supersede the nominal phase order and must be handled first.

## 5. First execution queue as of 2026-10-30

1. **Completed:** PRs #68 and #69 established the WBS v1.0 and execution roadmap on `main`.
2. **Completed:** PR #70 corrected the leaf count to 53 and added the initial evidence ledger; all four exact-head workflows passed. The official numeric score remains pending.
3. **Active:** Audit PR #67 and keep it Draft until code review and two-device acceptance pass. Its documentation now points to the correct code SHA and CI run IDs; verify CI on the latest documentation-updated head.
4. Reproduce the reported online-board symptom on devices and verify the 60-second invite/room expiry, including serverless idle behavior; do not infer production scheduling from source code.
5. Continue P1 rules-engine and online lifecycle acceptance, then move to P2.

This queue was refreshed after PR #70 merged. Re-check live refs and exact-head CI before each implementation or merge decision.

## 6. Change control

This roadmap is version 1.0. It may be reordered to respond to newly discovered critical risks, but WBS scope and weights remain frozen. Any change to product scope, monetization, production activation, permissions, agent execution or APK authorization still requires the owner's explicit decision. Record material roadmap revisions with a dated change log and update the repository evidence.
