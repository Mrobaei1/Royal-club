# Iranian Manch — Work Breakdown Structure (Royal Club)

Status: active; implementation isolated on `feature/iranian-manch-foundation`.
Owner acceptance and rules confirmation remain required before final online release.

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

Measured conservatively from committed implementation and available test evidence (latest report: 2026-11-01). Percentages below are completion within each work package, not the weighted contribution.

| ID | Work package | Weight | Current progress | Evidence / remaining gate |
|---|---|---:|---:|---|
| 1 | Requirements and Iranian rule profile | 10% | 80% | Variant research and configurable profile exist; owner must approve the final local rule matrix. |
| 2 | Open-source research and license review | 15% | 75% | Candidate shortlist and selected license checks exist; exact commit pinning and full obligations audit remain. |
| 3 | Iranian board visual design | 15% | 55% | 52-cell board painter, four yards, four home lanes, entry markers and widget tests exist; final visual review and geometry acceptance remain. |
| 4 | Pure Dart rules engine | 15% | 55% | Deterministic core, serializable state, defensive immutable rule snapshots, blockade variants and scenario tests are implemented; broader edge-case coverage and owner-approved rules remain. |
| 5 | Offline game mode | 10% | 35% | Local 2–4 player pass-and-play, optional AI opponent, deterministic bot policy, secure save/resume and widget tests are implemented; broader bot strategy, difficulty settings and full play acceptance remain. |
| 6 | Online game service | 15% | 55% | Authenticated room lifecycle, 2–4 player seats, expiry/cancel, server-generated dice, server-side rule validation, transactional row locking, state versions, persistence and initial API integration tests exist; reconnect leases, active-match forfeit, push delivery, concurrency stress and multi-client UI acceptance remain. |
| 7 | Royal Club integration | 10% | 15% | Home-screen mode picker routes to offline AI/local modes and online lobby; authenticated account identity is used by the online service. Friends/invite integration, profile/history, ranked records and settings remain. |
| 8 | UX polish | 5% | 10% | Initial Persian/English screen labels, status messaging and responsive scrolling are present; animation, sound, accessibility review and full localization/visual polish remain. |
| 9 | End-to-end validation and stabilization | 5% | 10% | Engine, board, offline widget and API integration suites exist; latest CI has exposed widget-test failures now corrected and the newest run is pending. Multi-device, concurrency and full regression acceptance remain. |

Weighted overall progress: **50%** (10%×80% + 15%×75% + 15%×55% + 15%×55% + 10%×35% + 15%×55% + 10%×15% + 5%×10% + 5%×10%). This is a conservative implementation estimate, not a release-readiness claim. Offline play has an initial AI/local mode and secure save/resume. Online play now has an initial server-authoritative API and client lobby/game flow, but reconnect, friend invitations, active-match recovery, concurrency stress and end-to-end acceptance remain outstanding.

Latest CI for commit `1717a13` is running API build/tests and Flutter analyze/widget tests. The preceding Flutter run had 99 passing tests and one failing bot-widget assertion; that assertion was changed to verify persisted engine state. A separate third-six penalty edge case was also corrected in both mobile and API roll handling. Do not mark this snapshot green until the current run completes.

## Rule decisions that must be explicitly confirmed
- Token count per player (traditional default is four).
- First entry and whether a specific dice result is required.
- Extra turn on six and handling of consecutive sixes.
- Capture behaviour and exact safe-cell positions.
- Blockades / stacked pieces and whether they block passage.
- Exact roll requirement to finish and what happens when overshooting.
- Turn order and seat-to-colour orientation.
- Local variants for 2- and 3-player games.

## Definition of 100%
All nine work packages have evidence; game is playable offline and online; server validates all moves; reconnect and expiry are tested; Persian/English UI works; the game is integrated in Royal Club; CI is green; existing games pass regression tests; owner accepts the Iranian board and rule profile.
