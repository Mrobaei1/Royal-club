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
- The hakem is the first player to lead after choosing trump.
- Play proceeds clockwise.
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
| R-02 | First hakem | Supplied as a round input; default seat 0 in tests | Random draw, previous winner, rotating seat, or another method? |
| R-03 | Hakem rotation | Not specified in current round controller | Who becomes hakem next hand, and does rotation continue after a hand/match boundary? |
| R-04 | Deal order | Five cards per player in clockwise seat order, starting with hakem | Confirm dealer, first recipient, direction and whether the same order applies to both deal stages. |
| R-05 | Hakem selection timing | Hakem chooses after first five cards and before remaining eight | Confirm whether selection is mandatory, whether a timer/auto-choice exists, and whether the hakem may change their choice. |
| R-06 | Early hand finish | First team to seven tricks wins immediately | Confirm whether play stops at 7, or all 13 tricks must be completed for special scoring. |
| R-07 | Hand scoring | Each normally won hand awards exactly 1 match point to the winning team; no special bonus applies. | **Approved (2026-11-01):** one match point per won hand; no koti/coat or other special hand bonus unless separately approved later. |
| R-08 | Special scores | No special score or bonus is used. | **Approved (2026-11-01):** no koti/coat and no other special hand-scoring bonuses. |
| R-09 | Match completion | Manager target is 3/5/7 | Confirm match ends immediately when target reached and whether a tie is possible/allowed. |
| R-10 | Starting team/first lead | Hakem leads first trick | Confirm whether this applies to every hand and how first hakem is selected. |
| R-11 | Illegal/missed turn | Server validates legal card and turn | Confirm timeout, invalid action, repeated invalid action and disconnect consequences. |
| R-12 | Draw/abandoned match | Not specified | Define behavior for unrecoverable room loss, all players leaving, or match cancellation. |
| R-13 | Intentional exit | -5 XP once; Hard bot permanently takes seat; match continues | Confirm whether this also applies in a practice match (practice currently grants no XP) and whether re-entry is forbidden for that match. |
| R-14 | Disconnect | 20-second default grace, temporary bot takeover, no XP penalty | Confirm whether grace duration is fixed or manager-configurable, and whether reconnect is allowed after bot takeover. |
| R-15 | Team identity | Opposite seats are partners | Confirm seating orientation and whether seats rotate between hands. |

## 3A. Owner decisions recorded\n\n- **R-08 (2026-11-01):** The owner explicitly rejected applying the koti/coat rule. Taking all 13 tricks does not grant a koti bonus. Do not implement or award koti points. The ordinary hand scoring and any other special scoring still require confirmation.\n\n## 4. Existing code-to-spec discrepancies and risks

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
