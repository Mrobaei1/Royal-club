# Online Disconnect / Temporary AI Takeover

**Implementation branch:** `fix/pr61-rebased-on-current-main`  
**Pull request:** [PR #67](https://github.com/Mrobaei1/Royal-club/pull/67)  
**Verified source head:** `797ea417c07bdbed1b46ebe578ecc649cfdad932` (before documentation-only follow-up)  
**Status:** Automated checks pass. The PR remains Draft pending code review and two-device manual acceptance. This change is not merged into `main` and is not deployed to Production.

## Behavior and defaults

- The online-match screen sends an authenticated heartbeat during its existing refresh cycle (approximately every three seconds while the screen is active).
- When a match becomes active, the API creates a presence row for both participants.
- Backgammon's default disconnect grace period is 18 seconds after the last successful heartbeat.
- The owner policy supports an enabled flag, a 5–120 second grace period, and a takeover mode.
- Default policy rows: backgammon = temporary AI after 18 seconds; cards = temporary AI after 18 seconds (policy only; card-game execution is not implemented); chess = wait until game end (no temporary AI moves).
- Policy reads and updates require the configured numeric owner identity. Updates are written to an audit table in the same transaction. No owner ID is guessed or seeded.

## Server authority and concurrency

- Presence records store the last heartbeat, disconnect time, takeover state/start, and last AI action per match/player.
- Human heartbeat/reconnect and AI processing lock the match row before changing control.
- AI processing rechecks match status, current player, policy, and heartbeat age while holding the row lock.
- Human roll, move, batch-move, and end-turn endpoints reject requests when the disconnected player's turn is overdue or takeover is active.
- The AI selector uses the existing server-side backgammon rules, including bar entry, bearing off, maximum playable dice, and the higher-die rule.
- A complete AI turn is committed in one transaction and increments the match state version once.
- A successful reconnect heartbeat clears takeover and restores human control. An AI turn committed before reconnect remains a completed action.
- Long-running API hosts scan for due turns every two seconds. Authenticated match-state polling also attempts a due takeover.
- **Serverless idle limitation:** if all clients stop polling and the API scales to zero, no background execution is guaranteed. A due takeover is processed on the next authenticated state poll. No scheduled trigger was created or activated.

## Automated verification

All recorded CI workflows for exact source head `797ea417c07bdbed1b46ebe578ecc649cfdad932` completed successfully:

- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41044430078): API build/tests and Flutter analyze/tests passed.
- [Backgammon engine audit](https://github.com/Mrobaei1/Royal-club/actions/runs/41044430000): passed.
- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41044429983): API build/tests, API integration tests, and Flutter analyze/tests passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41044430010): build passed; deployment was skipped.

Tests cover legal AI sequence selection, immutable input, bar entry, blocked entry, higher-die handling, grace-period behavior, stale-human-request fencing, takeover, reconnect, restored human control, concurrent state polls, and owner-only audited policy changes.

**Still required:** review the full diff and complete manual acceptance on two independent devices/accounts. CI does not prove real network-loss behavior or Android lifecycle behavior.

## Explicit boundaries

- No Production deployment or database migration was performed. The schema changes exist only in source on this branch.
- No APK was built.
- No SMS, Agent runtime, delegated permission, paid feature, scheduled Neon trigger, or Production configuration was activated.
- Chess and card-game takeover execution are not implemented by this backgammon-specific change.
