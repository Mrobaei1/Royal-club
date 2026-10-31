# Architecture and integration boundaries

## Authority boundaries
The API is authoritative for move legality, side-to-move, clocks, game termination, rating/progression, room admission and voice ownership. The mobile client renders state and sends intents; it never declares a result or submits XP deltas.

## Clock model
The selected time-control row is copied into a game snapshot at game creation. The game stores both remaining clocks, active side, server timestamp and increment. Only the active side loses time. A reconnect obtains the same server snapshot. Admin edits apply to future games only. Client countdowns are display interpolation, not authority.

## Progression
Chess has its own progression rows and event ledger; it reuses the approved Royal Club level curve but does not share XP with backgammon. New players start at level 1 / 0 XP. A normal win awards +20/+5, a draw +5/+5, and resignation +20/-5. XP is cumulative; level thresholds are cumulative and are not deducted. Level is permanent and XP has a zero floor. Event uniqueness and the game-result transaction prevent duplicate awards.

## Voice
Push-to-talk uses a server-owned per-room lease with a short expiry. Only the first valid request wins. Releasing the button, disconnecting, lease expiry, or host disabling voice releases the lease. This in-memory reference implementation is for unit tests only; production must use a PostgreSQL transaction/row lock or atomic conditional upsert so multiple API instances cannot grant two speakers.

## Integration gate
The module is not wired into `apps/api/src/server.ts` or Flutter navigation. The isolated migration is not in the production migration runner. Integration requires review of the actual users schema, migration runner, WebSocket transport, authentication hooks, multi-instance lease atomicity, and UI acceptance.
