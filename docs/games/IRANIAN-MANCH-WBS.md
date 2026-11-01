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
| 4 | Pure Dart rules engine | 15% | 50% | Deterministic core, serializable state, configurable profile and scenario tests exist; edge-case coverage and full CI verification remain. |
| 5 | Offline game mode | 10% | 15% | Initial local pass-and-play screen, dice flow, legal-move selection, turn progression and restart are implemented; bot opponents, save/resume and full test verification remain. |
| 6 | Online game service | 15% | 0% | Not implemented. |
| 7 | Royal Club integration | 10% | 5% | Home-screen Manch tile and navigation are added; player profiles, match history, settings and full account integration remain. |
| 8 | UX polish | 5% | 0% | Not implemented. |
| 9 | End-to-end validation and stabilization | 5% | 0% | Full Manch acceptance and multi-client validation not yet complete. |

Weighted overall progress: **37%** (10%×80% + 15%×75% + 15%×55% + 15%×50% + 10%×15% + 10%×5%). The offline implementation is an initial local pass-and-play slice, not a completed offline package: bot opponents, save/resume and verified acceptance remain outstanding. Online mode, full integration, polish and end-to-end acceptance also remain outstanding.

The last confirmed green CI snapshot was for commit `bb64e1d`. A later rules/test/documentation change is being validated separately; do not treat that newer commit as green until its own workflow runs complete successfully.

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
