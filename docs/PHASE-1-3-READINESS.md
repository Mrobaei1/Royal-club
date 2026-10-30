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
- [ ] Complete the approved manager/assistant/agent permission matrix and supported operational scopes. Do not create/activate identities or assign grants without the manager's explicit decision. `OWNER_USER_ID` remains the numeric root-owner configuration and is currently absent from the deployment metadata reviewed. See `docs/FUTURE-AGENT-TEAM-CHARTER.md`, `docs/FUTURE-AGENT-PERMISSION-MATRIX.md`, and issue #24.

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
- [x] PR #58 added integration tests for game-scope and match-scope resignation, invalid scope, non-participant access, board/turn/dice reset, winner recording, and repeat-resignation rejection. The test exposed and fixed a PostgreSQL bigint/text CASE-expression bug in the game-resignation path.
- [ ] Complete full online-match acceptance on two independent accounts/devices: invite expiry, notification lifecycle, server-authoritative legal/cumulative moves, bar entry, surrender/cancel, reconnect, and host re-invitation.
- [ ] **Temporary AI takeover is under implementation on `feature/backgammon-disconnect-ai-takeover`; it is not yet in `main`.** The branch adds heartbeat/presence tracking, an 18-second default backgammon grace period, owner-authenticated policy configuration, server-side legal AI turns, reconnect handback and concurrency fencing. Unit/integration CI and two-device acceptance are still pending. See `docs/ONLINE-DISCONNECT-AI-TAKEOVER.md`. Card and chess execution remain future integrations; their policy defaults are recorded separately.
- [ ] Verify invitation expiry, notification lifecycle, and physical room cleanup while the serverless function is idle. The protected cleanup endpoint exists, but no scheduled Neon trigger is configured.
- [x] API regression tests cover username-only public payloads and no full-name/email exposure in friend search/list, match history, leaderboard, and spectator views.
- [ ] Finish a manual username-only audit across every screen/API, including empty or legacy profiles.
- [ ] Verify theme and language behavior on every screen, not only the screens covered by widget tests.
- [ ] Run a real VPN-on/VPN-off test using the same account.
- [ ] Complete accessibility, layout, and performance checks on Android devices of different screen sizes.

### Final release gate

- [x] API build/unit/integration tests, Flutter analyze/tests, and backgammon engine audit passed on PRs #55, #56, and #58.
- [x] PR #58 integration run passed all 14 API integration subtests, including the new resignation test. PR #58 also passed API build/unit tests, Flutter analyze/tests, and the backgammon engine audit.
- [x] Production health workflow checked the currently deployed API and database connectivity successfully (run 41019644950). This verifies deployment 79 only; it does not prove latest source or new schema is live.
- [ ] Deploy latest API source through the manual-only Neon release workflow after owner configuration and migration review.
- [ ] Reconcile the production database schema with the 30 tables defined by current API source; 17 were absent from the live production branch at the 2026-10-30 audit.
- [ ] Configure and verify the scheduled Neon trigger for expired-room cleanup after the cleanup endpoint is deployed.
- [ ] Complete owner-approved production security configuration, including confirmed numeric owner identity and SMS encryption key only if live SMS is being enabled.
- [ ] Implement and test the online disconnect/temporary-AI takeover feature with manager-configurable grace periods.
- [ ] Complete manual Android/device/network acceptance and owner sign-off.
- [ ] No APK is built until the owner explicitly authorizes the final build.

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

### Production API status — distinguish deployed from merged code

- Neon Function `royalclubapi` remains on deployment ID `79`, created 2026-10-27. Its current environment metadata lists only `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NEON_FUNCTION_RUNTIME`, and `NODE_ENV`.
- `OWNER_USER_ID` and `SMS_CREDENTIALS_ENCRYPTION_KEY` are absent from that deployment's environment metadata. Owner-only operations therefore remain fail-closed; production SMS authentication remains disabled.
- The production branch currently exposes 13 application tables, while current API source defines 30. The 17 missing tables are: `sms_otp_settings`, `sms_otp_audit_log`, `sms_otp_challenges`, `admin_permission_settings`, `admin_permission_grants`, `admin_permission_audit_log`, `agent_task_definitions`, `agent_task_proposals`, `agent_task_audit_log`, `leagues`, `league_entries`, `league_entitlement_ledger`, `league_admin_audit_log`, `league_rounds`, `league_matches`, `league_appeals`, and `backgammon_progression_events`.
- The production Neon branch has no scheduled triggers. Expired-room cleanup is therefore not scheduled while the serverless function is idle.
- The production project's database IP allowlist is empty. Review this as part of production security acceptance; do not change it without checking actual API connectivity requirements.
- Read-only function-log review (100 recent records from the last 24 hours) found 16 repeated `pg-connection-string` TLS-alias security warnings and no other ERROR-level application messages in that sample. PR #56 normalizes legacy `sslmode` aliases to `verify-full` in source, but deployment 79 has not received that code.
- PR #58 also fixes the game-resignation SQL type error in source. Deployment 79 has not received this fix either.
- The manual-only deployment workflow includes build/tests, bundle verification, Neon deployment, health checks, and registration/profile/friend smoke tests. It was not dispatched during this work.
- No APK was built. Android APK generation remains manual-only and requires explicit build approval.

These checks distinguish source correctness, automated CI, and the currently deployed service. A green CI run or successful health check against deployment 79 does not establish that the newest API source, new schema, owner controls, OTP, or agent UI are live in production.

## Current decision

**Repository-side changes and automated checks have progressed, but Royal Club is not release-ready.** PR #55 restored the dormant owner agent-review UI; PR #56 fixed the PostgreSQL TLS alias warning in source; PR #58 fixed a real resignation SQL bug and added integration coverage. All three are merged.

The main remaining product feature gap is online disconnect handling with a temporary server-side AI substitute and manager-configurable wait periods. Remaining release blockers also include production API/schema rollout, confirmed owner configuration, trigger scheduling, live OTP decision, two-device game acceptance, manual RTL/LTR and theme checks, monetization/league acceptance, VPN testing, and final owner sign-off.

Do not activate agent identities, delegated grants, schedules, paid features, real SMS, production deployment, or APK generation without the corresponding explicit owner approval.


## Checkpoint verification — 2026-10-30 (main HEAD `6ef1cbe2faeb21157dff58bedc2848b22f6db238`)

All workflows triggered for this exact main commit completed successfully:
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158741): Flutter analyze/tests and API build/tests passed.
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158762): Flutter analyze/tests, API build/unit/integration tests passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158729): build and deploy jobs passed.
- [Royal Club Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/41020158752): currently deployed API/database health check passed; this does not establish that latest source is deployed.

The four workflow job sets were inspected; all jobs were completed successfully. The open-PR list was empty at this checkpoint. See [canonical project checkpoint and new-chat handoff](PROJECT-CHECKPOINT-2026-10-30.md) for merged PR summary, production audit snapshot, unresolved release gates, product decisions, and continuation protocol.
