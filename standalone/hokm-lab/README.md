# Royal Club — Standalone Hokm Lab

**Isolation guarantee:** this folder exists only on branch `research/hokm-standalone`. Nothing here is merged into `main`, wired into the production app, or deployed. Do not merge without the owner's explicit instruction.

## Purpose
Build and verify an independent, Royal Club-compatible Hokm/Court Piece game module before any integration. This is not yet a complete or production-ready game.

## Fixed product decisions
- Bot difficulty is permanently **Hard**; no player or room selector may change it. The bot may use only its own hand and public information and must use the normal legal-move validator.
- Personal XP is awarded only after the entire match ends: each winning-team player receives +20 XP; each losing-team player receives +5 XP. Intermediate hands change only the team match score.
- An intentional active-match exit receives −5 XP once for that player only; the seat is permanently controlled by the fixed-Hard bot and the leaver cannot reclaim it. A transient network disconnect is different: it has a configurable grace period (20 seconds by default), no XP penalty, temporary bot takeover after expiry, and authenticated seat reclaim without rolling back bot moves.
- Level 1 starts at 0 XP. Advancement from level L to L+1 costs round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP is level 109. XP is non-spendable, cannot fall below zero, and achieved level never decreases.
- Offline/practice games do not award XP.

## Requirements and planned modules
1. Rules engine and round/match controller.
2. Deterministic, randomized and regression tests.
3. Fixed hard-only AI.
4. Four-seat authoritative online service, invitations, reconnect and timeout handling.
5. Private hands and server-side command validation.
6. Flutter UI, localization, chat and optional microphone feature.
7. Security, concurrency, recovery and end-to-end QA.

## Current status
- [x] Isolated branch and independent engine/round/room foundation.
- [x] Match XP calculation and level progression module.
- [x] Intentional forfeit penalty with duplicate-event protection and permanent fixed-Hard bot takeover.
- [x] Transient disconnect grace, timeout-triggered temporary bot takeover, version-checked reconnect and no-rollback seat reclaim.
- [x] PostgreSQL repository adapter and transactional room/XP aggregate writes implemented with migration and mocked transaction tests; [ ] live database migration, deployed database verification and durable XP ledger reconciliation.
- [x] Fixed-hard bot with legal-card selection, public unseen-card counting, void-suit inference, deterministic full-hand simulation, 24 seeded-deal simulations, 100 seeded full-match simulations to target 3, deterministic 24-sample public-information hidden-hand allocation with a validated two-trick lookahead; a three-trick experiment was benchmarked and reverted because it did not improve both random and greedy baselines; public card-count consistency checks, repeatable mid-trick decision tests, a 300-deal legal-random comparison (260/300 Hard wins, 86.67%; 70.87% trick share), a 300-deal deterministic-greedy comparison (167/300 wins, 55.67%; 54.47% trick share), and hidden-hand invariance tests.
- [ ] Multi-trick lookahead / endgame search, expert and varied partnership-aware opponent baselines, broader calibrated public inference and match-level tournament simulations.
- [x] Public completed-trick history retained in round state and sanitized per-seat views.
- [ ] Production online service, network-driven deadline scheduler, authenticated session binding/persistent reconnect; chat/voice.
- [ ] Flutter UI, manager controls and end-to-end/security testing.

## Server-side application boundary (in progress)

`src/service.js` adds a framework-neutral server application boundary around the room state machine:
- Caller identity is taken only from a verified principal supplied by trusted authentication middleware; request-body user IDs are not accepted as identity.
- Membership-gated views and version-checked room transitions are exposed through one service.
- In-process per-room serialization prevents two requests in the same Node process from both committing the same room version.
- The repository contract requires `get`, `insert`, and `compareAndSwap`; `InMemoryRoomRepository` is for tests/local development, while `PostgresRoomRepository` is implemented for a node-postgres Pool. The SQL migration is `migrations/001_hokm_rooms.sql`.
- Disconnect deadline processing is restricted to trusted service/system principals and must be invoked by a server scheduler.

**Production blockers remain:** there is no HTTP/Fastify adapter, real authentication middleware/session binding, live PostgreSQL migration or database integration test, distributed concurrency control across server processes, durable deadline scheduler, event transport or reconnect recovery test against a running server. The PostgreSQL adapter is implemented but has only been exercised with a mocked Pool in CI; the in-memory queue does not coordinate multiple server processes. Do not deploy this service or describe it as production-ready.

## Run tests
Requires Node.js 20+: `npm test`

Do not describe this module as complete until the remaining acceptance criteria are implemented and verified.
