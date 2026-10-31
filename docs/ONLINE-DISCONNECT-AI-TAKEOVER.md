# Online Disconnect / Temporary AI Takeover

**Implementation branch (historical):** `fix/pr61-rebased-on-current-main`  
**Pull request:** [PR #67](https://github.com/Mrobaei1/Royal-club/pull/67) — merged 2026-10-31.  
**Merge commit:** [69f315b](https://github.com/Mrobaei1/Royal-club/commit/69f315b2c2d38eba3c1e688ab48be77d17a2137c).  
**Original implementation commit:** [8bd4040](https://github.com/Mrobaei1/Royal-club/commit/8bd4040891fc49079b796706d72e0525c0516944).  
**Latest main HEAD verified:** [4171bb7](https://github.com/Mrobaei1/Royal-club/commit/4171bb7933a13eedb0bfc52ed51f7fe3c3d8b8bc).  
**Status:** Server-authoritative temporary AI takeover for backgammon is merged into `main`. Latest-main GitHub Actions passed API build/unit/integration tests, Flutter analyze/tests, and Web Preview build/deploy. Two-device manual acceptance remains pending; the merged code has not been deployed to Production.

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
- On serverless hosts, the reconnect heartbeat first processes an overdue turn before refreshing presence; this prevents a returning player from bypassing the AI turn when no background worker or opponent poll ran during the idle period.
- Long-running API hosts scan for due turns every two seconds. Authenticated match-state polling also attempts a due takeover.
- **Serverless idle limitation:** if all clients stop polling and the API scales to zero, no background execution is guaranteed. A due takeover is processed on the next authenticated state poll. No scheduled trigger was created or activated.
- **Live Neon configuration check (2026-10-30):** the `Royal-Club-API` production branch had no Function Triggers configured; its active `royalclubapi` deployment was version 79 from 2026-10-27 and predates merge commit `69f315b`. The implementation is merged into source but is not active in Production.

## Automated verification

Latest-main verification on 2026-10-31, SHA `4171bb7933a13eedb0bfc52ed51f7fe3c3d8b8bc`:

- [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353219): API build/unit/integration tests and Flutter analyze/tests passed.
- [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353226): API build/tests and Flutter analyze/widget tests passed.
- [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353203): API and Flutter checks, Web Preview build, and GitHub Pages deployment passed.
- [Royal Club Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/41177353201): the currently deployed API/database health workflow passed; this does not deploy the merged source.

The earlier exact-PR-head runs (including the backgammon engine audit on PR head `987a045`) remain historical evidence. The main-head runs above are the latest post-merge checks; the main-head workflow set did not include a separate backgammon engine audit.


Tests cover legal AI sequence selection, immutable input, bar entry, blocked entry, higher-die handling, grace-period behavior, stale-human-request fencing, takeover, reconnect, restored human control, reconnect-triggered takeover after serverless idle, concurrent state polls, a single state-version increment when a disconnected player has no legal move, owner-only audited policy changes, and physical deletion of an expired empty room by the scheduled cleanup route.

**Still required:** complete manual acceptance on two independent devices/accounts. CI does not prove real network-loss behavior or Android lifecycle behavior.

## Explicit boundaries

- No Production deployment or database migration was performed. The implementation/schema changes are merged into source on `main`; Production deployment remains pending.
- No APK was built as part of PR #67.
- No SMS, Agent runtime, delegated permission, paid feature, scheduled Neon trigger, or Production configuration was activated.
- Chess and card-game takeover execution are not implemented by this backgammon-specific change.
