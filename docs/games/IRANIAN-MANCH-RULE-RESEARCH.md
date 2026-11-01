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

The following researched options are **not implemented yet** and must not be presented as supported until code and tests exist: `startingCellsSafe` as an independent switch, `threeEntryAttemptsWhenNoTokensOnTrack`, and `teamModeEnabled`. The current board visually marks each colour's entry cell as safe; the engine's safe-cell behaviour is driven by `safeTrackIndices`.

Default profile proposal (not yet owner-approved): common classic family rules, six-only entry, extra roll on six, exact finish, no automatic assumption about three-sixes or blockades until selected in the match settings. Never hard-code a disputed house rule into the core move algorithm.

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

These are secondary descriptions, not a national rulebook. The owner must confirm the desired Royal Club profile before the rules engine is frozen.
