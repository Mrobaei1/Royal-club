# Royal Club Hokm — Phase 1 Rules and Acceptance Baseline

Status: implementation baseline captured; owner-only rule confirmations remain explicitly listed below.
Scope: phase 1 (game specification and rules). This document does not authorize merging to `main`, production deployment, or APK generation.

## 1. Product and room model

- Hokm in Royal Club is online-only. There is no offline/practice match mode.
- A match has exactly four players in two fixed partnerships: seats 0 and 2 are partners; seats 1 and 3 are partners.
- Seats advance clockwise.
- A room is not removed because of elapsed time while it has occupants. Empty rooms may be expired/cleaned up.
- The reconnect grace period is 20 seconds by default and can be changed only by the owner/GM.
- Match target is configurable only to 3, 5, or 7 points by an authorized manager/owner; the current default is 7.
- Private room visibility is supported; room state and private card hands remain server-authoritative.

## 2. Cards and hand rules

- One standard 52-card deck: four suits, thirteen ranks per suit; no jokers.
- A new deck is shuffled server-side.
- The first hand's hakem is selected randomly from all four seats.
- From the second hand onward, the winning partnership controls hakem selection: if the previous hakem belongs to the winning team, they remain hakem; otherwise the player opposite the previous hakem on the winning team becomes hakem.
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
- Suit strength for Hard trump selection is calculated by suit card count first; ties are resolved by the sum of normal card rank values (2 through Ace).
- Manual trump selection is final and cannot be changed after confirmation.
- On a trump-selection timeout, the server applies the Hard bot's deterministic trump-selection heuristic.
- The server owns deadlines and automatic actions; clients cannot submit bot actions as if they were human commands.

## 4. End-of-hand reveal and privacy

- At the end of every hand, including a hand that does not end the overall match, all four players' remaining cards are visible to all four participants for exactly 3 seconds.
- During active play, a player sees only their own hand; opponent hands and undealt cards are never included in that player's projection.
- After the 3-second window, the revealed hands are removed from player views.
- The next hand cannot start before the reveal window expires.

## 5. Disconnect, cancellation, and recovery

- If all four players disconnect simultaneously, the server waits 20 seconds and then cancels the unfinished match without declaring a winner.
- One temporary disconnect: after 20 seconds, a temporary Hard bot takes the seat. If the player returns, control returns to them and the pending -5 XP deduction is removed. If they do not return before match completion, they receive -5 XP instead of the normal win/loss XP award.
- Two or three players who remain disconnected through their individual 20-second reconnect grace periods cause the match to be cancelled without a winner, match points, or XP changes. If all four disconnect, the separate 20-second all-four rule takes precedence.
- A voluntary forfeit permanently transfers the seat to Hard bot and queues a -5 XP penalty. The penalty is applied only if the match completes; a second voluntary exit cancels the match and clears all pending penalties.
- A voluntary cancellation requires affirmative consent from all four distinct participants. A rejection can be withdrawn/changed; fewer than four approvals do not cancel the match. Any cancellation clears match points and pending match XP changes, while preserving XP earned before the match.
- Unrecoverable technical failure cancels the match without fabricating a winner.
- Completed online match XP: winner +20, loser +5. Level never decreases.

## 6. Reports, appeals, and team communication

- A participant may submit a cheating report against another participant; reports do not automatically change the match result.
- A participant may submit an appeal. Review is restricted to the authorized manager/owner role and must not be exposed to ordinary players.
- Private text communication with members of the opposing team is allowed.
- Voice calls, video calls, conference calls, and live push-to-talk are prohibited. This phase adds no audio/video calling capability.

## 7. Automated acceptance evidence

The phase-one acceptance suite checks:
- 52-card deck completeness, uniqueness, shuffle determinism and input validation.
- random first hakem selection, winning-team hakem retention/rotation, four-seat deal, partner mapping, clockwise order, follow-suit, trick winner and first-to-seven scoring.
- five-card initial deal, hakem-only trump choice and eight-card second deal.
- player-private projections (no opponent hands or undealt deck).
- 7-second turn, 3-second reveal and 20-second all-disconnected constants and transitions.
- random legal card selection after a card timeout and Hard trump selection after a trump timeout.
- unanimous cancellation, all-four-disconnected cancellation, and two/three-player unrecovered-disconnect cancellation.
- deferred one-time forfeit/temporary-disconnect penalties, penalty removal on reconnect, and zero XP/score effects when a match is cancelled.
- Hard trump suit-count/rank-sum ordering and irreversible manual trump confirmation.
- report/appeal and room visibility/privacy rules where exercised by the service integration tests.

## 8. Owner decisions recovered and implementation status

- Questions 13–20: the recovered owner selections are reflected in card rank, trump strength, irreversible trump selection, disconnect/forfeit cancellation, and XP behavior.
- Question 21, option 1: XP never becomes negative; a -5 XP penalty floors at zero and the permanent level never decreases. Implemented in `applyXpChange` and covered by the progression tests.
- Question 22, option 1: after any match cancellation, the room closes immediately and all participants return to the Hokm lobby. The authoritative room becomes non-joinable with status `cancelled`; the mobile client now clears the room and returns to its lobby automatically when the cancellation event arrives. A retained cancelled-room record is kept for audit/idempotency; it is not an active room.
- Question 23, option 1: after a voluntary forfeit, no new player can occupy that seat before the match ends; the Hard bot permanently controls the seat through the end of the match. Implemented by the fixed four-seat started-room model and `forfeited`/bot control state; covered by an explicit no-replacement test. This is distinct from a temporary disconnect, where the original player may reclaim control during the match.
- A separate recovered decision on disconnect timeout scoring says an unrecovered disconnect that becomes a forfeit is scored like a forfeit: the disconnected player receives -5 XP (floored at zero) and the opposing team receives +20 XP on match completion. This remains consistent with the deferred penalty model; verify the exact trigger threshold against the separately approved disconnect grace rules before release.

The standard-rule baseline remains 5+8 dealing, hakem-leading, and first-to-seven-tricks. Phase 1 can be marked 100% only after all current-head API, service, and Flutter tests pass and the separately documented owner-rule timing/edge cases are reconciled.
