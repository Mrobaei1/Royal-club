# Royal Club — Standalone Hokm Lab

**Isolation guarantee:** this folder exists only on branch `research/hokm-standalone`. Nothing here is merged into `main`, wired into the production app, or deployed. Do not merge without the owner's explicit instruction.

## Purpose
Build and verify an independent, Royal Club-compatible Hokm/Court Piece game module before any integration. This is not yet a complete or production-ready game.

## Owner-approved decisions
The full owner decision and acceptance specification is maintained in [OWNER-DECISIONS-2026-11-03.md](docs/OWNER-DECISIONS-2026-11-03.md). The evidence-based 12-package progress breakdown is in [HOKM-WBS-2026-11-03.md](docs/HOKM-WBS-2026-11-03.md). It records the 60-question decisions, timing, privacy, cancellation, disconnect, appeal, and technical reconciliation rules.

## Fixed product decisions
- Bot difficulty is permanently **Hard**; no player or room selector may change it. The bot may use only its own hand and public information and must use the normal legal-move validator.
- Personal XP is awarded only after the entire match ends: each winning-team player receives +20 XP; each losing-team player receives +5 XP. Intermediate hands change only the team match score.
- An intentional active-match exit receives −5 XP once for that player only; the seat is permanently controlled by the fixed-Hard bot and the leaver cannot reclaim it. A transient network disconnect is different: it has a configurable grace period (20 seconds by default), no XP penalty, temporary bot takeover after expiry, and authenticated seat reclaim without rolling back bot moves.
- Level 1 starts at 0 XP. Advancement from level L to L+1 costs round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP is level 109. XP is non-spendable, cannot fall below zero, and achieved level never decreases.
- Offline/practice games do not award XP; offline/practice mode is outside the approved Hokm scope.
- Match target is manager-selected from 3, 5, or 7 hand points. The first team to reach the target wins; a match is never a draw.
- Trump selection and card play each have a 7-second server deadline. A timed-out card is selected randomly from legal cards only.
- After each hand, all remaining cards are revealed to all four players for exactly 3 seconds. After the whole match, players see the final result only; no full replay/history viewer is provided.
- If all four players disconnect, preserve the last valid state for 20 seconds; cancel the match if nobody reconnects.
- Player-agreed cancellation requires explicit agreement from all four players.
- Private text chat with opposing players is allowed. Cheating reports and post-match appeals must be reviewable by management.
- Rooms are cleaned up only when empty; elapsed time alone never expires an occupied room.

## Requirements and planned modules
1. Rules engine and round/match controller.
2. Deterministic, randomized and regression tests.
3. Fixed hard-only AI.
4. Four-seat authoritative online service, invitations, reconnect and timeout handling.
5. Private hands and server-side command validation.
6. Flutter UI, localization, text/image/emoji chat. **Voice calls, video calls, conference calls, live push-to-talk, WebRTC calling/signalling, TURN/coturn and media relays are prohibited and must not be implemented.** Recorded voice messages are a separate future-optional feature, dormant and disabled; no user-facing microphone/record/send/play action is enabled.
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
- [ ] Production online service, network-driven deadline scheduler, authenticated session binding/persistent reconnect; text/image/emoji chat. Optional voice messages remain dormant/disabled pending separate owner activation and an approved implementation.
- [x] Seven-second server-side trump/card deadlines; expired card turns select randomly from legal cards only, and expired trump selection uses fixed Hard policy.
- [x] Three-second end-of-hand remaining-card reveal and server guard against starting the next hand too early.
- [x] Twenty-second all-four-disconnected cancellation, unanimous four-player cancellation, and unrecoverable technical-failure cancellation in the room/service layer.
- [x] Participant cheating reports and post-match appeals with manager/owner review records; these records do not silently change match results.
- [x] Final match view hides full replay/history.
- [x] Dedicated Node 20 syntax and test workflow; latest exact-head result: 112/112 tests passed, including live PostgreSQL 16 migration, multi-instance CAS and scheduler restart-recovery acceptance.
- [x] Durable deadline poller reads persisted turn, reconnect and all-disconnected deadlines from PostgreSQL room rows; a 250ms default poll interval, bounded batches, trusted service identity and version/CAS transitions protect execution across multiple workers. Runtime assembly wires PostgreSQL, authenticated Fastify routes and the scheduler; startup remains explicit.
- [x] Authenticated Fastify routes for room leave, unanimous cancellation votes, participant cheating reports, appeals, and manager review. Report/appeal player responses and management review projections omit private hands and raw round state.
- [x] Live ephemeral PostgreSQL migration/application and two-instance CAS/restart recovery acceptance in CI.
- [ ] Production Royal Club database migration/deployment, dedicated worker provisioning, push event transport and multi-instance soak testing. The production-port PR contains JWT/session integration but has not been merged or deployed.
- [x] Server-side private one-to-one chat for opposing-team participants: authenticated sender identity, opponent-only recipient validation, 1,000-character text bound, signature-validated PNG/JPEG/WebP images up to 650 KiB, message idempotency, participant-scoped delivery, final-result privacy and 2 MiB per-room chat storage cap.
- [x] Royal Club Flutter integration with four-seat lobby/game screen, Persian/English copy, secure bearer-token adapter, 500ms version-based room synchronization, private opponent chat, image picker, full emoji picker, owner report/appeal review screen and home-menu navigation. Root Flutter analyze is clean and 92 tests pass; physical four-device and push-event acceptance remain open.
- [x] Image attachments, full emoji picker and owner Flutter report/appeal review UI.
- [ ] Push event transport, physical four-device end-to-end acceptance, production worker provisioning and multi-instance soak.

## Communication policy (owner-confirmed, 2026-11-03)

Royal Club is a game platform, not a voice/video calling or conferencing application.

- Voice calls, video calls, conference calling, live push-to-talk, WebRTC calling/signalling, TURN/coturn and media-relay infrastructure are permanently out of scope.
- Recorded voice messages are not calls. They remain future-optional, dormant and disabled by default; no user-facing microphone/record/send/play action is currently enabled.
- For now, use only free capabilities. Do not provision paid media services or operational voice infrastructure.
- Any future recorded-voice-message activation requires a separate explicit owner decision and security/cost review.
- Do not use TURN/coturn, TURN relay credentials, WebRTC calling/signaling, or call-related infrastructure. Remove any such code/configuration if present; do not substitute another paid relay.

## Server-side application boundary (in progress)

The room/service layer exposes version-checked seven-second turn deadline processing, all-four-disconnected cancellation, unanimous cancellation votes, unrecoverable technical-failure cancellation, participant reports/appeals, and manager/owner review methods. `src/deadline-scheduler.js` polls persisted room deadlines from the repository every 250ms by default; `src/runtime.js` wires it to the PostgreSQL adapter and authenticated Fastify routes. The host server must explicitly start the scheduler after applying the migration.

`src/service.js` adds a framework-neutral server application boundary around the room state machine:
- Caller identity is taken only from a verified principal supplied by trusted authentication middleware; request-body user IDs are not accepted as identity.
- Membership-gated views and version-checked room transitions are exposed through one service. `src/fastify-routes.js` registers authenticated room endpoints and requires the application to provide its real authentication preHandler.
- In-process per-room serialization prevents two requests in the same Node process from both committing the same room version.
- The repository contract requires `get`, `insert`, and `compareAndSwap`; `InMemoryRoomRepository` is for tests/local development, while `PostgresRoomRepository` is implemented for a node-postgres Pool. The SQL migration is `migrations/001_hokm_rooms.sql`.
- Disconnect, turn and all-disconnected deadline processing is restricted to trusted service/system principals and invoked by the durable database-polled scheduler. The scheduler reloads current room versions before transitions; PostgreSQL compare-and-swap prevents two server instances from committing the same version.
- Fastify routes expose participant leave/cancel/report/appeal actions and manager review endpoints; private card state is stripped from participant and manager responses.

**Production blockers remain:** PR #133 (`feature/hokm-production-api-v3`) now ports the latest verified Hokm modules into the Royal Club Fastify API, derives identity from the real JWT/session guard (including token-version and revocation checks), gates review to the configured owner, and provides the dedicated deadline worker. The Flutter game is also wired into the Royal Club mobile home menu and uses the existing secure token/session. These changes are still on an unmerged production-port branch; the default `main` branch is unchanged. The production migration has not been applied to the live database, the dedicated worker has not been provisioned, push event transport and physical four-device acceptance remain open, and sustained multi-instance soak testing is outstanding. Do not deploy or describe the service as production-ready.

## Run tests
Requires Node.js 20+: `npm test`

Do not describe this module as complete until the remaining acceptance criteria are implemented and verified.


## Latest verified checkpoint (2026-11-04)

- Node 20 + PostgreSQL 16: **129/129 Hokm tests passed**, including live migration, multi-instance compare-and-swap, deadline restart recovery, private-chat/image validation, manager-review persistence and terminal-state privacy.
- Standalone Flutter: **13/13 tests passed**; Royal Club mobile Flutter analyze is clean with **92/92 tests passed**.
- Royal Club API: **32/32 integration tests passed**, API build/tests passed, and the Web Preview build passed. The deploy step was skipped; no deployment was performed.
- Exact-head evidence: [Hokm lab validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41784780513), [Royal Club API integration](https://github.com/Mrobaei1/Royal-club/actions/runs/41784790957), [Royal Club build/mobile validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41784790952), [Web Preview build](https://github.com/Mrobaei1/Royal-club/actions/runs/41784791003).
- No production deployment, merge to `main`, worker provisioning, or APK build was performed.


## Latest verified checkpoint (2026-11-06)

- Isolated Hokm Node 20 + PostgreSQL 16: **137/137 tests passed** on the latest completed full validation.
- Standalone Flutter: **analyze clean; 14/14 widget tests passed**.
- Newly covered: deterministic immutable round transitions; complete matches at all supported 3/5/7 targets; Q24 waiting-room cancellation; terminal-room exit and empty-only cleanup; final-hand reveal visible to all four players for exactly three seconds, including when the match ends; Flutter blocks lobby exit until that final reveal expires.
- Hokm WBS packages **2.0 Rules Engine, 3.0 Round/Match Controller, and 4.0 Room/Invitation Lifecycle are each 100%**. Weighted isolated Hokm WBS progress is **80.68%**.
- Evidence: [Hokm isolated validation](https://github.com/Mrobaei1/Royal-club/actions/runs/42208507236), [isolated Node tests](https://github.com/Mrobaei1/Royal-club/actions/runs/42208507330), and the updated [12-package WBS report](docs/HOKM-WBS-2026-11-03.md).

**Release boundary remains unchanged:** PR #133 and PR #137 are separate Draft integration proposals; neither is merged. No production database migration, worker provisioning, deployment, or APK build was performed. Physical four-device, load and soak acceptance remain in WBS packages 11/12.
