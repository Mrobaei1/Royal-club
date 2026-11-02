# Hokm — Product and Rules Specification (Draft)

**Status:** Draft for owner sign-off; not production authority until all open decisions are approved.
**Scope:** Standalone Royal Club Hokm module on `research/hokm-standalone`.
**Boundary:** Do not merge to `main`, deploy, run a live migration, or build an APK without explicit owner approval.

## 1. Confirmed owner decisions

| Topic | Confirmed rule |
|---|---|
| Players | Four seats, two partnerships; seats 0/2 are partners and seats 1/3 are partners in the current engine model. |
| Match target | Manager selects exactly 3, 5, or 7 match points. |
| Bot | Hard difficulty only; no user/room difficulty selector. Bot uses only its own hand and public information and submits moves through the common legal-move validator. |
| Intentional exit | The departing player receives -5 XP once; their seat remains in the same team and is permanently controlled by Hard bot for the rest of that match; match continues. |
| Temporary disconnect | Separate from intentional exit; default grace period is 20 seconds, no XP penalty, temporary Hard bot takeover after expiry, authenticated reclaim without undoing bot moves. |
| Match scoring | Each normally won hand awards exactly 1 match point to the winning team. No koti/coat bonus or other special hand bonus applies unless the owner later approves one. The match ends at the configured target of 3, 5, or 7 points, subject to the still-open R-09 completion details. |
| Match XP reward (separate from match points) | Only after the entire match ends: **each of the two players on the winning team individually receives +20 XP**, and **each of the two players on the losing team individually receives +5 XP**. No XP is awarded between hands. |
| Game modes | Royal Club is an online-only gaming project. Offline/practice Hokm matches are not part of the product scope. |
| Room cleanup | A room may be expired/cleaned only when it is completely empty. |
| XP curve | Level 1 starts at 0 XP; cost from level L to L+1 is round(300 + 5(L-1) + 0.08(L-1)^2); XP is non-spendable, cannot go below zero, and earned level never decreases. |

## 2. Current implementation assumptions — NOT YET OWNER-APPROVED

These behaviors are present in the current engine/controller, but must not be treated as signed-off regional rules:

- A 52-card standard deck: four suits, ranks 2 through Ace.
- Five cards are dealt to each player first; the hakem chooses trump; then the remaining eight cards are dealt to each player.
- The hakem is the first player to lead after choosing trump. This is an approved rule (2026-11-02): after all cards are dealt, the hakem leads the first trick.
- Play proceeds counterclockwise from the hakem. This is an approved owner rule (2026-11-02).
- Players must follow the led suit when able; otherwise they may play any card.
- Any trump beats any non-trump; otherwise the highest card of the led suit wins. Rank order is 2 low through Ace high.
- A hand ends when a team reaches seven tricks, or all thirteen tricks have been played.
- The team that wins a trick leads the next trick.
- Current seat/team mapping uses opposite seats as partners.

## 3. Decisions required for final rules sign-off

Each item below blocks Phase 1 completion until the owner chooses or explicitly delegates the decision.

| ID | Decision | Current code assumption | Required owner decision |
|---|---|---|---|
| R-01 | Regional variant | Generic Persian-style Hokm assumption | Confirm exact variant/house rules intended for Royal Club. |
| R-02 | First hakem | Supplied as a round input; default seat 0 in tests | **Approved (2026-11-02):** select the first hakem randomly from the four players. |
| R-03 | Hakem rotation | Not specified in current round controller | **Approved (2026-11-02):** from the second hand onward, the team that won the previous hand supplies the next hakem. If the previous hakem's team wins, the same hakem remains hakem. If the previous hakem's team loses, the next player in the winning team in the clockwise seat order becomes hakem (the player opposite the previous hakem). At the start of every new match, the first hakem is selected randomly from all four players. |
| R-04 | Deal order | **Approved (2026-11-03):** Deal counterclockwise, starting with the hakem; deal five cards to each player first, then after trump selection deal the remaining eight cards to each player in the same direction and starting order. |
| R-05 | Hakem selection timing | Hakem chooses after first five cards and before remaining eight | **Partially approved (2026-11-02):** hakem has a limited time to choose; if time expires without a choice, the system selects a trump suit automatically. Timeout duration and automatic-selection method remain open. |
| R-06 | Early hand finish | **Approved (2026-11-03):** The hand ends immediately when a team reaches seven tricks; award that team one match point and do not play the remaining tricks. |
| R-07 | Hand scoring | Each normally won hand awards exactly 1 match point to the winning team; no special bonus applies. | **Approved (2026-11-01):** one match point per won hand; no koti/coat or other special hand bonus unless separately approved later. |
| R-08 | Special scores | No special score or bonus is used. | **Approved (2026-11-01):** no koti/coat and no other special hand-scoring bonuses. |
| R-09 | Match completion | **Approved (2026-11-03):** The match ends immediately when a team reaches the manager-selected target of 3, 5, or 7 match points. A tied match result is not permitted; the match rules and state machine must always produce one winning team. |
| R-10 | Starting team/first lead | Hakem leads first trick | **Approved (2026-11-02):** the hakem leads the first trick of every hand. First hakem of each new match is selected randomly; subsequent hakem rotation follows R-03. |
| R-11 | Illegal/missed turn | Server validates legal card and turn | Confirm timeout, invalid action, repeated invalid action and disconnect consequences. |
| R-12 | Draw/abandoned match | Not specified | Define behavior for unrecoverable room loss, all players leaving, or match cancellation. |
| R-13 | Intentional exit | -5 XP once; Hard bot permanently takes seat; match continues | Approved for online matches: re-entry is forbidden for that match. Offline/practice mode is out of scope. |
| R-14 | Disconnect | 20-second grace, temporary bot takeover, no XP penalty | Approved: 20-second grace is the default and only the General Manager (owner) may change it. Reconnect after takeover is allowed and restores control immediately. |
| R-15 | Team identity | Opposite seats are partners | **Partially approved (2026-11-02):** play order is counterclockwise from the hakem. Seats remain fixed throughout the match; player positions do not rotate between hands. |

## 3A. Owner decisions recorded\n\n- **R-15 seating (2026-11-02):** Player seats remain fixed for the entire match and do not rotate between hands.\n- **R-10 play direction (2026-11-02):** Play proceeds counterclockwise from the hakem.\n- **R-10 first lead (2026-11-02):** After all cards are dealt, the hakem leads the first trick of every hand.\n- **R-05 manual choice (2026-11-02):** A hakem's manual trump selection is final immediately and cannot be changed. The remaining eight cards are dealt immediately after confirmation; the game does not wait for the unused portion of the 7-second selection window.\n- **R-05 automatic suit strength (2026-11-02):** Card ranks use the ordinary order, 2 lowest through Ace highest. Suit strength is evaluated by card count first; only when counts are equal are the sums of card rank values compared.\n- **R-05 (2026-11-02, partial):** Hakem must choose a trump suit within a time limit. If no choice is made before timeout, the system selects a suit automatically. The 7-second timeout and count-plus-rank-based automatic suit choice are approved; the exact scoring and tie-break formula still require owner approval.\n- **R-03 clarification (2026-11-02):** If the previous hakem's team loses the hand, the next player in the winning team in clockwise seat order becomes hakem (the player opposite the previous hakem). If the previous hakem's team wins, the same hakem remains hakem.\n- **R-02 match boundary (2026-11-02):** At the start of every new match, select the first hakem randomly from all four players.\n- **R-03 player substitution (2026-11-02):** If the hakem intentionally exits or is otherwise replaced by a bot, the bot controlling that same seat remains hakem; hakem status does not transfer merely because the seat is bot-controlled.\n- **R-08 (2026-11-01): The owner explicitly rejected applying the koti/coat rule. Taking all 13 tricks does not grant a koti bonus. Do not implement or award koti points. The ordinary hand scoring and any other special scoring still require confirmation.\n\n## 4. Existing code-to-spec discrepancies and risks

1. `engine.js` contains a generic `dealCards` helper that deals all 13 cards, while `round.js` implements the staged 5+8 deal. The canonical production rule must be chosen and the unused/ambiguous API clarified.
2. `round.js` currently treats seven tricks as an immediate hand finish. Any regional bonus requiring all thirteen tricks would require a different hand lifecycle.
3. `scoreTricks` currently returns the trick tally and identifies a team at seven; it does not implement match-point awards or special regional scoring.
4. Initial hakem selection/rotation is external to the round state machine.
5. The hand-to-match-point mapping is now owner-approved: one point per normally won hand, with no special bonuses. Match-end details remain open under R-09.
6. The current code's assumptions must not be silently promoted into approved product rules.

## 5. Acceptance criteria for Phase 1

Phase 1 is complete only when all of the following are true:

- Every R-01 through R-15 decision is marked **Approved**, **Not applicable**, or **Explicitly deferred** by the owner.
- The rulebook states the complete card/deal/hakem/turn/trick/hand/match lifecycle without contradictions.
- Normal and special scoring are defined with examples.
- Timeout, disconnect, intentional exit, reconnect, cancellation and room cleanup are unambiguous.
- The owner approves the final document; implementation and tests are then aligned to it.
- A rules traceability checklist maps each approved rule to code and automated tests.

## 6. Current status

Phase 1 remains **in progress**. This document separates confirmed owner decisions from implementation assumptions and enumerates the remaining sign-off questions. No unresolved assumption is considered an approved rule.


## Approved decisions

**R-11 unrecoverable server failure cancellation (2026-11-03):** If a server failure makes continuation of the match genuinely impossible and recovery is not possible, cancel the match. Do not determine a winner from the last saved state, record a match result, award match points, or award/deduct XP.

**R-10 unanimous voluntary departure cancellation (2026-11-03):** If all four players voluntarily leave the match before it ends, cancel the match. Do not record a match result, award match points, or award/deduct XP.

**R-09 no drawn match (2026-11-03):** A match cannot end in a draw. The first team to reach or exceed the configured match-point target is declared the winner.

**R-09 no drawn matches (2026-11-03):** A Hokm match must never end in a tie. The match flow and completion logic must always produce a winning team; a tied match result must not be recorded.

**R-09 immediate match completion (2026-11-03):** The match ends immediately when either team reaches the manager-configured target of 3, 5, or 7 match points. No additional hand is played after the target is reached.

**R-09 match end and no-draw rule (2026-11-03):** The match ends immediately when either team reaches the manager-configured target of 3, 5, or 7 match points. A match can never end in a draw; the rules and match state machine must ensure a winning team is determined.

**R-06 immediate hand completion (2026-11-03):** As soon as a team reaches seven tricks, the hand ends immediately. Award that team one match point; do not continue playing the remaining tricks.

**R-04 deal direction and sequence (2026-11-03):** Deal counterclockwise, beginning with the hakem. First deal five cards to each player; after the hakem selects trump, deal the remaining eight cards to each player, using the same counterclockwise direction and starting player.

**R-28 XP when one human remains (2026-11-02):** If only one human player remains connected/participating and Hard bots control the other three seats through match completion, the human player still receives the normal XP award based on the match result: 20 XP if their team wins, or 5 XP if their team loses. The all-bot/no-XP rule applies only when all four seats are bot-controlled through completion.

**R-28 XP for the remaining human player (2026-11-02):** If exactly one human player remains participating in the match and the other three seats are controlled by Hard bots, the human player receives the normal XP award based on their team's match result: 20 XP if their team wins, or 5 XP if their team loses. The all-bot/no-XP rule applies only when all four seats are bot-controlled through match completion.

**R-27 all-bot match completion awards no XP (2026-11-02):** If all four players remain disconnected and Hard bots complete the entire match for all four seats, none of the four players receives match XP, regardless of the result. This does not change the normal XP rules when at least one player participates or reconnects before the match ends.

**R-26 recovered disconnect does not reduce loser XP (2026-11-02):** A player on the losing team who temporarily disconnects but successfully reconnects before the match ends receives the normal 5 XP loser award, with no reduction or additional penalty for that recovered disconnection.

**R-25 recovered disconnect does not reduce winner XP (2026-11-02):** A player on the winning team who temporarily disconnects but successfully reconnects before the match ends receives the normal 20 XP winner award, with no reduction or additional penalty for that recovered disconnection.

**R-24 penalty stacking prevention (2026-11-02):** If a player qualifies for both the voluntary-exit penalty and the unrecovered-disconnection penalty in the same match, apply only one 5 XP deduction total. The two penalties do not stack.

**R-23 unrecovered disconnection XP penalty (2026-11-02):** If a player disconnects during an active match and does not reconnect before the match ends, apply a 5 XP penalty to that player at match end. This penalty applies once. A temporary disconnection that is recovered before match end incurs no such penalty. The rule is separate from the voluntary-exit penalty.

**R-22 voluntary-exit XP penalty timing (2026-11-02):** The 5 XP penalty for a voluntary match exit is applied once, at the end of the match, not immediately when the player exits.

**R-21 voluntary exit is final (2026-11-02):** When a player explicitly chooses to leave an active match, that seat remains under Hard bot control until the match ends. The departed player cannot rejoin or regain control of that same match. This is distinct from a temporary network disconnection and its reconnect grace flow.

**R-20 all players disconnected (2026-11-02):** If all four players lose connection simultaneously, the match continues without pausing under Hard bot control for all four seats. Each bot must use only its own hand and public game state, and every play must pass through the shared legal-move validator. Authenticated players regain control immediately when they reconnect, without rolling back completed bot moves.

**R-19 reconnect control restoration (2026-11-02):** If a disconnected player reconnects and is successfully re-authenticated while the match is still in progress, control returns to that player immediately from the current game state. Any moves already made by the temporary bot remain in place; there is no rollback. The player's normal 7-second turn timer applies when it becomes their turn.

**R-18 immediate next-turn start (2026-11-02):** When a player legally plays a card before the 7-second deadline, their turn ends immediately and the next player's 7-second timer starts immediately; the system does not wait for the unused portion of the previous turn.

**R-18 immediate turn transition (2026-11-02):** When a player successfully plays a legal card before the 7-second deadline, their turn ends immediately and the next player's 7-second timer starts immediately. The system does not wait for the unused portion of the previous player's timer.

**R-18 immediate turn advance (2026-11-02):** When a player legally plays a card before the 7-second deadline, the turn advances immediately to the next player; the system does not wait for the unused portion of the timer to expire.

**R-17 per-turn timeout (2026-11-02):** Each player has exactly 7 seconds to play a card on their turn. If the player does not play a card before the deadline, the Hard bot automatically selects and plays one legal card for that seat, following the game rules. This is a timeout takeover for that turn; it does not by itself count as a voluntary exit or incur an XP penalty.

**R-16 illegal card handling (2026-11-02):** If a player attempts to play an illegal card, the play is rejected and the same player may select a legal card. The turn does not advance and no penalty is applied.

- **R-16 illegal-card handling (2026-11-02):** If a player attempts to play an illegal card on their turn, the play is rejected and that same player may choose a legal card. The turn does not advance and no penalty is applied.


**R-14 disconnect grace configuration (2026-11-03):** The temporary-disconnection grace period is 20 seconds. Only the General Manager/owner may change this value; a game manager or other administrator cannot change it. After the grace period expires, Hard bot temporarily controls the disconnected seat. If the authenticated player reconnects during the match, control returns immediately without rolling back bot moves.

**R-13 online-only scope (2026-11-03):** Royal Club is an online-only gaming project. Offline/practice matches are not part of the product scope and must not be implemented or offered as a Hokm game mode. The approved voluntary-exit and XP rules apply to online matches only.


**R-29 mandatory follow-suit (2026-11-03):** A player must play a card of the suit led for the trick whenever they hold at least one card of that suit. If they hold none, they may play any card, including a trump.

**R-30 trick winner (2026-11-03):** If one or more trump cards are played in a trick, the highest-ranked trump wins the trick. If no trump is played, the highest-ranked card of the suit led wins. Cards from other non-trump suits cannot win the trick.


**R-31 next-trick lead (2026-11-03):** The player who wins a trick leads the next trick.

**R-32 card rank order (2026-11-03):** Card ranks are ordered from lowest to highest as 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen, King, Ace. This ordering is used when comparing cards within the same suit, including trump comparisons and automatic trump-selection tie-breaks.


**R-31 next trick lead (2026-11-03):** The player who wins a trick leads the first card of the next trick.

**R-32 card rank order (2026-11-03):** Card ranks are ordered from lowest to highest as 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack, Queen, King, Ace. For rank-based comparisons, this is the canonical order; suits do not change rank order except that trump status determines trick precedence as specified in R-30.


**R-33 standard deck (2026-11-03):** Use a standard 52-card deck consisting of four suits and ranks 2 through Ace, with no jokers.

**R-34 automatic trump selection (2026-11-03):** If the hakem does not manually select a trump suit within the 7-second selection window, the system selects automatically from the hakem's first five cards. Compare suits by card count; if tied, compare the sum of card rank values; if still tied, compare each tied suit's highest individual card; if still tied, choose randomly among the remaining tied suits. Rank order is 2 through Ace as approved in R-32.


**R-35 numeric card rank values (2026-11-03):** For rank-sum comparisons in automatic trump selection, use numeric values 2 through 10 at face value, Jack = 11, Queen = 12, King = 13, and Ace = 14.

**R-36 cancellation after multiple voluntary exits (2026-11-03):** If two or three players voluntarily leave an active match before it ends, cancel the match. Do not record a winner or match result, award match points, or award/deduct XP. This rule is distinct from the unanimously-approved four-player voluntary-departure cancellation and makes cancellation apply when at least two players voluntarily exit.

**R-37 cancellation after multiple unrecovered disconnections (2026-11-03):** If two or three players disconnect from an active match and do not reconnect within their 20-second grace periods, cancel the match. Do not record a winner or match result, award match points, or award/deduct XP. This cancellation rule does not apply to a single unrecovered disconnection, for which the existing Hard-bot takeover and XP rules remain in force.


**R-38 single-player voluntary exit (2026-11-03):** If exactly one player voluntarily exits an active match, the match continues with Hard bot permanently controlling that player's seat. The departed player cannot rejoin that match and receives a single 5 XP deduction at match end, subject to the existing no-stacking rule.

**R-39 single-player unrecovered disconnection (2026-11-03):** If exactly one player disconnects and does not reconnect before the match ends, Hard bot controls that seat after the 20-second grace period and the match continues. At match end, apply the player's normal team-result XP award (+20 for a win or +5 for a loss) and the existing single 5 XP unrecovered-disconnection deduction. Thus the net result before the XP floor is +15 XP for a winning player or 0 XP for a losing player. The deduction does not stack with a voluntary-exit deduction.

**R-40 canceled match has no retained scoring or XP effects (2026-11-03):** If a match is canceled under any approved cancellation rule, discard all match points accumulated in that match. Do not record a match result or award/deduct XP. Cancellation must have no effect on player ratings, rankings, or other progression derived from that match.


**R-38 single intentional exit (2026-11-03):** If exactly one player voluntarily leaves an active match, the match continues with Hard bot permanently controlling that player's seat until match completion. The departed player receives a single 5 XP deduction at match end and cannot rejoin that match.

**R-39 single unrecovered disconnection (2026-11-03):** If exactly one player disconnects and does not reconnect before the match ends, the match continues with Hard bot controlling that seat after the 20-second grace period. Apply the previously approved single 5 XP disconnection penalty at match end. Do not stack this penalty with the voluntary-exit penalty; if both conditions apply, deduct only 5 XP total. Reconnected players receive normal match XP as previously approved.

**R-40 cancellation clears all match effects (2026-11-03):** When a match is cancelled under any approved cancellation rule, discard all match-point progress and all provisional hand results from that match. Do not record a final result or apply any XP awards or deductions. Cancellation must have no effect on player ratings, rankings, or XP.


**R-41 XP floor (2026-11-03):** XP must never become negative. Any XP deduction, including the 5 XP intentional-exit or unrecovered-disconnection penalty, is capped at the player's current XP; the resulting XP value cannot be lower than zero.

**R-42 room behavior after cancellation (2026-11-03):** When a match is cancelled, close that match room immediately and return the players to the lobby. No cancelled room remains open awaiting manual closure.

**R-43 no replacement human after voluntary exit (2026-11-03):** After a player voluntarily exits an active match, their seat remains controlled by Hard bot until that match ends. A new human player cannot join and take over that seat during the same match.
