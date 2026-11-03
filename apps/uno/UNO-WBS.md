# UNO standalone engineering WBS

Baseline: standalone UNO service and Flutter module; merged into `main` by PR #122 on 2026-11-03 (`ee61be087ef18c7dacd56d80a0f725f261c6384a`).  
Scoring model: weighted engineering completion, 100 points total. This is a UNO-only baseline and must not be confused with the Royal Club-wide 53-package / 1,000-point WBS.

## Scope boundary

This baseline covers the currently implemented, deliberately single-instance standalone product: game engine, 2–6 player rooms, match flow, text chat, Flutter client, Royal Club token authentication, PostgreSQL snapshot persistence/recovery, automated quality gates, and operational documentation.

The following are explicit release or future-scale gates, not hidden engineering work in this baseline:
- Physical acceptance on at least two Android devices, including complete 2-player and 6-player matches.
- Owner approval to integrate UNO into the root app.
- Owner approval for production hosting, production secrets, and database migration.
- Separate explicit owner approval before APK generation.
- Multi-instance/horizontal scaling. The current advisory lock intentionally enforces a safe single-instance deployment. The separate `DISTRIBUTED-ROOM-ARCHITECTURE.md` is a future design, not a claim that distributed execution is implemented.

## Weighted work packages

| ID | Work package | Weight | Engineering acceptance evidence | Status |
|---|---|---:|---|---:|
| UNO-01 | Rules engine, deck, turn flow, penalties, Wild Draw Four challenge, UNO call/catch, scoring | 20 | Engine unit suite and backend build pass | 100% |
| UNO-02 | Rooms, seats (2–6), readiness, host controls, match targets, reconnect, lifecycle | 18 | Room-manager and six-client Socket.IO integration coverage | 100% |
| UNO-03 | Authentication, authorization, identity derivation, private hands, token revocation | 12 | PostgreSQL integration checks for invalid signature, spoofing, host authorization, private hands and token version | 100% |
| UNO-04 | PostgreSQL snapshots, serialized writes, graceful shutdown, restart recovery | 12 | PostgreSQL integration checks for persistence, shutdown and restore | 100% |
| UNO-05 | Flutter lobby/table, Persian/English UI, action feedback, room-session recovery | 14 | Flutter format, analyze and test CI; stale async restore response guard | 100% |
| UNO-06 | Authorized, bounded text chat and localized UI | 5 | Backend authorization/rate/length rules and Flutter tests | 100% |
| UNO-07 | Automated quality gates and regression validation | 12 | UNO backend/build, PostgreSQL integration, Flutter, root validation and backgammon regression CI | 100% |
| UNO-08 | Standalone packaging, setup instructions, integration checklist and operations boundaries | 7 | README, env example, integration checklist, phase status and distributed architecture decision record | 100% |
| **Total** |  | **100** |  | **100%** |

## Calculation

Weighted completion = sum(package weight × package completion) / 100.

Current engineering implementation score on this defined baseline: **100/100** for the explicitly scoped standalone single-instance package. The latest fully validated implementation head `ad8866b30e534f471731701904040b2dc8ddd36f` passed UNO Standalone CI (backend, Flutter and PostgreSQL integration), root Flutter/API validation, API integration, backgammon regression and web-preview build. PR #122 merged the standalone module into the repository; the latest documented fully validated implementation head remains `b6d02594bca4beb19ba32825d228da988197d7ed`. The merge commit `ee61be0` is the current repository integration point, not proof of a production deployment. The preview deployment job was skipped; production was not deployed.

## Release readiness is tracked separately

Engineering WBS completion is not equivalent to release approval. Release remains **not accepted** until the two-device physical test is recorded and the owner separately authorizes any root-app integration, production deployment/migration, and APK build. No such actions are implied by this WBS.


## Explicit non-scored gates and limitations

These are not silently counted as completed:
- Two-device Android physical acceptance: pending tester execution and evidence.
- Six-player physical end-to-end acceptance: pending tester execution and evidence.
- Multi-instance operation: not implemented. A PostgreSQL advisory lock deliberately enforces one active service instance; see `DISTRIBUTED-ROOM-ARCHITECTURE.md`.
- Root-app integration, production deployment/migration/secrets and APK generation: not authorized and not performed.


## Repository integration update — 2026-11-03

- PR #122 is merged into `main` as `ee61be087ef18c7dacd56d80a0f725f261c6384a`.
- The merged scope is the standalone UNO service and Flutter module. It is not yet wired into the root Royal Club home screen; that separate proposal is PR #144 and remains open pending owner approval and service URL/deployment decisions.
- No production deployment, database migration, secret provisioning, multi-instance rollout, or APK build is implied by the merge.
