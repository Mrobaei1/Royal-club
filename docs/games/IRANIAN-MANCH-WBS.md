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
| 5 | Offline game mode | 10% | Local 2–4 player flow, bot, save/resume, tests |
| 6 | Online game service | 15% | Server-authoritative rooms, turn/move validation, reconnect, concurrency tests |
| 7 | Royal Club integration | 10% | Home tile, account/friends/profile/history integration, API compatibility |
| 8 | UX polish | 5% | Animation, sound, accessibility, responsive and localization tests |
| 9 | End-to-end validation and stabilization | 5% | CI green, multi-client test evidence, no regressions |

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

Measured conservatively from committed implementation and available test evidence (latest report: 2026-11-03). Percentages below are completion within each work package, not the weighted contribution.

| ID | Work package | Weight | Current progress | Evidence / remaining gate |
|---|---|---:|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | 90% | Owner approved the common classic four-token baseline on 2026-11-02; configurable implemented variants are documented. Remaining: implement and test currently unsupported options and complete edge-case matrix. |
| 2 | Open-source research and license review | 15% | 90% | Three pinned reference snapshots and exact LICENSE texts reviewed; MIT notice obligations and Apache-2.0 redistribution/NOTICE/patent provisions recorded. No source/assets/dependencies copied; full Royal Club dependency-tree inventory remains. |
| 3 | Iranian board visual design | 15% | 55% | 52-cell board painter, four yards, four home lanes, entry markers and widget tests exist; final visual review and geometry acceptance remain. |
| 4 | Pure Dart rules engine | 15% | 55% | Deterministic core, serializable state, defensive immutable rule snapshots, blockade variants and scenario tests are implemented; broader edge-case coverage remains. |
| 5 | Offline game mode | 10% | 35% | Local 2–4 player pass-and-play, optional AI opponent, deterministic bot policy, easy/normal/hard difficulty selection, difficulty lock after the first roll, secure save/resume and widget tests are implemented; broader bot strategy and full play acceptance remain. |
| 6 | Online game service | 15% | 75% | Authenticated room lifecycle, 2–4 player seats, expiry/cancel, server-generated dice, server-side rule validation, transactional row locking, state versions, persistence, concurrent-roll protection, current-match recovery, two-player forfeit/winner metadata and rematch rooms are implemented. The client now ignores stale lower-version polling responses; disconnect grace/AI takeover, push delivery and multi-client UI acceptance remain. |
| 7 | Royal Club integration | 10% | 20% | Home-screen mode picker routes to offline AI/local modes and online lobby; authenticated identity and latest-match recovery are wired into the client. Friends/invite integration, profile/history, ranked records and settings remain. |
| 8 | UX polish | 5% | 10% | Initial Persian/English screen labels, status messaging and responsive scrolling are present; animation, sound, accessibility review and full localization/visual polish remain. |
| 9 | End-to-end validation and stabilization | 5% | 20% | CI is green on the earlier validated commit for API build/unit tests, API integration tests, Flutter analyze/widget tests and backgammon engine/AI regression; 101 Flutter tests passed. The latest head `4273ddc2de6752744166144ff185fdea48dc1542` includes offline bot difficulty locking and a guard against stale online polling responses; no completed CI run is attached to this head yet. Full multi-device acceptance, live reconnect and release sign-off remain. |

Weighted overall progress: **57.25%** (10%×90% + 15%×90% + 15%×55% + 15%×55% + 10%×35% + 15%×75% + 10%×20% + 5%×10% + 5%×20%). This is a conservative implementation estimate, not a release-readiness claim. Offline play has an initial AI/local mode and secure save/resume. Online play now has an initial server-authoritative API and client lobby/game flow, but reconnect, friend invitations, active-match recovery, concurrency stress and end-to-end acceptance remain outstanding.

Commit `e8191a329f6aeb526f8662d350a620ffc8977879` passed the API build/unit tests, API integration tests, Flutter analyze/widget tests (101 passed), backgammon engine/AI regression (41 passed), and Web Preview workflow. The API integration suite verifies same-version concurrent rolls yield one success and one HTTP 409. Current-match recovery, two-player forfeit/winner metadata and rematch creation are present in the current implementation. Additional 3-/4-player seat-allocation and non-member-forfeit regression tests, offline bot difficulty-selection/locking widget tests, and server-state invariant tests are present in the branch; their latest-head CI result is pending.

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
