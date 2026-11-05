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

Measured conservatively from committed implementation and available test evidence (latest report: 2026-11-06). Percentages below are completion within each work package, not the weighted contribution.

| ID | Work package | Weight | Current progress | Evidence / remaining gate |
|---:|---|---:|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | 100% | Owner-approved classic four-token baseline is frozen; the full rule/edge-case matrix is documented and traced to automated Dart and TypeScript tests. Optional team mode and three-entry-attempt house variants are explicitly excluded from this release; starting-cell safety is already represented by safeTrackIndices. |
| 2 | Open-source research and license review | 15% | 90% | Three pinned reference snapshots and exact LICENSE texts reviewed; MIT notice obligations and Apache-2.0 redistribution/NOTICE/patent provisions recorded. Full Royal Club dependency-tree inventory remains. |
| 3 | Iranian board visual design | 15% | 55% | 52-cell board painter, four yards, four home lanes, entry markers and widget tests exist. Shared geometry tests cover unique route cells, fixed entry positions and identical RTL/LTR seat geometry. Final visual review and owner acceptance remain. |
| 4 | Pure Dart rules engine | 15% | 100% | Deterministic Flutter/Dart and server TypeScript engines implement the approved rule contract. The Flutter suite contains 33 Manch engine tests and the API suite contains 26 rule-engine tests, covering seat counts, entry/capture/safe cells, blockades/path blocking, exact and optional overshoot finish, independent bonus rules, three-six policies, invalid actions, state invariants, legacy-save counters, and seeded complete games for 2/3/4 players. Exact-head CI on code commit 2930c71 passed Flutter analyze and all 152 Flutter tests plus API build/unit and PostgreSQL integration. |
| 5 | Offline game mode | 10% | 50% | Local 2–4 player pass-and-play, optional AI, deterministic easy/normal/hard policies, difficulty lock, secure save/resume, v2 envelope and one-time raw-v1 migration are implemented. CI validates legal bot moves and complete seeded games for every difficulty/player count; widget tests cover roll, pass, bot turn, difficulty lock and save/restore. A restored bot turn with an already-pending die previously stalled; the bot now reuses the saved die. A second race allowed repeated Restore taps to issue overlapping loads and schedule duplicate bot callbacks; the restore action now has an in-flight guard, disabled/loading UI, and a delayed-store regression test (commits `f0d38b7e2772cccfa926c5126e1e7c6a968e887a`, `9eaf578804bdcd8750e6299e204d8a697d1a8afa`, `2204a6e7cbce1022bff2546a3f21c078fb769ddd`, and `d13d03e657810f83a01df856c74373b39f22b4b4`). Exact-head CI passed on commit `10ce3f311e37181f1f8ab91e8e6880756a2b1258` (workflow `41785372228`), including Flutter analyze and all widget tests; this validates the pending-die and overlapping-restore regressions. Exact-head CI also passed on commit `dddbd9944a715a9483d8355b429c62668eb3efe4` (workflow `41785959511`); the hard bot now ignores uncapturable stacked pairs, and its tactical regression test passes. A tactical regression now verifies that hard AI does not over-penalize a square threatened only by a stacked pair, which the rules engine cannot capture. Remaining: broader strategic-quality benchmarks, long-session/device restore acceptance and owner playtest. |
| 6 | Online game service | 15% | 85% | Server-authoritative 2–4 player rooms, secure dice, rule validation, transactional locks, monotonic versions, stale-command rejection, history, rematch and reconnect retry are implemented. Authenticated 10-second heartbeat maintains a 30-second presence lease; owner-configurable 5–120 second grace triggers one legal temporary-AI action, throttled under match-row lock, and reconnect restores human control. Outsider reads are rejected before AI processing. API integration tests cover takeover, reconnect, disabled policy, multi-seat behavior and concurrency. Remaining: push delivery, real network interruption and production-like multi-client UI acceptance. |
| 7 | Royal Club integration | 10% | 50% | Home tile, identity, latest-match recovery, history and player stats are integrated. Friend-only room invitations include expiry, account-scoped inbox, transactional accept/decline, notifications and lobby friend picker; only room host sees invite/cancel actions. Owner-only audited disconnect policy is exposed in admin. Competitive progression awards win +20 XP, loss +5, quit −5 (clamped at zero), preserves permanent levels with the shared level formula and exposes a top-50 XP leaderboard. Remaining: wider profile/league integration and live multi-device acceptance. |
| 8 | UX polish | 5% | 25% | Persian/English controls and status messaging are implemented. Board state changes use fade/scale transitions and haptic feedback; board semantics announce active colour, dice and token distribution; live regions announce turn/status and connection changes. Widget tests verify board semantics and locale behavior. Remaining: sound design, full accessibility audit, responsive visual polish and owner review. |
| 9 | End-to-end validation and stabilization | 5% | 35% | Code head `3bd2a31209f1a920ffb4bf45518e9f61c10499ef` passed exact-head API build/unit, PostgreSQL integration, Flutter analyze and all 152 Flutter tests, backgammon engine audit, Royal Club validation and Web Preview build (runs `42110757093`, `42110745467`, `42110757090`, `42110757125`, `42110757156`). The API suite also passes both final-hand and non-final-hand 3-second Hokm reveal regressions. Remaining: two-device live acceptance, real network interruption/reconnect, production-like load, deployed-device regression and owner sign-off. |

Weighted overall progress: **72.5%** (10%×100% + 15%×90% + 15%×55% + 15%×100% + 10%×50% + 15%×85% + 10%×50% + 5%×25% + 5%×35%). This is a conservative implementation estimate, not a release-readiness claim.

The latest fully green code-head validation is commit `3bd2a31209f1a920ffb4bf45518e9f61c10499ef`: API build/unit tests, PostgreSQL integration, Flutter analyze and all 152 Flutter tests, backgammon engine audit, Royal Club validation and Web Preview all passed (runs `42110757093`, `42110745467`, `42110757090`, `42110757125`, `42110757156`). The API build also runs the two 3-second Hokm hand-reveal regression cases introduced during main-branch reconciliation. Existing backgammon, chess and card-game regression suites remain part of the release gate.

## Priority 1–3 completion evidence (2026-11-06)

1. **Branch reconciliation:** PR [#171](https://github.com/Mrobaei1/Royal-club/pull/171) and PR [#172](https://github.com/Mrobaei1/Royal-club/pull/172) merged the then-current `main` commits into `feature/iranian-manch-foundation` only. PR #172 included latest main commit `678608cc5b410ea7523f200f64eadbe910f46c07`. At code head `3bd2a31`, the feature branch is 318 commits ahead and **zero commits behind** `main`; GitHub reports PR #110 mergeable. No merge of PR #110 into `main` was performed.
2. **Exact-head CI:** all required checks passed on `3bd2a31209f1a920ffb4bf45518e9f61c10499ef`: API build/unit, PostgreSQL integration, Flutter analyze, all 152 Flutter tests, backgammon regression audit, Royal Club validation and Web Preview (runs `42110757093`, `42110745467`, `42110757090`, `42110757125`, `42110757156`).
3. **Rules engine and test matrix:** approved baseline and every exposed profile switch are implemented and covered by 33 Dart engine tests plus 26 TypeScript rule-engine tests. The tests include deterministic complete games for 2, 3 and 4 players. Legacy v1 saves with historical consecutive-six counters above the current cap remain readable; the next roll safely caps the counter. Finished states cannot retain pending dice.

**Main-sync compatibility repair:** main's new Hokm reveal regression test referenced an absent `apps/api/src/hokm/room.ts` module. The isolated room domain and its four pure dependencies were restored from the existing Hokm validation branch, without adding Hokm API routes or production integration. The API suite now verifies both final and non-final hand reveal: all four players see remaining hands for exactly three seconds, while hands remain private during active play.

The branch remains a Draft PR and is not merged into `main`; remaining WBS phases concern device/network acceptance, UI polish, integration breadth and release sign-off, not these three priorities.

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
