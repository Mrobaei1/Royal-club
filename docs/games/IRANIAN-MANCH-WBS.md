# Iranian Manch — Work Breakdown Structure (Royal Club)

Status: active; implementation isolated on `feature/iranian-manch-foundation`.
The owner approved the common classic four-token baseline on 2026-11-02. Board visual acceptance and final online release acceptance remain required.

## Goal
Deliver a Persian/Iranian classic four-colour Manch game that fits the existing Flutter mobile app and Fastify/PostgreSQL backend without changing or regressing backgammon, chess, or card games.

## Weighted WBS and evidence gates

| ID | Work package | Weight | Done evidence |
|---:|---|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | Approved rule matrix and edge-case list |
| 2 | Open-source research and license review | 15% | Candidate audit, exact commits and license obligations |
| 3 | Iranian board visual design | 15% | Responsive board, design specification, widget tests and owner visual acceptance |
| 4 | Pure Dart rules engine | 15% | Deterministic engine and exhaustive rule/unit tests |
| 5 | Offline game mode | 10% | Local multiplayer, AI opponents, persistence and widget acceptance |
| 6 | Online game service | 15% | Server-authoritative rooms, secure actions, reconnect and multiplayer integration tests |
| 7 | Royal Club integration | 10% | Friends, progression, ranking and owner-controlled settings integrated |
| 8 | UX polish | 5% | Persian/English UI, animation, sound and accessibility review |
| 9 | End-to-end validation and stabilization | 5% | Full CI, multiplayer acceptance, existing-game regression and owner release sign-off |

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
|---:|---|---:|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | 90% | Owner approved the common classic four-token baseline on 2026-11-02; configurable implemented variants are documented. Remaining: implement/test unsupported options and finish the edge-case matrix. |
| 2 | Open-source research and license review | 15% | 90% | Three pinned reference snapshots and exact LICENSE texts reviewed; MIT notice obligations and Apache-2.0 redistribution/NOTICE/patent provisions recorded. Full Royal Club dependency-tree inventory remains. |
| 3 | Iranian board visual design | 15% | 55% | 52-cell board painter, four yards, four home lanes, entry markers and widget tests exist. Shared geometry tests cover unique route cells, fixed entry positions and identical RTL/LTR seat geometry. Final visual review and owner acceptance remain. |
| 4 | Pure Dart rules engine | 15% | 60% | Deterministic core, serializable state, defensive immutable rule snapshots, blockade variants and scenario tests are implemented. Regression tests cover 2/3/4-player seat allocation, fixed colour entry offsets, approved three-six baseline, 60 seeded partial-game simulations and complete seeded games through a winner. Remaining: unsupported rule variants, broader edge-case matrix and owner-approved final rule profile. |
| 5 | Offline game mode | 10% | 50% | Local 2–4 player pass-and-play, optional AI, deterministic easy/normal/hard policies, difficulty lock, secure save/resume, v2 envelope and one-time raw-v1 migration are implemented. CI validates legal bot moves and complete seeded games for every difficulty/player count; widget tests cover roll, pass, bot turn, difficulty lock and save/restore. Remaining: deeper strategic-quality benchmarks, long-session/device restore acceptance and owner playtest. |
| 6 | Online game service | 15% | 85% | Server-authoritative 2–4 player rooms, secure dice, rule validation, transactional locks, monotonic versions, stale-command rejection, history, rematch and reconnect retry are implemented. Authenticated 10-second heartbeat maintains a 30-second presence lease; owner-configurable 5–120 second grace triggers one legal temporary-AI action, throttled under match-row lock, and reconnect restores human control. Outsider reads are rejected before AI processing. API integration tests cover takeover, reconnect, disabled policy, multi-seat behavior and concurrency. Remaining: push delivery, real network interruption and production-like multi-client UI acceptance. |
| 7 | Royal Club integration | 10% | 50% | Home tile, identity, latest-match recovery, history and player stats are integrated. Friend-only room invitations include expiry, account-scoped inbox, transactional accept/decline, notifications and lobby friend picker; only room host sees invite/cancel actions. Owner-only audited disconnect policy is exposed in admin. Competitive progression awards win +20 XP, loss +5, quit −5 (clamped at zero), preserves permanent levels with the shared level formula and exposes a top-50 XP leaderboard. Remaining: wider profile/league integration and live multi-device acceptance. |
| 8 | UX polish | 5% | 25% | Persian/English controls and status messaging are implemented. Board state changes use fade/scale transitions and haptic feedback; board semantics announce active colour, dice and token distribution; live regions announce turn/status and connection changes. Widget tests verify board semantics and locale behavior. Remaining: sound design, full accessibility audit, responsive visual polish and owner review. |
| 9 | End-to-end validation and stabilization | 5% | 35% | Workflow `41737338465` passed on commit `f1c81bd4baa75b44b66c49cd27197571be7402df`: API build/unit tests, API integration tests, Flutter analyze and all Flutter tests. The subsequent three-player XP distribution regression test is committed but awaits exact-head CI. Remaining: two-device live acceptance, real network interruption/reconnect, production-like load, deployed-device regression and owner sign-off. |

Weighted overall progress: **65.5%** (10%×90% + 15%×90% + 15%×55% + 15%×60% + 10%×50% + 15%×85% + 10%×50% + 5%×25% + 5%×35%). This is a conservative implementation estimate, not a release-readiness claim.

The latest fully green validation is workflow `41737338465` on commit `f1c81bd4baa75b44b66c49cd27197571be7402df`: API build/unit tests, API integration tests, Flutter analyze and Flutter widget tests. The subsequent multiplayer XP distribution test is pending exact-head CI. Existing backgammon, chess and card-game regression suites remain part of the release gate.

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
