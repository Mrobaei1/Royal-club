# Iranian Manch — Work Breakdown Structure (Royal Club)

Status: active; implementation isolated on `feature/iranian-manch-foundation`.
The owner approved the common classic four-token baseline on 2026-11-02. Board visual acceptance and final online release acceptance remain required.

## Goal
Deliver a Persian/Iranian classic four-colour Manch game that fits the existing Flutter mobile app and Fastify/PostgreSQL backend without changing or regressing backgammon, chess, or card games.

## Weighted WBS and evidence gates

| ID | Work package | Weight | Done evidence |
|---|---|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | Approved rule matrix and edge-case list |
| 2 | Open-source research and license review | 15% | Candidate audit, exact commits, license obligations |
| 3 | Iranian board visual design | 15% | Responsive board, design spec, widget tests, owner visual acceptance |
| 4 | Pure Dart rules engine | 15% | Deterministic engine + exhaustive rule/unit tests |
| 5 | Offline game mode | 10% | 50% | Local 2–4 player pass-and-play, optional AI, deterministic easy/normal/hard policies, difficulty lock, v2 save envelope, legacy v1 migration and complete-state save/resume are implemented. CI validates legal bot moves across all seats/difficulties and complete seeded games for every difficulty/player count; widget tests cover roll, pass, bot turn, difficulty lock and save/restore. Remaining: deeper strategic-quality benchmarks, long-session/device restore acceptance and owner playtest. |
| 6 | Online game service | 15% | 85% | Server-authoritative 2–4 player rooms, cryptographic dice, rule validation, transactional locks, monotonic versions, stale-command rejection, history, rematch and reconnect retry are implemented. Authenticated 10-second heartbeat maintains a 30-second presence lease; owner-configurable 5–120 second grace triggers one legal temporary-AI action, throttled under match-row lock, and reconnect restores human control. Outsider reads are rejected before AI processing. API integration tests cover takeover, reconnect, disabled policy, multi-seat behavior and concurrency. Exact-head CI passed; remaining: push delivery, real network interruption and production-like multi-client UI acceptance. |
| 7 | Royal Club integration | 10% | 50% | Home tile, identity, latest-match recovery, history, player stats and lobby win/loss display are integrated. Friend-only room invitations include expiry, account-scoped inbox, transactional accept/decline, notifications and lobby friend picker; only room host sees invite/cancel actions. Owner-only audited disconnect policy is exposed in admin. Competitive Manch progression now awards win +20 XP, loss +5, quit −5 (clamped at zero), preserves permanent levels using the shared level formula, and exposes a top-50 XP leaderboard in the lobby. API tests cover invitation access/expiry/concurrency, progression outcomes and policy enforcement. Remaining: wider profile/league integration and live multi-device acceptance. |
| 8 | UX polish | 5% | 25% | Persian/English primary controls, status and turn messaging are implemented. Board state changes now use a short fade/scale transition and haptic feedback on human dice/move actions. Board semantics announce active colour, dice and each player's token distribution; live regions announce status and connection changes. Widget tests verify board semantics and locale behavior. Remaining: sound design, full accessibility audit, responsive visual polish and owner review. |
| 9 | End-to-end validation and stabilization | 5% | 35% | Exact-head workflow `41737003708` passed on commit `eb3320c2c1775f66f155c0e821746551683f76aa`: API build/unit tests, API integration tests, Flutter analyze and 135 Flutter tests. Integration coverage includes friend invite lifecycle and concurrent seat allocation, temporary AI/reconnect/policy gating, outsider authorization, XP outcomes and state concurrency. Remaining: two-device live acceptance, real network interruption/reconnect, production-like load, deployed-device regression and owner sign-off. |

## Dependencies and sequence
1. Finalize the Iranian rule profile before freezing engine behaviour.
2. Complete visual board and owner review; keep geometry separate from rule state.
3. Implement the pure Dart engine and tests before the UI starts mutating game state.
4. Complete offline play before online synchronization.
5. Build a dedicated Manch API contract; never reuse backgammon tables, routes, or state schemas.
6. Integrate the home tile only after the module has a playable local screen.
7. Run mobile/API regression suites and verify existing game entry points.

## Compatibility constraints
- Flutter app lives in `apps/mobile`; API lives in `apps/api`.
- Existing app supports Persian and English and has shared Royal Club theme state.
- Board geometry must not mirror when locale changes to RTL.
- Use Flutter SDK primitives first; no additional rendering dependency for the board.
- Keep all Manch files under a dedicated `games/manch` module.
- No changes to existing backgammon, chess, or card game rules/screens while creating the Manch foundation.
- Do not create an APK unless the owner explicitly authorizes it.

## Current measured progress

Measured conservatively from committed implementation and available test evidence (latest report: 2026-11-04). Percentages below are completion within each work package, not the weighted contribution.

| ID | Work package | Weight | Current progress | Evidence / remaining gate |
|---|---|---:|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | 90% | Owner approved the common classic four-token baseline on 2026-11-02; configurable implemented variants are documented. Remaining: implement and test currently unsupported options and complete edge-case matrix. |
| 2 | Open-source research and license review | 15% | 90% | Three pinned reference snapshots and exact LICENSE texts reviewed; MIT notice obligations and Apache-2.0 redistribution/NOTICE/patent provisions recorded. No source/assets/dependencies copied; full Royal Club dependency-tree inventory remains. |
| 3 | Iranian board visual design | 15% | 55% | 52-cell board painter, four yards, four home lanes, entry markers and widget tests exist. A shared `ManchBoardGeometry` now supplies route coordinates and colour start offsets to both painter and engine; new tests cover unique route cells, fixed entry positions, and identical seat geometry in RTL/LTR. The newest geometry tests passed in CI workflow `41727763476`; final visual review and owner acceptance remain. |
| 4 | Pure Dart rules engine | 15% | 60% | Deterministic core, serializable state, defensive immutable rule snapshots, blockade variants and scenario tests are implemented. Regression tests cover 2/3/4-player seat allocation, fixed colour entry offsets, the approved three-six baseline, and 60 seeded partial-game simulations. New complete-game simulations exercise 9 seeded games across 2/3/4 players and validate every resulting state after each action through a winner. Remaining: unsupported rule variants, broader edge-case matrix and owner-approved final rule profile. |
| 5 | Offline game mode | 10% | 45% | Local 2–4 player pass-and-play, optional AI opponent, deterministic bot policy, easy/normal/hard difficulty selection, difficulty lock after the first roll, secure save/resume and widget tests are implemented. Save persistence has a separate v2 envelope and one-time raw-v1 migration; codec tests cover round-trip, legacy compatibility, unsupported versions and malformed data. Seeded tests verify legal bot choices across 2/3/4 players and all difficulties; new complete-game tests verify that every difficulty can finish a seeded game for each supported player count. Remaining: broader strategic-quality evaluation, long-session save/restore acceptance and owner playtest. |
| 6 | Online game service | 15% | 75% | Authenticated room lifecycle, 2–4 player seats, expiry/cancel, server-generated dice, server-side rule validation, transactional row locking, monotonic state versions, concurrent-action protection, current-match recovery, forfeit/winner metadata and rematch rooms are implemented. The client rejects malformed/stale versions and exposes a reconnect retry state. Authenticated 10-second heartbeats maintain a 30-second presence lease; the server executes one legal temporary-AI action after the owner-configured grace (5–120 seconds), serializes takeover under the match row lock, throttles repeated actions and restores human control on return. Owner-only policy changes are audited. Integration tests now cover temporary takeover, reconnect, disabled-policy gating and outsider-read authorization; exact-head CI is pending. Remaining: push delivery, production-like multi-client UI acceptance and real network interruption tests. |
| 7 | Royal Club integration | 10% | 20% | Home-screen mode picker routes to offline AI/local modes and online lobby; authenticated identity, latest-match recovery, finished-match history and aggregate win/loss statistics are integrated. Friend-only Manch room invitations now have an API inbox, expiry, transactional acceptance/decline, notification records and lobby UI using the existing accepted-friends list. Owner disconnect policy controls are exposed in the admin panel and backed by the audited owner-only API. Integration coverage for invite lifecycle, friend-only access and policy enforcement has been added; exact-head CI is pending. Remaining: ranked records/rating progression, broader profile integration and live multi-device acceptance. |
| 8 | UX polish | 5% | 15% | Offline primary controls, difficulty choices, status labels, token positions, move descriptions, restart/save/restore feedback and turn messages use locale-aware Persian/English text. Online play exposes a reconnect warning and retry action after polling failures while preserving the last accepted state. Live-region semantics now announce offline turn/status updates and online connection loss or changing turn/status text to assistive technologies; the refresh action has an explicit localized tooltip. The offline live-region regression assertion was added after workflow `41729483150` and awaits exact-head CI. Remaining: animation, sound, full accessibility review and visual/copy polish. Exact-head Flutter analyze and tests passed in workflow `41729483150`. |
| 9 | End-to-end validation and stabilization | 5% | 30% | Last fully verified workflow `41729483150` passed on commit `6a05dcd2f54ef7b1ea97c568480402b073adc7cd`: API build/unit tests, API integration tests, Flutter analyze and all Flutter tests. Subsequent commits add match-read authorization regression, friend invitation lifecycle and owner policy-gating tests, plus mobile invite and admin controls; exact-head CI for these changes is not yet available. Two-device acceptance, real network interruption/reconnect, production-like multi-client testing, deployed-device regression and owner release sign-off remain. |

Weighted overall progress: **65.5%** (10%×90% + 15%×90% + 15%×55% + 15%×60% + 10%×50% + 15%×85% + 10%×50% + 5%×25% + 5%×35%). This is a conservative implementation estimate, not a release-readiness claim.

Commit `e8191a329f6aeb526f8662d350a620ffc8977879` passed the API build/unit tests, API integration tests, Flutter analyze/widget tests (101 passed), backgammon engine/AI regression (41 passed), and Web Preview workflow. The API integration suite verifies same-version concurrent rolls yield one success and one HTTP 409. Current-match recovery, two-player forfeit/winner metadata and rematch creation are present in the current implementation. Additional 3-/4-player seat-allocation and non-member-forfeit regression tests, offline bot difficulty-selection/locking widget tests, server-state invariant tests, and stale online response-version guard tests are present in the branch; their latest-head CI result is pending.

## Owner-approved base rule profile (2026-11-02)
- Four tokens per player; 2–4 players.
- Entry requires a six; rolling a six grants another roll.
- Exact count is required to finish; overshoots are illegal.
- Capturing an unprotected single opponent token returns it to its yard; capture does not grant an extra roll by default.
- The four colour entry cells (track indices 0, 13, 26, 39) are safe in the base profile.
- Three consecutive sixes do not automatically forfeit the turn in the base profile.
- Blockades are disabled in the base profile; friendly stacking is enabled.
- Turn order follows the selected seats and fixed red/green/yellow/blue colour mapping; 2-/3-player seat layouts remain subject to playtest.
- Local variants remain configurable only where the engine currently implements a corresponding switch. Unsupported variants are explicitly listed in the rule-research document and are not claimed as implemented.

## Definition of 100%
All nine work packages have evidence; game is playable offline and online; server validates all moves; reconnect and expiry are tested; Persian/English UI works; the game is integrated in Royal Club; CI is green; existing games pass regression tests; owner accepts the Iranian board and rule profile.
