# Royal Club Hokm — Phase 1 Rules and Acceptance Baseline

Status: implementation baseline captured; owner-only rule confirmations remain explicitly listed below.
Scope: phase 1 (game specification and rules). This document does not authorize merging to `main`, production deployment, or APK generation.

## 1. Product and room model

- Hokm in Royal Club is online-only. There is no offline/practice match mode.
- A match has exactly four players in two fixed partnerships: seats 0 and 2 are partners; seats 1 and 3 are partners.
- Seats advance clockwise.
- A room is not removed because of elapsed time while it has occupants. Empty rooms may be expired/cleaned up.
- Match target is configurable only to 3, 5, or 7 points; the current default is 7.
- Private room visibility is supported; room state and private card hands remain server-authoritative.

## 2. Cards and hand rules

- One standard 52-card deck: four suits, thirteen ranks per suit; no jokers.
- A new deck is shuffled server-side.
- The implemented deal gives the hakem and other seats five cards each first. After the hakem chooses trump, each seat receives the remaining eight cards.
- The hakem chooses one of the four suits as trump and leads the first trick.
- Turns proceed clockwise.
- A player must follow the suit led when holding at least one card of that suit. If void in the led suit, any card in hand is legal.
- Each trick contains four clockwise plays. A trump card beats a non-trump card; otherwise the highest card in the led suit wins. A higher off-suit non-trump card does not win.
- The trick winner leads the next trick.
- A hand is won by the first partnership to reach seven tricks. The match score increases by one for the winning partnership; the match ends when the configured match target (3, 5, or 7) is reached.

## 3. Time limits and automatic actions

- Hakem trump selection deadline: 7 seconds.
- Every card-play deadline: 7 seconds.
- On a card timeout, the server selects uniformly by index from that player's currently legal cards; it must never select an illegal revoke.
- On a trump-selection timeout, the server applies the Hard bot's deterministic trump-selection heuristic.
- The server owns deadlines and automatic actions; clients cannot submit bot actions as if they were human commands.

## 4. End-of-hand reveal and privacy

- At the end of every hand, including a hand that does not end the overall match, all four players' remaining cards are visible to all four participants for exactly 3 seconds.
- During active play, a player sees only their own hand; opponent hands and undealt cards are never included in that player's projection.
- After the 3-second window, the revealed hands are removed from player views.
- The next hand cannot start before the reveal window expires.

## 5. Disconnect, cancellation, and recovery

- If all four players disconnect simultaneously, the server waits 20 seconds and then cancels the unfinished match without declaring a winner.
- Temporary individual disconnects use the configured reconnect grace and may be covered by a temporary Hard bot; a returning player regains control. Permanent forfeit is a separate action.
- A voluntary cancellation requires affirmative consent from all four distinct participants. A rejection can be withdrawn/changed; fewer than four approvals do not cancel the match.
- Unrecoverable technical failure cancels the match without fabricating a winner.
- A permanently forfeiting player is replaced by a Hard bot for the rest of the match; the forfeit penalty is -5 XP, applied once. Two voluntary exits cancel the match without a winner.
- Completed online match XP: winner +20, loser +5. Level never decreases.

## 6. Reports, appeals, and team communication

- A participant may submit a cheating report against another participant; reports do not automatically change the match result.
- A participant may submit an appeal. Review is restricted to the authorized manager/owner role and must not be exposed to ordinary players.
- Private text communication with members of the opposing team is allowed.
- Voice calls, video calls, conference calls, and live push-to-talk are prohibited. This phase adds no audio/video calling capability.

## 7. Automated acceptance evidence

The phase-one acceptance suite checks:
- 52-card deck completeness, uniqueness, shuffle determinism and input validation.
- four-seat deal, partner mapping, clockwise order, follow-suit, trick winner and first-to-seven scoring.
- five-card initial deal, hakem-only trump choice and eight-card second deal.
- player-private projections (no opponent hands or undealt deck).
- 7-second turn, 3-second reveal and 20-second all-disconnected constants and transitions.
- random legal card selection after a card timeout and Hard trump selection after a trump timeout.
- unanimous cancellation and all-four-disconnected cancellation.
- report/appeal and room visibility/privacy rules where exercised by the service integration tests.

## 8. Owner confirmations still needed before phase 1 can be declared 100%

The current source code explicitly labels regional dealing and early-finish rules as assumptions requiring confirmation. The canonical implementation currently uses 5+8 dealing, hakem-leading, and first-to-seven-tricks hand completion. These are documented as the current implementation baseline, not misrepresented as a newly supplied owner decision. The exact wording/options for the earlier numbered questions 15–23 were not available in the retrieved project record, so they are not guessed here.

Phase 1 can be marked 100% only after the owner confirms or amends those rule points and the complete phase-one suite passes on the current branch.
