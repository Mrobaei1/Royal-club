# UNO phase status — 2026-11-03

This report is paired with [UNO-WBS.md](./UNO-WBS.md), a UNO-only weighted baseline totaling 100 points. It is separate from the Royal Club-wide WBS.

## Engineering completion

| Phase | Scope | Status | Evidence / boundary |
|---|---|---:|---|
| 1 | Rules engine | 100% | Deck/discard, number/action/wild cards, reverse/skip/draw penalties, Wild Draw Four challenge, UNO call/catch, scoring and opening-card handling; engine tests pass. |
| 2 | Rooms and match cycle | 100% of single-instance scope | 2–6 seats, seventh-player rejection, ready/host-only start, match target 1/3/5, no late join, round readiness, reconnect, host transfer and cleanup; six-client Socket.IO integration passes. Multi-instance transactions, durable command idempotency and cross-instance Socket.IO coordination are not implemented; PostgreSQL advisory lock deliberately rejects a second server process. |
| 3 | Text chat | 100% | Seated-player authorization, host enable/disable, message length/rate bounds and localized UI tests. |
| 4 | Audio scope | 100% of approved scope | Live voice/video, microphone capture, WebRTC, TURN and media signalling are excluded. Recorded voice messages remain disabled and deferred. |
| 5 | Flutter UI | 100% of defined scope | Persian/English lobby/table/actions/chat/errors, opponent card counts, turn highlight, in-action progress and account-scoped saved-room recovery. Format/analyze/tests pass. |
| 6 | Security/authentication | 100% | HS256 signature/expiry/token-version verification, server-derived identity, username-only public profile, host authorization and private-hand isolation tests. |
| 7 | Persistence/recovery | 100% of defined single-instance scope | PostgreSQL room snapshots, serialized snapshot writes, graceful shutdown, restart restore and authenticated reconnect integration checks. |

## Latest standalone implementation CI — PR #122 head `f5d76166322bc6fd5a3d78968b3a669733fe8c0e`

- UNO Standalone CI **41675459060**: backend tests/build, Flutter module format/analyze/tests, and PostgreSQL/server integration — all passed.
- Validate Royal Club **41675458376**: API build/unit/integration tests and Flutter analyze/tests — passed.
- Royal Club validation **41675458953**: API build/tests and Flutter analyze/tests — passed.
- Backgammon engine audit **41675457974** — passed.
- Royal Club Web Preview **41675458037**: build passed; deployment job skipped. This was not a production deployment.
- PR #122 merged this implementation into `main` at `ee61be087ef18c7dacd56d80a0f725f261c6384a`. The merge does not imply a Production service deployment or physical-device acceptance.

## Reconnect lifecycle hardening

- Saved-room loading captures player ID, token, server URL and generation before awaiting local storage; stale results are ignored.
- Reconnect responses are accepted only while all captured identity/server/generation values remain current.
- The guard is rechecked after asynchronous room-code storage operations as well as after the socket acknowledgement, preventing an old account/server response from restoring stale game or hand state after widget identity changes.
- Implementation commit: `55be0e8f0dacc29a5672289d89b71ac2aae6ce17`.

## Engineering WBS result

The defined standalone single-instance engineering baseline is **100/100** on the weighted UNO-only WBS. This is engineering completion, not certification of physical-device acceptance or a production release.

## Non-scored gates and known limitations

- Physical Android acceptance on at least two devices, including complete 2-player and 6-player matches, Persian/English layouts, chat, reconnect/account switching and private-hand visibility: **not executed here**. Automated CI cannot substitute for physical devices. Record evidence in [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md).
- Multi-instance/horizontal scaling: **not implemented**. The current single-instance advisory lock is an intentional safety boundary. See [DISTRIBUTED-ROOM-ARCHITECTURE.md](./DISTRIBUTED-ROOM-ARCHITECTURE.md).
- PR #122 was merged into `main` on 2026-11-03 as merge commit `ee61be087ef18c7dacd56d80a0f725f261c6384a`; this brings the standalone UNO module and its WBS/status/integration documentation into the repository. It does not deploy the service or integrate the root-app home screen.
- Root-app home-screen integration is separately proposed in open PR #144 (`feature/uno-home-menu-integration`). Its exact-head root validation, web preview, engine audit and UNO Standalone CI all passed on `acf883ce9489b9849c62fbca738d5c8296d43603`, but the service URL is still an explicit build-time input and no service deployment/production secrets are configured by this merge.
- Root-app integration approval, production hosting/migration/secrets and APK generation remain unauthorized and unperformed. No production deployment or live database migration has occurred.
