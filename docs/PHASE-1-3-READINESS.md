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
- [x] Historical PRs #33, #34, #35, #37, #38, #39 and #40 were closed without merge as superseded (PR #40 also duplicated the #38 lifecycle branch). Their 60-second invitation/room lifecycle, server-authoritative XP, shared board, invitation actions, and match-ID validation are represented in the current `main` implementation and its newer integration/regression tests. Do not reopen or merge these stale branches as-is; use current `main` as the source of truth. PR #41 is the integration PR recorded as merged by GitHub metadata.
- [ ] Finish full online-match acceptance testing on two independent accounts/devices: server-authoritative board state, legal/cumulative dice moves, bar entry, surrender/cancel flows, reconnect, and temporary AI takeover.
- [x] Source includes 60-second invite/empty-room expiry and cleanup logic, with room cleanup called on room-list/invite requests and a protected internal trigger endpoint.
- [ ] Verify invitation expiry, notification lifecycle, physical room cleanup while the serverless function is idle, and host re-invitation on the deployed service. The scheduled Neon trigger is not configured because the latest cleanup endpoint has not been deployed to production.
- [x] API regression tests cover username-only public payloads and no full-name/email exposure in friend search/list, match history, leaderboard, and spectator views. Owner-only admin navigation is now hidden from non-owners in the mobile home menu and fails closed when the owner-status check fails.
- [ ] Finish a manual username-only audit across every screen/API, including empty or legacy profiles; no public UI may fall back to full name or email.
- [ ] Verify theme and language behavior on every screen, not only the screens covered by widget tests.
- [ ] Run a real VPN-on/VPN-off test using the same account. CI headers are useful regression tests but do not replace a real network test.
- [ ] Complete accessibility, layout, and performance checks on Android devices of different screen sizes.

### Final release gate

- [x] API build/unit/integration tests, Flutter analyze/tests, and backgammon engine audit passed on PR head `ea97530af955bccf6d3a8af9ae8597066c8dbb61` (GitHub Actions runs 40649094399 and 40649094340).
- [ ] Production API/database health is checked against the actual deployment, not a mocked or skipped step.
- [ ] Manual end-to-end acceptance checklist is signed off.
- [ ] No APK is built until the owner explicitly authorizes the final build after the above criteria are met.

## Latest automated verification

The following GitHub Actions runs completed successfully for merged `main` commit `1a6d3f81242dc61541161cd6fbb457844de0430e` on 2026-10-29:

- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/40960779249): API build/unit/integration tests and Flutter analyze/tests — passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/40960779251): API build/unit tests and Flutter analyze/tests — passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/40960779248): web release build and Pages publish workflow — passed.
- [Royal Club Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/40960779289): the currently deployed API health and smoke checks — passed. This does **not** prove that the latest source commit is deployed.

### Production API status — distinguish deployed from merged code

- The Neon Function `royalclubapi` is deployed at `https://br-misty-flower-bavs47dm-royalclubapi.compute.c-8.eu-central-1.aws.neon.tech`, deployment ID `79`, status `completed`.
- The production health workflow passed, but the deployed function is still behind the latest merged API source. The latest merged source has **not** been deployed to Neon; the deployment workflow is intentionally manual-only.
- The currently inspected deployment metadata does not list `OWNER_USER_ID` or `SMS_CREDENTIALS_ENCRYPTION_KEY`. Owner-only operations therefore remain fail-closed, and production SMS authentication remains disabled. Do not enable real SMS or alter owner privileges as part of an automatic rollout.
- The scheduled Neon trigger for expired-room cleanup is **not configured**. The trigger endpoint exists in source, but it must be deployed and verified before scheduling production calls. No recurring trigger is left enabled against the older deployment.
- No APK was built. Android APK generation remains manual-only and requires explicit build approval.

These results prove automated checks and the health of the currently deployed version only. They do not establish real SMS delivery, real VPN switching, multi-device acceptance, or that the newest API source is live in production.

## Current decision

**Phase 4 UI work has started, but Royal Club is not release-ready.** Remaining gates include production OTP/account-linking approval, final permission-matrix decisions, production deployment/schema/security verification, manual RTL/LTR device review, monetization-policy acceptance, live VPN/device testing, two-device online-match acceptance, and final end-to-end sign-off. No privileged identity/grant/agent automation is activated by planning documentation alone. Do not build an APK until the owner explicitly authorizes the final build.
