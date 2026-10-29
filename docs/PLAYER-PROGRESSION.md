# Royal Club player progression (XP and permanent levels)

## Rules
- All accounts start at progression level 1 with 0 XP.
- A completed, server-validated online backgammon game awards +20 XP to its winner and +5 XP to its loser.
- An online game resignation awards +20 XP to the opponent and applies -5 XP to the resigning player, even if the match continues.
- Resigning the entire online match awards +20 XP to the winner and applies -5 XP to the quitter.
- Offline practice (against AI or two players on one device) does not call the server progression service and awards no XP.
- XP is cumulative: level-up costs are not deducted from XP.
- Level-up cost from level L to L+1 is round(300 + 5(L-1) + 0.08(L-1)^2).
- A stored level is permanent. XP loss can lower XP but cannot lower the stored level. XP is clamped at zero.
- Elo rating and the existing weekly leaderboard score remain separate from progression XP.

## Integrity
- The API is authoritative; clients do not submit XP deltas.
- Progression changes run inside the same PostgreSQL transaction as the corresponding online match transition.
- `backgammon_progression_events` records each participant's result using a unique (match_id, event_key, user_id) key to prevent retry/double-award.
- The offline training board remains local-only and has no progression award call.

## Verification
Unit tests cover the cost curve, cumulative thresholds, initial level, win/loss/quit deltas, zero floor, and permanent levels. API integration tests assert newly registered users report 0 XP and level 1. Run the API build, unit tests, and disposable-PostgreSQL integration suite before merging. This change does not authorize deployment or APK creation.
