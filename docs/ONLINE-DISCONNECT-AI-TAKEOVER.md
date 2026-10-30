# Online Disconnect / Temporary AI Takeover

**Implementation branch:** `feature/backgammon-disconnect-ai-takeover`  
**Status:** Implementation added on the feature branch; automated CI and review are pending. This is not yet part of `main` and is not deployed to Production.

## Behavior and defaults

- The mobile online-match screen sends an authenticated heartbeat during its existing three-second refresh cycle.
- When a match becomes active, the API creates a presence row for both participants.
- Backgammon's default disconnect grace period is 18 seconds after the last successful heartbeat.
- The manager policy supports an enabled flag, a 5–120 second grace period, and a takeover mode.
- Default policy rows are: backgammon = temporary AI after 18 seconds; cards = temporary AI after 18 seconds (policy only until card-game server integration exists); chess = wait until game end (no temporary AI moves by default).
- Policy reads and updates are owner-authenticated and every update is written to an append-only audit table in the same transaction. Policy updates serialize against AI turn processing. The existing fail-closed owner identity check remains in force; no owner ID is guessed or seeded.

## Server authority and concurrency

- The server stores last heartbeat, disconnect time, takeover state, takeover start, and last AI action per match/player.
- Human heartbeat/reconnect and AI processing both lock the match row before changing control.
- AI processing rechecks match status, whose turn it is, the policy and heartbeat age while holding the row lock.
- Human roll, move, batch-move and end-turn endpoints reject requests while the temporary AI owns that player's turn.
- The AI move selector uses the existing server-side backgammon rules, including bar entry, bearing off, maximum playable dice and the higher-die rule.
- A complete temporary AI turn is committed as one transaction and increments the existing state version once.
- A successful reconnect heartbeat clears the takeover assignment and restores human control. Any AI turn already committed before the reconnect remains a completed server action; no further AI action is scheduled after the fresh heartbeat.
- Persistent API hosts scan for due turns every two seconds. Serverless requests to the authenticated match-state endpoint also process a due takeover, so an opponent actively polling the board can advance the match without relying on an in-process timer.

## Tests added (not yet verified)

- Pure selector tests cover legal sequence selection, immutable input state, bar-entry priority, blocked entries and the higher-die rule.
- Integration tests cover the grace period, stale-human-request fencing, takeover, reconnect and restored human move control.
- A concurrency integration test submits simultaneous state polls and asserts that only one AI turn is committed.

The branch must pass API build/unit/integration checks, Flutter analyze/tests and the backgammon engine audit before merge. Do not mark this feature accepted until those checks pass and two-device manual acceptance is completed.

## Explicit boundaries

- No Production deployment or database migration was performed. The schema setup change exists only in source on this branch and will require the normal separately authorized release process before it can affect Production.
- No APK was built by this implementation work.
- No SMS, Agent runtime, delegated permission, paid feature, scheduled Neon trigger or Production configuration was activated.
- Chess and card-game takeover execution is not implemented by this backgammon-specific change; only their policy defaults are recorded for future game integration.
