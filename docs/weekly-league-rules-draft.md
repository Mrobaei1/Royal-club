# Royal Club — Weekly League Rules (Draft for Review)

> **Status: DRAFT — NOT FINALLY APPROVED.** This document consolidates the league rules discussed so far. Items marked **Proposed / pending confirmation** must not be treated as binding product policy or implemented as final requirements until the owner explicitly approves them.

## 1. League setup and authority

- Weekly leagues may be created and scheduled in advance by the manager or an assistant who is authorized for the relevant game or league type.
- The manager or authorized assistant selects the tournament format and game-specific rules for each league. The format must suit the game; there is no single mandatory format for every game.
- Examples discussed: round-robin may suit chess; single-elimination may suit backgammon. These are examples, not hard-coded restrictions.
- League entry may be free or require an entry fee. The manager configures the fee.
- The schedule, format, entry fee, prizes, scoring, and applicable match rules should be disclosed before the league starts. After the official start, material rules and prize terms should be locked; exceptional changes should be logged and communicated.
- Registration closes at the scheduled start. The accepted entrant list and payment status are then locked, and the system generates and validates the bracket/schedule.

## 2. Tournament formats

The manager or authorized assistant may select a supported format appropriate to the game, for example:

1. **Single elimination:** one loss eliminates a player.
2. **Double elimination:** elimination follows two losses.
3. **Swiss:** a configured number of rounds, pairing players with similar results where possible.
4. **Round-robin:** players play all other entrants according to the configured schedule.
5. **Preliminary stage plus top four:** a configured preliminary stage advances four players to semifinals.
6. **Knockout with consolation matches:** an option previously discussed for backgammon to balance the number of games played.

This list is a draft of supported choices, not a decision that every format must be implemented immediately. Match length, tie-breakers, draw handling, clocks, disconnect rules, and other details must be configured for each game.

## 3. Odd participant counts and byes

- A bye may be assigned when needed, using a fair and auditable method.
- A bye/bye score must be recorded separately from a played match.
- **Previously discussed direction:** maximize fairness in bye distribution and report the actual number of games played by each participant.
- Whether byes may count as wins/points, how repeat byes are prevented, and whether a format must be rejected when equal actual game counts cannot be achieved remain subject to final confirmation.

## 4. Schedule and notifications

- As soon as registration closes, the system should generate and validate the competition bracket and schedule, then notify all entrants promptly.
- Each entrant should receive both:
  - the overall bracket/public schedule; and
  - a personal schedule showing their matches, opponent username, round, scheduled time, deadlines, and advancement path where known.
- Notifications should remain available in the in-app Notifications section for later review and be surfaced when the user next opens the app.
- Schedule changes should trigger notifications, with previous schedule versions retained for traceability.
- Public schedules and notifications must show usernames only, never a participant's full name.
- Generation and delivery should be server-side, retry transient delivery failures, avoid duplicate schedules/notifications, and never publish an invalid or incomplete schedule as final.
- Times and time zones must be clear to each participant.

## 5. Absence and rescheduling

- If a player is absent at the scheduled match time, the present player may initiate one second opportunity after waiting up to five minutes.
- The second opportunity is final and cannot be repeated.
- The absent player must be notified, and the offer must remain in their in-app Notifications section.
- If the absent player also fails to attend the final rescheduled opportunity, the absent player receives a technical loss and the opponent receives a win.
- **Still needs clarification:** whether the 12-hour limit is measured from the original match time or from the time the second opportunity is created; how to handle both players being absent; and how to distinguish player absence from a server/network outage.

## 6. Entry fees, prizes, and accounting

- Entry fees are manager-configurable; a league may be free.
- The manager sets prize amounts and ranking/payout rules based on the league's disclosed terms and available prize budget.
- Entry deductions, refunds, prize awards, and other wallet movements must be recorded in an auditable ledger with unique transaction identifiers to prevent duplicate charges or payouts.
- The final entrant list and payment status are locked at official start.
- A withdrawal before the official start may qualify for a full refund, as previously discussed. The cancellation/refund policy when the manager cancels a league or minimum participation is not met remains unconfirmed.
- No post-start changes should reduce or materially alter an entrant's announced prize entitlement without an explicitly approved exceptional policy.

## 7. Proposed decisions — pending owner confirmation

The following proposals have been added for review and are **not final decisions**:

1. **Minimum participants:** the manager decides whether to proceed, postpone, or cancel when participation is below the configured threshold; the decision and reason must be recorded in an audit history.
2. **Byes and fairness:** maximize balance in bye distribution and publish/report the actual number of played games for each participant.
3. **Final stage:** whether semifinals, a third-place match, and a final are held depends on the selected tournament format and the manager's decision; they are not mandatory for every format.
4. **Appeals deadline:** participants have 24 hours to submit an appeal about a result or tournament decision. The start point for the 24-hour period and the review/decision process still need to be defined.
5. **Both players absent or technical failure:** arrange an alternative time if feasible. The rules must still define what happens when rescheduling is not feasible and how verified platform/network outages are handled.

## 8. Other open items before final approval

- Minimum and maximum entrant counts by game and format.
- What happens if the minimum is not reached: cancel, postpone, or proceed by manager decision; refund handling.
- Exact 12-hour rescheduling interpretation and the time by which the replacement match must be played.
- Procedure for both players being absent and for platform/network failures.
- Match-specific rules, tie-breakers, draws, incomplete matches, disconnects, and technical losses.
- Appeal submission method, when the 24-hour clock starts, who reviews appeals, and whether a decision can be appealed again.
- Whether the last-day semifinals/third-place match/final applies only to formats that support it, and how the manager sets a feasible weekly schedule.
- Whether standings affect league points, experience, ratings, levels, or other progression separately; define each system explicitly.
- Cancellation and refund policy, including management cancellation and minimum-entrant failure.
- Audit-log access, result verification, dispute handling, and anti-cheating controls.

## 9. Approval rule

Nothing labelled **Draft**, **Proposed**, **Open**, or **Pending confirmation** in this document should be treated as a final requirement. The owner must explicitly confirm the remaining choices before this draft is converted into the final league policy or used as the basis for implementation.
