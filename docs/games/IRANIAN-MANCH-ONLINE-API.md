# Iranian Manch — Online API Contract

## Authority and trust boundary
The mobile client never chooses dice values or rule profiles and never writes game state directly. Until manager-controlled rule settings are integrated, the API assigns its canonical default rule profile. The API generates each die with a cryptographic random source, validates the active player, applies the server-side Manch rules implementation, persists the complete state, and increments a monotonic state version inside a PostgreSQL transaction.

A move is accepted only when all of these are true:
- The caller has a valid active Royal Club session.
- The caller is a member of the match.
- The match is active and it is the caller's turn.
- The submitted `expectedStateVersion` matches the locked database row.
- The token index is valid and the authoritative rules engine allows the move.

Stale requests return HTTP 409 and the current state version. The match row is locked with `SELECT ... FOR UPDATE`, so concurrent rolls and moves cannot both consume the same version.

## Endpoints
All endpoints require a Bearer access token.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/manch/matches` | List unexpired waiting rooms |
| POST | `/api/v1/manch/matches` | Create a 2-, 3- or 4-player room |
| POST | `/api/v1/manch/matches/:id/join` | Join the next available seat |
| GET | `/api/v1/manch/matches/:id` | Read match state and public usernames |
| POST | `/api/v1/manch/matches/:id/roll` | Server-generated dice roll; requires `expectedStateVersion` |
| POST | `/api/v1/manch/matches/:id/move` | Apply a token move; requires `tokenIndex` and `expectedStateVersion` |
| DELETE | `/api/v1/manch/matches/:id` | Host cancels a waiting room |

## Seats and lifecycle
- 2 players: red, yellow.
- 3 players: red, green, yellow.
- 4 players: red, green, yellow, blue.
- A waiting room expires after 30 seconds if it is not filled.
- When the last required player joins, the room becomes active and red/host receives the first turn.
- A roll with no legal move is handled by the server. A six with no legal move preserves the same player's extra roll when the selected rule profile grants it; the response distinguishes that case from a true turn pass.
- If the selected profile applies a third-consecutive-six penalty, the rules engine advances the turn immediately; the API must not attempt to pass a nonexistent pending die.
- A winner is recorded when all four of that player's tokens reach the finish.
- Public match payloads expose usernames and seat colours, never email or full name.

## Persistence
`manch_matches` stores the versioned JSON game state, status, current user turn, room code, player count, expiry and state version. `manch_match_players` stores the user-to-seat mapping. The JSON game state schema matches the Flutter `ManchGameState.toJson/fromJson` contract.

## Not implemented yet
- Friend-specific invitation records and invitation notifications.
- WebSocket push; the first client uses bounded 2-second state polling.
- Reconnect leases, disconnect grace periods and temporary AI takeover.
- Match history, ranked results, rating/progression, spectator access and league integration.
- Active-match leave/forfeit and rematch flows.

Do not advertise these deferred capabilities as available until their API, UI and integration tests are complete.
