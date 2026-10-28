# Royal Club — Phase 1–3 readiness checklist

This checklist is the release gate before starting Phase 4. A green CI run proves only the checks that actually ran; it does not prove production deployment health or real-device behavior.

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

## Still required before Phase 4

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
- [ ] Confirm the initial monetization policy end-to-end: games and social features remain free unless the owner explicitly enables charges. Verify subscription behavior against the configured product policy.
- [ ] **Implementation gap (not only acceptance testing):** no league-entry API or subscription-day entitlement ledger was found in the current API source. Track implementation under [Issue #26](https://github.com/Mrobaei1/Royal-club/issues/26): server-side league rules/eligibility, transactional single-use entitlement consumption, duplicate/concurrent retry protection, audit history, and tests. Do not activate paid behavior.
- [ ] Verify ranking/weekly score behavior against the owner's latest agreed scoring model, including wins, losses, draws/unfinished games and rating updates. Current weekly endpoint awards 3 points per win; do not change the point values until the full agreed model is represented in tests.

### Phase 3 — game and social experience

- [ ] Finish full online-match acceptance testing on two independent accounts/devices: server-authoritative board state, legal/cumulative dice moves, bar entry, surrender/cancel flows, reconnect, and temporary AI takeover.
- [ ] Verify invite expiry and notification lifecycle on a running service, including expired-room cleanup after an idle period and host re-invitation.
- [ ] Exercise username-only display across every screen/API, including empty or legacy profiles; no public UI may fall back to full name or email.
- [ ] Verify theme and language behavior on every screen, not only the screens covered by widget tests.
- [ ] Run a real VPN-on/VPN-off test using the same account. CI headers are useful regression tests but do not replace a real network test.
- [ ] Complete accessibility, layout, and performance checks on Android devices of different screen sizes.

### Final release gate

- [x] API build/unit/integration tests, Flutter analyze/tests, and backgammon engine audit passed on PR head `ea97530af955bccf6d3a8af9ae8597066c8dbb61` (GitHub Actions runs 40649094399 and 40649094340).
- [ ] Production API/database health is checked against the actual deployment, not a mocked or skipped step.
- [ ] Manual end-to-end acceptance checklist is signed off.
- [ ] No APK is built until the owner explicitly authorizes the final build after the above criteria are met.

## Latest automated verification

The following GitHub Actions runs completed successfully for merged `main` commit `ed3bc671435a350605d81a2cb87211899d5c4084` on 2026-10-28:

- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/40650172452): API build/unit/integration tests and Flutter analyze/tests — passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/40650172451): API build/unit tests and Flutter analyze/tests — passed.
- [Backgammon engine audit](https://github.com/Mrobaei1/Royal-club/actions/runs/40650172614): engine/AI and board-interaction regression tests — passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/40650172578): API build/tests, Flutter analyze/tests, web release build, Pages artifact upload, and GitHub Pages deployment — passed. The build log confirms it injected the configured API endpoint.

### Production API status — distinguish deployed from merged code

- The Neon Function `royalclubapi` is deployed at `https://br-misty-flower-bavs47dm-royalclubapi.compute.c-8.eu-central-1.aws.neon.tech`, deployment ID `79`, status `completed`.
- [Deploy run 40570281878](https://github.com/Mrobaei1/Royal-club/actions/runs/40570281878) passed the deployed API health check and the six-character registration/login smoke test on 2026-10-27.
- The merged web build uses that same API endpoint; it no longer relies on the temporary GitHub Codespaces URL.
- The merged API source in commit `ed3bc671` has **not** been deployed to Neon yet. The production API deployment workflow is intentionally manual-only. Therefore the CI-tested OTP/phone-auth and other newly added server routes are not claimed as production-live until that release workflow is explicitly dispatched and its health/integration smoke tests pass.
- No APK was built. Android APK generation remains manual-only and requires explicit build approval.

These results prove automated checks and the recorded previous production smoke test only. They do not establish real SMS delivery, real VPN switching, multi-device acceptance, or that the newest merged API source is live in production.

## Current decision

**Not ready for Phase 4.** The code-level OTP/RBAC/localization foundations and automated tests have advanced, but production OTP/account linking, full permission-matrix acceptance, actual deployment/security verification, manual RTL/LTR device review, monetization-policy acceptance, live VPN/device testing, and final end-to-end acceptance remain open. No identity/grant/agent automation is activated by planning documentation alone. This checklist must be updated after the next code changes and CI runs; passing CI alone does not close product acceptance items.
