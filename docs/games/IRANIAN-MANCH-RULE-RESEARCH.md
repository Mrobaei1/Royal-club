# Iranian Manch rules — research notes and implementation policy

## Finding
There is no single universally accepted Iranian household rule set established by the sources reviewed. Persian-language rule descriptions explicitly note local variation in safe cells, blockades, three consecutive sixes, and entry attempts. Therefore, the game engine must support a named rule profile and persist that profile with each match rather than silently treating one Ludo variant as the only Iranian rule.

## Common baseline supported by multiple Persian sources
- Usually 2–4 players.
- Four tokens per player.
- A six is required to bring a token out of the yard.
- Tokens travel around the shared track and then enter their own coloured home lane.
- Landing on an unprotected opponent token sends it back to its yard.
- Exact count is generally required to finish.
- Rolling a six commonly grants another roll.

## Known variant points
- Whether the third consecutive six forfeits the turn.
- Whether capturing an opponent grants another roll.
- Whether reaching the finish grants another roll.
- Which track cells are safe, and whether all starting cells are safe.
- Whether two same-colour tokens form a blockade and whether opponents may pass it.
- Whether a player with no token on the track gets up to three attempts to roll a six.
- Whether a four-player match may be played as two teams.
- Whether tokens can share a cell and whether friendly tokens may be stacked.
- Whether entry requires a six only, or local variants allow another face.

## Engine implementation status
The current `ManchRuleProfile` implements these switches:
`entryFaces`, `extraRollOnSix`, `extraRollOnCapture`, `extraRollOnFinish`,
`threeSixPenalty`, `safeTrackIndices`, `blockadesEnabled`,
`blockadeBlocksOpponents`, `friendlyStackingEnabled`,
`exactFinishRequired`, and `maxConsecutiveSixes`.

The approved Royal Club release profile is the common classic baseline below. The engine exposes and tests every switch needed by that approved profile and its explicitly configurable rule variants. Three research-only household extensions remain intentionally outside the release contract: `threeEntryAttemptsWhenNoTokensOnTrack`, `teamModeEnabled`, and a separate `startingCellsSafe` flag. The latter is redundant because entry-cell safety is already represented by `safeTrackIndices`; it is not a missing capability. The former two require separate product decisions and must not be exposed in settings or implied by the approved baseline.

## Owner-approved base profile (2026-11-02)
The owner approved a common classic four-token profile for the Royal Club baseline: 2–4 players; entry on six only; an extra roll on six; exact-count finish; single unprotected opponent token is captured and returned to its yard; no extra roll on capture or finish; the four colour entry cells (0, 13, 26, 39) are safe; no three-consecutive-six penalty; blockades disabled; friendly stacking enabled. This matches the current `defaultManchRuleProfile()` and `ManchRuleProfile` defaults. The approval is for the base profile, not for every possible household variant.

The following switches are implemented and configurable in the current profile: entry faces, extra roll on six/capture/finish, three-six penalty and maximum, safe track indices, blockade enablement and opponent blocking, friendly stacking, and exact finish. Persist the selected profile with each match; never silently change rules mid-match.

The release rule contract is the owner-approved baseline plus the implemented profile switches listed above. The research-only extensions `threeEntryAttemptsWhenNoTokensOnTrack` and `teamModeEnabled` are explicitly excluded from this release and must not appear as selectable settings. A separate `startingCellsSafe` switch is unnecessary: its effect is fully represented by the existing `safeTrackIndices` field. The 2-/3-player seat arrangement remains an owner playtest/acceptance item, not an engine feature silently inferred from research.

## Automated rule/edge-case acceptance matrix

The release contract is the owner-approved classic baseline plus the profile switches listed above. The following matrix is covered by both client and server rule-engine tests; no unsupported household option is advertised as implemented.

| Rule area | Verified behaviour | Flutter/Dart test evidence | API/TypeScript test evidence |
|---|---|---|---|
| Seats and tokens | 2–4 players, four tokens each, unique colours and stable seat mapping | `creates two to four players...`, `two, three and four player seat allocations are stable` | `creates 2–4 player states...` |
| Entry and extra roll | Entry faces are configurable; six bonus is independent | `requires an entry face...`, `configured entry faces can capture...` | `requires a configured entry face...`, `entry on a configured face captures...` |
| Capture and safety | A single exposed opponent is captured; safe cells and stacked pairs are protected | `captures one opponent token...`, `all four globally configured safe cells...`, `a stacked pair is not captured...` | `captures a single opponent...`, `does not capture on a configured safe cell`, `a stacked pair is not captured...` |
| Blockades and stacking | Landing/path blocking and friendly stacking follow profile switches | `blockades block landing...`, `blockade before home lane...`, `friendly stacking can be disabled...` | `blockade blocks opponents...`, `blockade destination behavior...`, `friendly stacking can be disabled...` |
| Finish | Exact finish and optional overshoot are independent, winner is declared once | `requires exact count to finish...`, `non-exact finish clamps...` | `requires exact finish...`, `non-exact finish clamps...` |
| Bonus rules | Six, capture and finish bonuses are independently configurable | `capture extra roll follows...`, `finish bonus is controlled independently...` | `capture grants another roll only...`, `finish bonus is independent...` |
| Consecutive sixes | Base profile has no penalty; optional lose-turn penalty is tested; legacy counters remain readable | `base profile does not lose...`, `optional third consecutive six penalty...`, `preserves legacy six counters...` | `base profile preserves the third-six turn`, `optional third consecutive six penalty...`, `caps consecutive sixes...` |
| Invalid actions and state | Invalid dice, repeated rolls, illegal passes, finished-state actions and winner invariants are rejected | `rejects invalid dice...`, `a finished game rejects...`, `rejects state snapshots...` | `rejects invalid dice...`, `finished games reject...`, `requires completed-token and winner...` |
| Persistence and simulation | State/profile JSON round-trips; seeded complete games finish for 2/3/4 players | `saves and restores a complete in-progress game`, `deterministic simulations preserve...` | `round-trips the full versioned state...`, `seeded complete games preserve...` |

Exact-head validation on 2026-11-06 passed all 33 Flutter/Dart Manch engine tests and all 26 TypeScript Manch rule-engine tests as part of the green Flutter/API suites. The complete Flutter suite reported 152 passing tests.

## Open-source reference audit (pinned snapshots)

These repositories were inspected as references only; **no third-party source code has been copied into Royal Club**.

| Repository | Reviewed commit | Declared license | Relevance and decision |
|---|---|---|---|
| https://github.com/rojanparajuli/Flutter_ludo | `717b6218bdcf5211d75e2bc01950bd7c2db690f0` | MIT | Recent Flutter Ludo engine with bots, configurable rules and tests. Useful for architecture comparison; not adopted as a dependency. |
| https://github.com/smokelaboratory/fludo | `b0adc154d90e0f3e56b464f5961a1c5e2051b3b4` | Apache-2.0 | Flutter Canvas board reference; last source push is 2024, so treat as a drawing reference only. |
| https://github.com/choganhq/chogan | `4e400bf922e9774c156e2e71e643a424b5b85325` | MIT | Persian-language game collection; latest inspected commit concerns tutorial navigation, and no confirmed reusable Manch module was identified. Not adopted. |

The exact LICENSE text was reviewed at each pinned commit on 2026-11-01. The two MIT files require retaining the copyright and permission notice in copies or substantial portions. The fludo snapshot contains the full Apache-2.0 license, including its redistribution, attribution, NOTICE and patent provisions; its pinned tree contains LICENSE and no top-level NOTICE file. The three snapshots contain no additional top-level COPYING or NOTICE file. No source code, assets or dependencies from these repositories have been copied into Royal Club, so their redistribution obligations are not currently triggered. This audit covers the three reference snapshots only; it is not a complete inventory of the Royal Club dependency tree and is not legal advice.

## Sources reviewed
- Gift Club Persian rules article (published 19 Oct 2026): https://giftclub.app/fa/blog/ludo-rules
- Masa Persian Ludo rules and optional house rules: https://masa.io/fa/games/ludo
- AsNard Persian overview of Iranian/local variants: https://asnard.online/blog/manche-complete-guide/
- Beytoote Persian rule description: https://www.beytoote.com/fun/native-games/play7-game.html
- Wikijoo Persian encyclopedia entry: https://wikijoo.ir/index.php/منچ،_بازی

These are secondary descriptions, not a national rulebook. The owner has approved the base profile above; variant additions still require implementation, tests and a versioned rule-profile migration strategy.
