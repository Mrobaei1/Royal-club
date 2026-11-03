# UNO phase status — 2026-11-03 (latest verified head: ad8866b)

This phase record is paired with the UNO-only weighted baseline in [UNO-WBS.md](./UNO-WBS.md). The weights total 100 and are independent of the Royal Club-wide 53-package / 1,000-point WBS.

## Engineering completion

| Phase | Scope | Engineering status | Evidence |
|---|---|---:|---|
| 1 | UNO engine and rules | 100% | Deck/discard flow, number/action/wild cards, reverse/skip/draw penalties, Wild Draw Four challenge, UNO call/catch, round scoring, opening-card handling; automated engine tests pass |
| 2 | Rooms, table and match cycle | Core single-instance functionality implemented; distributed hardening open | 2–6 seats, seventh-player rejection, explicit readiness, host-only start, 1/3/5 match target, no late join, round readiness reset, reconnect/host transfer, host succession and cleanup; six-client Socket.IO integration test passes. Multi-instance transactions, command idempotency and cross-instance Socket.IO coordination are not implemented; a PostgreSQL advisory lock intentionally rejects a second server instance. |
| 3 | Text chat | 100% | Seated-player authorization, host enable/disable, bounded message length/rate, Persian/English chat UI tests pass |
| 4 | Future audio scope | 100% of approved scope | Voice/video calls, microphone capture, WebRTC, TURN and live-media signalling are excluded. Optional recorded voice messages remain disabled and deferred; no paid audio provider or runtime media service |
| 5 | Flutter UI | 100% of implemented scope | Persian/English lobby, table, action labels, chat and server errors; live opponent card counts and current-turn highlight; Flutter analyze/tests pass |
| 6 | Security and authentication | 100% | Royal Club HS256 token verification, expiry/token-version checks, server-derived player identity, username-only public profile, private hands; automated auth/privacy tests pass |
| 7 | Storage and recovery | 100% of implemented scope | PostgreSQL room snapshots, serialized writes, restart restore, reconnect and token-revocation integration coverage pass |

## Verified CI evidence — latest head `ad8866b30e534f471731701904040b2dc8ddd36f`\n\n- UNO Standalone CI run **41673494543**: backend tests/build, Flutter format/analyze/tests, and PostgreSQL server integration — all **success**.\n- Royal Club validation run **41673494242**: Flutter analyze/tests and API build/tests — all **success**.\n- Backgammon engine audit run **41673494331** — **success**.\n- Validate Royal Club run **41673494938**: Flutter analyze/tests, API build/tests and API integration — all **success**.\n- Royal Club Web Preview run **41673494570**: build, Flutter/API checks and preview artifact upload — **success**; deployment job **skipped** (no production deploy).\n- Netlify Deploy Preview for PR #122 is ready: https://deploy-preview-122--royal-club-6ob5.netlify.app\n\n## Earlier CI evidence

- UNO Standalone CI run **175** on commit `825fe1422584a8704aa335605fbe52cc24796c25`: backend tests/build **success**, Flutter format/analyze/tests **success**, PostgreSQL/server integration **success**. The integration suite now verifies a second service process is rejected by the PostgreSQL advisory lock.
- UNO Standalone CI run **41641140833** on `9c1185db647f7a3ee6ea462e9e894e34a1be0b4a**: backend, PostgreSQL/server integration and Flutter module jobs **success**.
- Latest-head root validation run **41638382298** on `e155724ecfcde9468945d602f4f15eb5b660dac0`: completed **success**. The newest room-retention test change is covered by UNO Standalone CI run **41641140833**.
- Backend suite: **65 tests, 64 passed, 0 failed, 1 skipped**. The skipped case is the optional database-backed test in `test/server.integration.test.ts`; it is skipped when `DATABASE_URL` is absent in a local test run. The dedicated CI server-integration job provisions PostgreSQL and runs the database-backed checks.
- PostgreSQL/server integration suite: **1 passed, 0 failed**.
- Root API build/tests and API integration checks: **success**.
- Root Flutter analyze/tests: **success**.
- Existing backgammon regression workflow: **success**.

## Latest verified run before reconnect hardening (2026-11-03)

- UNO Standalone CI run **41641140833** on commit `9c1185db647f7a3ee6ea462e9e894e34a1be0b4a`: backend **success**, PostgreSQL/server integration **success**, Flutter module **success**.
- Root validation run **41638382298**: **success**.
- The room-manager suite now explicitly checks finished-match retention expiry, removal from room lookup, and release of the player's room membership.

## Phase 5–7 follow-up work — 2026-11-03

The following changes were added after the earlier phase evidence above. They are committed on the standalone feature branch; the corresponding CI runs are pending and these changes are not marked accepted until those runs pass.

### Phase 5 — Flutter UI
- The room/table remains visible while an acknowledged server action is in progress; a thin progress indicator and input lock replace the previous full-screen spinner.
- The client remembers only the last room code locally and attempts authenticated room recovery after process restart or socket reconnection.
- Saved room recovery is scoped to the public player ID; switching accounts clears the stale room reference. No access token, hand, or private game state is persisted locally.
- Added unit tests for normalized room-code storage, account isolation and clearing.

### Phase 6 — Security and authentication
- Expanded PostgreSQL-backed integration coverage to reject a tampered HS256 signature.
- Added a client identity-spoofing check: room creation ignores supplied username/user ID and uses the authenticated database profile.
- Added a host-authorization check and explicit verification that one player's private hand is not delivered to the other player's socket.

### Phase 7 — Storage and recovery
- Added account-scoped local room reference persistence so a client can request server-side reconnect after app process restart.
- Added SIGTERM/SIGINT graceful shutdown: disconnect clients, close Fastify, await queued snapshot writes, then release the PostgreSQL advisory lock and pool.
- Integration coverage now asserts graceful shutdown before restarting the service and restoring the persisted room.

Automated acceptance for the latest head `ad8866b30e534f471731701904040b2dc8ddd36f` is green. The reconnect-race hardening and WBS/documentation changes are included in this head. Physical two-device acceptance and owner approval for root-app integration remain release gates. These client/storage changes do not implement multi-instance persistence; the phase 2 advisory lock remains in place.

## Runtime hardening added 2026-11-03

- `server.ts` acquires a PostgreSQL session advisory lock before reading room snapshots and holds it for the process lifetime; a competing instance fails fast. JWT secret length is validated before acquiring the lock.
- The integration test launches a competing process on a separate port and asserts it exits with the expected single-instance error.
- This is a safe single-instance guard, not distributed room coordination or horizontal scaling. Per-room transactions and a shared Socket.IO adapter remain future work. The implementation sequence, invariants, idempotency requirements and rollout acceptance tests are documented in `DISTRIBUTED-ROOM-ARCHITECTURE.md`.

## Release gates not included in engineering percentages

- Physical Android acceptance on at least two devices, including Persian and English layouts and a full 2-player/6-player match.
- Owner approval to integrate the standalone package into the root app.
- Owner approval for production hosting, database migration and production secrets.
- Separate explicit owner approval before any APK build.

UNO remains isolated and this PR remains draft. No production deployment, database migration, root-app integration, merge or APK build has been performed.


## Reconnect lifecycle race hardening — 2026-11-03

- Saved-room loading now captures the player, token, server URL and restore generation before awaiting local storage; a result from an obsolete widget identity/server is ignored.
- Reconnect responses are accepted only while the captured player, token, server URL and generation remain current. The guard is rechecked after asynchronous storage clear/save operations as well as after the socket acknowledgement.
- This prevents late acknowledgements from an old account or server endpoint from repopulating room/game/hand state after `didUpdateWidget` has reset the session.
- Commit: `55be0e8f0dacc29a5672289d89b71ac2aae6ce17`. CI for this new commit is pending at the time of this update.


## Physical acceptance execution record

Status: **not executed in this development environment**. Automated CI cannot substitute for real Android devices. The remaining manual checklist is recorded in [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md); a tester must record device model/Android version, build identifier, tester, date, and pass/fail evidence for both two-player and six-player complete matches, reconnect/account-switch, Persian/English layouts, chat and private-hand visibility.

## Final engineering baseline result

The UNO-only WBS in `UNO-WBS.md` is **100/100 engineering completion** for the explicitly scoped standalone single-instance package, backed by green CI on `ad8866b`. This does not certify multi-instance support, physical-device acceptance, root-app integration, production deployment, or release approval. PR #122 remains Draft and unmerged.
