# Royal Club — project checkpoint and continuation handoff

**Checkpoint date:** 2026-10-30  
**Repository:** https://github.com/Mrobaei1/Royal-club  
**Default branch:** `main`  
**Verified main HEAD:** `6ef1cbe2faeb21157dff58bedc2848b22f6db238`  
**Checkpoint branch:** `docs/project-checkpoint-2026-10-30`

This document is the canonical handoff for continuing Royal Club work in a fresh conversation. Always re-check the live repository and CI before making changes; this checkpoint is a snapshot, not a claim that all product work is complete.

## 1. Repository and merge state

- PRs #55, #56, #57, #58 and #59 are merged.
- GitHub reports **zero open pull requests** at this checkpoint.
- Main HEAD is commit `6ef1cbe2faeb21157dff58bedc2848b22f6db238` (PR #59).
- Historical PRs #32–40 and #51–52 were previously closed as stale/superseded or otherwise not merged; do not reopen or merge old branches without a fresh diff and justification.
- The checkpoint branch contains documentation-only synchronization; no application behavior is changed by this checkpoint.

## 2. Latest CI verification — main HEAD

All four workflows associated with main HEAD completed successfully on 2026-10-30:

| Workflow | Run | Result |
|---|---:|---|
| Royal Club validation | [41020158741](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158741) | Success — Flutter analyze/tests; API build/tests |
| Validate Royal Club | [41020158762](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158762) | Success — Flutter analyze/tests; API build/unit/integration tests |
| Royal Club Web Preview | [41020158729](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158729) | Success — build and deploy preview |
| Royal Club Production API Health | [41020158752](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158752) | Success — checks currently deployed API and DB connectivity |

The jobs in each of the four runs were inspected and all reported `completed / success`. This confirms automated checks on the exact main commit and a health check of the currently deployed service. It does **not** mean that production runs the latest source or that real-device acceptance is complete.

## 3. Merged changes summarized

- **PR #55:** owner-facing agent task-definition/proposal review UI. Tasks are limited to draft/review semantics; no agent runtime, schedules, or delegated execution grants were activated.
- **PR #56:** PostgreSQL connection TLS alias normalization in source and tests, mapping weaker aliases to `verify-full`.
- **PR #57:** production/readiness documentation refresh.
- **PR #58:** online resignation integration coverage for game/match scopes; fixed PostgreSQL CASE-expression bigint/text assignment bug. The PR integration run reported 14/14 API integration subtests passing.
- **PR #59:** documented that online disconnect presence and temporary AI takeover are not implemented.

## 4. Current verified implementation boundaries

- Flutter Android-first client; Fastify/TypeScript API; PostgreSQL/Neon.
- Backgammon is the current game-development priority; chess and card-game entry points must remain.
- Persian and English only.
- Main includes the shared backgammon board, server-authoritative move handling, invite/room expiry foundations, invitation cancellation, resignation scopes, username-only public payload regression tests, wallet/ledger foundations, social/chat foundations, league foundations, and owner-reviewed agent task proposals.
- These features have differing levels of automated coverage; do not imply every UI flow has passed manual acceptance.
- APK workflow is manual-only. **Do not build an APK until the owner explicitly authorizes it.**

## 5. Production audit findings (read-only snapshot, 2026-10-30)

No production deployment, migration, trigger creation, environment update, SMS activation, or APK build was performed.

- Neon Function `royalclubapi` was still deployment ID `79` (created 2026-10-27) during the audit. The latest source fixes in PR #56 and PR #58 have not thereby been proven deployed.
- Deployment environment metadata included `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NEON_FUNCTION_RUNTIME`, and `NODE_ENV`; `OWNER_USER_ID` and `SMS_CREDENTIALS_ENCRYPTION_KEY` were absent.
- Production branch schema showed 13 application tables while current API source defines 30. The 17 absent tables recorded by the audit were:
  - `sms_otp_settings`, `sms_otp_audit_log`, `sms_otp_challenges`
  - `admin_permission_settings`, `admin_permission_grants`, `admin_permission_audit_log`
  - `agent_task_definitions`, `agent_task_proposals`, `agent_task_audit_log`
  - `leagues`, `league_entries`, `league_entitlement_ledger`, `league_admin_audit_log`, `league_rounds`, `league_matches`, `league_appeals`
  - `backgammon_progression_events`
- No scheduled Neon triggers were configured; expired-room cleanup is not guaranteed to run while the serverless function is idle.
- Database IP allowlist was empty at audit time and needs security review before changing it.
- Recent sampled logs showed repeated TLS alias warnings; source fix is merged but requires a controlled deployment to take effect.
- Production API health workflow success is a check of deployment 79, not proof that the newest main source or schema has been deployed.

**Safety gates:** production deployment/migrations and owner identity configuration require a separately confirmed owner-approved plan. Do not guess numeric `OWNER_USER_ID`. Keep live SMS disabled until separately approved and configured. Do not activate delegated permissions, agent identities, schedules, payments, or moderation automation without explicit approval.

## 6. Highest-priority unfinished work

1. Implement online disconnect presence/heartbeat, per-player disconnect lease, and server-side temporary AI takeover for backgammon. Approved wait policy: manager-configurable; about 15–20 seconds for backgammon/card games; chess may wait until game end. AI must act only for the disconnected player's turn after the grace period, and reconnect must restore human control and stop AI actions. Add integration tests for heartbeat, grace period, AI action, reconnect, race conditions, and lease expiry. This is a feature gap, not a manual QA item.
2. Complete two-account/two-device online match acceptance: invitations/expiry, notifications, server-authoritative legal and cumulative moves, bar entry, surrender/cancel, reconnect, and room cleanup.
3. Reconcile production schema with current source migrations, review deployment 79 versus current main, and deploy only through the manual release workflow after explicit owner authorization.
4. Add/verify scheduled Neon cleanup for expired rooms after endpoint deployment and approved operations setup.
5. Resolve production configuration/security gates: numeric owner ID supplied through the authorized secure path, SMS encryption key only if SMS is approved, host/network controls and secret redaction.
6. Complete manual Android Persian RTL / English LTR, theme consistency, username-only visibility, VPN continuity, accessibility, layout, and performance acceptance.
7. Complete league workflow tests and manager UI acceptance; league entry remains free by default and no league is automatically activated.
8. Reconfirm the phase 4 permission matrix; agent tooling remains dormant and human-approved.

## 7. Product decisions that must survive the chat handoff

- Keep all core games/social features free initially; no monetization unless the owner later enables it.
- Internal non-transferable credit-token wallet; manager-controlled prices. League entry must not directly debit wallet credits; if configured, consume subscription-day entitlement through its dedicated ledger.
- Do not bind login identity to IP/VPN. Phone field must not force a country code.
- Public views expose usernames, not full names or email addresses.
- Friends limit: 100. Private chat initially restricted to friends/active subscribers; image and emoji messages supported.
- No voice/video chat; no replay. Spectator access requires host permission and approved friend/follower status.
- Manager controls league configuration; minimum participants selected by manager and audited; 24-hour appeals; fair bye/rest balance and actual-game reporting; final stage requires format compatibility and explicit manager approval; reschedule where possible for double absence/technical interruption.
- Owner must be notified before any future successor-admin activation. Never grant super-admin based only on a username.
- Do not build APK without explicit approval.

## 8. Continuation protocol for the new conversation

1. Start by reading this file and `docs/PHASE-1-3-READINESS.md`, then verify current main SHA, open PRs, and latest workflow results.
2. Work from a fresh feature branch; inspect current code before editing; add focused tests before or with implementation.
3. Run the relevant API unit/integration tests, Flutter analyze/tests, backgammon engine audit, and web preview checks. Report exact run links and outcomes.
4. Update this checkpoint/readiness document after meaningful milestones and merge only after review and green CI.
5. Never claim background work. Provide truthful progress snapshots when work is actually performed.
6. No production deployment/migration, SMS activation, privileged agent activation, or APK build without the separate approvals described above.

**Next coding task:** implement and test online disconnect/temporary AI takeover on a dedicated feature branch. Do not begin by deploying production.


## Continuation update — 2026-10-30

The next feature is being implemented on the independent branch
`feature/backgammon-disconnect-ai-takeover`. The branch currently contains:
- A pure temporary-AI move selector built on the existing backgammon rules engine.
- API presence/heartbeat storage, owner-authenticated per-game disconnect policies, an 18-second backgammon default, server-side temporary turn processing, reconnect handback and human/AI concurrency fencing.
- Mobile heartbeat requests in the existing online-match refresh cycle and a temporary-AI status notice.
- Unit and integration tests for move selection, grace-period behavior, stale human requests, reconnect and concurrent polling.
- The implementation design and updated readiness note.

**Verification boundary:** these changes are branch-only, not in `main`, not deployed, and not yet CI-verified. The readiness checklist remains open until all branch workflows pass and two-device manual acceptance is completed. Card and chess takeover execution are not included in this backgammon implementation.

No Production deployment or migration, APK build, SMS activation, Agent runtime, delegated grant, paid feature or operational schedule was performed as part of this feature work.
