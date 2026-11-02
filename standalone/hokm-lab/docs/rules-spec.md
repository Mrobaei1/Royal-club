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
| Practice | Offline/practice games award no XP. |
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
| R-04 | Deal order | Five cards per player in clockwise seat order, starting with hakem | Confirm dealer, first recipient, direction and whether the same order applies to both deal stages. |
| R-05 | Hakem selection timing | Hakem chooses after first five cards and before remaining eight | **Partially approved (2026-11-02):** hakem has a limited time to choose; if time expires without a choice, the system selects a trump suit automatically. Timeout duration and automatic-selection method remain open. |
| R-06 | Early hand finish | First team to seven tricks wins immediately | Confirm whether play stops at 7, or all 13 tricks must be completed for special scoring. |
| R-07 | Hand scoring | Each normally won hand awards exactly 1 match point to the winning team; no special bonus applies. | **Approved (2026-11-01):** one match point per won hand; no koti/coat or other special hand bonus unless separately approved later. |
| R-08 | Special scores | No special score or bonus is used. | **Approved (2026-11-01):** no koti/coat and no other special hand-scoring bonuses. |
| R-09 | Match completion | Manager target is 3/5/7 | Confirm match ends immediately when target reached and whether a tie is possible/allowed. |
| R-10 | Starting team/first lead | Hakem leads first trick | **Approved (2026-11-02):** the hakem leads the first trick of every hand. First hakem of each new match is selected randomly; subsequent hakem rotation follows R-03. |
| R-11 | Illegal/missed turn | Server validates legal card and turn | Confirm timeout, invalid action, repeated invalid action and disconnect consequences. |
| R-12 | Draw/abandoned match | Not specified | Define behavior for unrecoverable room loss, all players leaving, or match cancellation. |
| R-13 | Intentional exit | -5 XP once; Hard bot permanently takes seat; match continues | Confirm whether this also applies in a practice match (practice currently grants no XP) and whether re-entry is forbidden for that match. |
| R-14 | Disconnect | 20-second default grace, temporary bot takeover, no XP penalty | Confirm whether grace duration is fixed or manager-configurable, and whether reconnect is allowed after bot takeover. |
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
