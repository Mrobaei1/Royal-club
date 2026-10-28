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

- [ ] Production phone/SMS OTP is not implemented. The first settings foundation is present on this branch, but the complete task remains open: OTP challenge storage/verification, dev-only simulator lifecycle, provider adapter, test-connection/test-message flow, complete owner settings and localization, rate limits, and tests remain. SMS must remain disabled by default. Existing authentication must remain available while disabled; do not migrate accounts or enable real SMS without explicit owner approval. See `docs/SMS-AUTH-ADMIN-CONFIG.md`.
- [ ] Persian and English are the only required languages. The localization audit initially found only 24 keys in each ARB file; the current branch has expanded both files to 54 matching keys and hard-coded user-facing text across main, account, admin, backgammon, wallet, friends, chat, notifications, lobby, match, spectator, and leaderboard screens. A partial localization pass now covers common labels and dialogs across several screens and includes tests for the shared text/error helper. Remaining hard-coded strings still need a complete audit; verify Persian RTL and English LTR across all flows, run Flutter generation/analyze/tests, and manually review the app on devices. See `docs/PHASE-1-LOCALIZATION-AUDIT.md`. No additional languages are in the current scope.
- [ ] Complete security closure: a source-level review is recorded in [`docs/PHASE-1-SECURITY-REVIEW.md`](./PHASE-1-SECURITY-REVIEW.md), but production configuration verification, negative authorization/token tests, live deployment checks, and remediation of the RBAC/OTP/localization findings remain open.
- [ ] Owner-only operations use the numeric `OWNER_USER_ID` environment setting. A complete role/permission management system for administrators, assistants (planned ceiling up to 50), and future agents is not implemented. The system manager will decide later whether and when to create identities, assign responsibilities, and grant permissions. Do not create or activate identities, assign roles, or enable agent automation based on planning documentation alone. Follow `docs/FUTURE-AGENT-TEAM-CHARTER.md`. The detailed proposed permission matrix and deposit-verification safety workflow are in `docs/FUTURE-AGENT-PERMISSION-MATRIX.md`; implementation is tracked in GitHub issue #24. These documents do not grant live permissions.

### Phase 2 — wallet, subscriptions, ranking

- [x] CI integration test passed for wallet debit, insufficient balance, subscription activation, active-subscription lookup, and ledger consistency.
- [x] Integration test passed for denying a normal user permission to credit a wallet. Owner plan/credit controls still need broader end-to-end acceptance testing.
- [ ] Confirm the initial monetization policy end-to-end: games and social features remain free unless the owner explicitly enables charges. Verify that subscription and league-entry rules match the configured product policy; league-entry/subscription-day behavior still needs acceptance testing.
- [ ] Verify ranking/weekly score behavior against agreed examples, including draws/unfinished games and rating updates.

### Phase 3 — game and social experience

- [ ] Finish full online-match acceptance testing on two independent accounts/devices: server-authoritative board state, legal/cumulative dice moves, bar entry, surrender/cancel flows, reconnect, and temporary AI takeover.
- [ ] Verify invite expiry and notification lifecycle on a running service, including expired-room cleanup after an idle period and host re-invitation.
- [ ] Exercise username-only display across every screen/API, including empty or legacy profiles; no public UI may fall back to full name or email.
- [ ] Verify theme and language behavior on every screen, not only the screens covered by widget tests.
- [ ] Run a real VPN-on/VPN-off test using the same account. CI headers are useful regression tests but do not replace a real network test.
- [ ] Complete accessibility, layout, and performance checks on Android devices of different screen sizes.

### Final release gate

- [x] Latest recorded PR-head workflows passed for commit `b6be07b4ba85ca31b4114f39c04c8826a4f152fe`: API build/unit tests, API integration tests, Flutter analysis/tests, backgammon engine audit, and web preview build.
- [ ] Production API/database health is checked against the actual deployment, not a mocked or skipped step.
- [ ] Manual end-to-end acceptance checklist is signed off.
- [ ] No APK is built until the owner explicitly authorizes the final build after the above criteria are met.

## Latest automated verification

The following GitHub Actions runs completed successfully for PR #23's head commit `b6be07b4ba85ca31b4114f39c04c8826a4f152fe`:

- `Validate Royal Club` run 789: API build/tests, API integration tests, Flutter analyze/tests — passed.
- `Royal Club validation` run 354: API build/tests and Flutter analyze/tests — passed.
- `Backgammon engine audit` run 109: engine/AI tests and board interaction regression tests — passed.
- `Royal Club Web Preview` run 875: API build/tests, Flutter analyze/tests, web preview build and artifact upload — passed; deployment job was skipped.

These results establish automated build/test success for that commit only. They do not establish production API/database health, email delivery, real VPN switching, or multi-device manual acceptance. The current CI workflow's production endpoint verification and APK build are gated behind an explicit manual dispatch requesting an APK.

## Current decision

**Not ready for Phase 4.** Email verification, complete role/permission management, monetization-policy acceptance, live VPN/device testing, production health checks, and final end-to-end acceptance remain open. Future agent responsibilities are documented as planning only; no identities, permissions, or automations are activated by that documentation. This checklist must be updated again after the next code changes and CI runs; passing CI alone does not close product acceptance items.
