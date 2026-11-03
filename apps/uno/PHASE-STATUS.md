# UNO phase status — 2026-11-03

This is a phase-level engineering acceptance record. It does not invent work-package IDs or weights: no audited UNO-specific package-weight table exists in the repository. The Royal Club-wide 53-package / 1,000-point WBS is not a UNO-only WBS.

## Engineering completion

| Phase | Scope | Engineering status | Evidence |
|---|---|---:|---|
| 1 | UNO engine and rules | 100% | Deck/discard flow, number/action/wild cards, reverse/skip/draw penalties, Wild Draw Four challenge, UNO call/catch, round scoring, opening-card handling; automated engine tests pass |
| 2 | Rooms, table and match cycle | 100% | 2–6 seats, seventh-player rejection, explicit readiness, host-only start, 1/3/5 match target, no late join, round readiness reset, reconnect/host transfer; six-client Socket.IO integration test passes |
| 3 | Text chat | 100% | Seated-player authorization, host enable/disable, bounded message length/rate, Persian/English chat UI tests pass |
| 4 | Future audio scope | 100% of approved scope | Voice/video calls, microphone capture, WebRTC, TURN and live-media signalling are excluded. Optional recorded voice messages remain disabled and deferred; no paid audio provider or runtime media service |
| 5 | Flutter UI | 100% of implemented scope | Persian/English lobby, table, action labels, chat and server errors; live opponent card counts and current-turn highlight; Flutter analyze/tests pass |
| 6 | Security and authentication | 100% | Royal Club HS256 token verification, expiry/token-version checks, server-derived player identity, username-only public profile, private hands; automated auth/privacy tests pass |
| 7 | Storage and recovery | 100% of implemented scope | PostgreSQL room snapshots, serialized writes, restart restore, reconnect and token-revocation integration coverage pass |

## Verified CI evidence

- UNO Standalone CI run **175** on commit `825fe1422584a8704aa335605fbe52cc24796c25`: backend tests/build **success**, Flutter format/analyze/tests **success**, PostgreSQL/server integration **success**. The integration suite now verifies a second service process is rejected by the PostgreSQL advisory lock.
- Backend suite: **65 tests, 64 passed, 0 failed, 1 skipped**.
- PostgreSQL/server integration suite: **1 passed, 0 failed**.
- Root API build/tests and API integration checks: **success**.
- Root Flutter analyze/tests: **success**.
- Existing backgammon regression workflow: **success**.

## Runtime hardening added 2026-11-03

- `server.ts` acquires a PostgreSQL session advisory lock before reading room snapshots and holds it for the process lifetime; a competing instance fails fast. JWT secret length is validated before acquiring the lock.
- The integration test launches a competing process on a separate port and asserts it exits with the expected single-instance error.
- This is a safe single-instance guard, not distributed room coordination or horizontal scaling. Per-room transactions and a shared Socket.IO adapter remain future work.

## Release gates not included in engineering percentages

- Physical Android acceptance on at least two devices, including Persian and English layouts and a full 2-player/6-player match.
- Owner approval to integrate the standalone package into the root app.
- Owner approval for production hosting, database migration and production secrets.
- Separate explicit owner approval before any APK build.

UNO remains isolated and this PR remains draft. No production deployment, database migration, root-app integration, merge or APK build has been performed.
