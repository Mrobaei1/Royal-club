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

## Recommended implementation
Create a versioned `ManchRuleProfile` with explicit settings for:
`entryFaces`, `extraRollOnSix`, `extraRollOnCapture`, `extraRollOnFinish`,
`threeSixPenalty`, `safeTrackIndices`, `startingCellsSafe`,
`blockadeEnabled`, `blockadeBlocksOpponents`, `friendlyStacking`,
`threeEntryAttemptsWhenNoTokensOnTrack`, `exactFinishRequired`, and
`teamModeEnabled`.

Default profile proposal (not yet owner-approved): common classic family rules, six-only entry, extra roll on six, exact finish, no automatic assumption about three-sixes or blockades until selected in the match settings. Never hard-code a disputed house rule into the core move algorithm.

## Sources reviewed
- Gift Club Persian rules article (published 19 Oct 2026): https://giftclub.app/fa/blog/ludo-rules
- Masa Persian Ludo rules and optional house rules: https://masa.io/fa/games/ludo
- AsNard Persian overview of Iranian/local variants: https://asnard.online/blog/manche-complete-guide/
- Beytoote Persian rule description: https://www.beytoote.com/fun/native-games/play7-game.html
- Wikijoo Persian encyclopedia entry: https://wikijoo.ir/index.php/منچ،_بازی

These are secondary descriptions, not a national rulebook. The owner must confirm the desired Royal Club profile before the rules engine is frozen.
