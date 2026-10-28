# Royal Club — Phase 1–3 readiness checklist

This checklist is the release gate before starting Phase 4. A green CI run proves only the checks that actually ran; it does not prove production deployment health or real-device behavior.

## Verified by repository code and automated tests

- [x] Password registration validation rejects passwords shorter than six characters.
- [x] Authentication uses account credentials and does not bind identity to client IP/VPN exit IP.
- [x] Public profile, friend, chat, match-history, leaderboard, and spectator payload tests check that another user's full name is not exposed.
- [x] Wallet credits are stored server-side with a transaction ledger; subscription activation checks available balance and uses a database transaction.
- [x] Non-owner authorization is enforced server-side for owner-only wallet-credit operations.
- [x] Friend limit is enforced by API code at 100 accepted friends.
- [x] Private chat, image-message storage, message editing/deletion, notifications, invitations, live spectators, and finished-match spectator restrictions have integration coverage.
- [x] Backgammon engine audit and Flutter/API CI checks have passed on earlier commits in this PR.
- [x] APK generation is intentionally gated to a manual workflow dispatch with explicit build approval; normal pushes do not create APKs.

## Still required before Phase 4

### Phase 1 — account, security, language

- [ ] Email verification is not implemented in the current registration/login API. Before enabling it, select/configure the transactional sender, verify the sending domain, add deployment secrets, implement expiring one-time codes and resend/rate-limit behavior, and test the complete email loop. Do not treat a registered email as verified today.
- [ ] Persian and English are the only required languages. Verify both languages across all screens, menus, notifications, dialogs, errors, and nested flows; confirm Persian RTL layout and English LTR layout. No additional languages are in the current scope.
- [ ] Run a full security review of token expiry, credential handling, owner configuration, and production CORS/secret configuration.
- [ ] Owner-only operations use the numeric `OWNER_USER_ID` environment setting. Assistant roles/permissions and the planned limit of up to 50 assistants are not implemented as a complete role-management system. Do not grant a new primary-admin role without the owner's explicit decision.

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

- [x] Latest CI for commit `390104d2e8655b8b82a296a45c36e30d794cbb2b` passed API build/unit tests, API integration tests, Flutter analysis/tests, backgammon engine audit, and web preview build.
- [ ] Production API/database health is checked against the actual deployment, not a mocked or skipped step.
- [ ] Manual end-to-end acceptance checklist is signed off.
- [ ] No APK is built until the owner explicitly authorizes the final build after the above criteria are met.

## Latest automated verification

- Commit `390104d2e8655b8b82a296a45c36e30d794cbb2b`: API build/unit tests, API integration tests, Flutter analyze/tests, backgammon engine audit, and web preview build all passed. Web deployment was skipped; this is a preview build, not proof of production API/database health.
- Android workflow remains gated: production API health verification and APK build/upload are skipped unless a manual workflow dispatch explicitly requests an APK.

## Current decision

**Not ready for Phase 4.** Several core capabilities exist and are covered by tests, but email verification, assistant-role management, monetization-policy acceptance, live VPN/device testing, and final end-to-end acceptance remain open. This file should be updated only when each item has concrete evidence.
