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
| GET | `/api/v1/manch/matches/mine` | Recover the caller's latest waiting or active match after reconnect |
| POST | `/api/v1/manch/matches` | Create a 2-, 3- or 4-player room |
| POST | `/api/v1/manch/matches/:id/join` | Join the next available seat |
| GET | `/api/v1/manch/matches/:id` | Read match state and public usernames |
| POST | `/api/v1/manch/matches/:id/presence` | Refresh authenticated player's 30-second online lease |
| POST | `/api/v1/manch/matches/:id/invites` | Host invites an accepted friend to a waiting room |
| GET | `/api/v1/manch/invites` | List the authenticated player's incoming invitations |
| POST | `/api/v1/manch/invites/:id/accept` | Accept a friend invitation and claim a seat |
| POST | `/api/v1/manch/invites/:id/decline` | Decline an incoming friend invitation |
| GET/PATCH | `/api/v1/admin/game-disconnect-policies` | Owner-only audited disconnect/temporary-AI policy
| POST | `/api/v1/manch/matches/:id/roll` | Server-generated dice roll; requires `expectedStateVersion` |
| POST | `/api/v1/manch/matches/:id/move` | Apply a token move; requires `tokenIndex` and `expectedStateVersion` |
| POST | `/api/v1/manch/matches/:id/forfeit` | Two-player participant forfeits an active match; opponent wins |
| POST | `/api/v1/manch/matches/:id/rematch` | A participant creates a fresh waiting room with the same player count |
| DELETE | `/api/v1/manch/matches/:id` | Host cancels a waiting room |

## Seats and lifecycle
- 2 players: red, yellow.
- 3 players: red, green, yellow.
- 4 players: red, green, yellow, blue.
- A waiting room expires after 30 seconds if it is not filled.
- When the last required player joins, the room becomes active and red/host receives the first turn.
- A roll with no legal move is handled by the server. A six with no legal move preserves the same player's extra roll when the selected rule profile grants it; the response distinguishes that case from a true turn pass.
- If the selected profile applies a third-consecutive-six penalty, the rules engine advances the turn immediately; the API must not attempt to pass a nonexistent pending die.
- A normal winner is recorded when all four of that player's tokens reach the finish.
- In two-player matches, either participant may forfeit; the opponent is recorded as winner. Three- and four-player forfeit is intentionally rejected until multi-player withdrawal semantics are defined.
- After a match is finished, any participant may create a new 30-second waiting room for a rematch. The original opponent must explicitly join; the rematch does not silently enroll other players.
- Public match payloads expose usernames and seat colours, never email or full name.

## Persistence
`manch_matches` stores the versioned JSON game state, status, current user turn, room code, player count, expiry, state version, winner user and finish reason. `manch_match_players` stores the user-to-seat mapping. The JSON game state schema matches the Flutter `ManchGameState.toJson/fromJson` contract.

## Friend invitations and disconnect takeover
- Only the room host can invite a user who is already an accepted Royal Club friend.
- Invitation expiry never exceeds the waiting room's own expiry. The inbox is account-scoped; only the invited user can accept or decline.
- Acceptance rechecks friendship, invitation expiry, room status and seat capacity inside a transaction with row locks.
- The Manch lobby loads the accepted-friends list for the host's invite picker and displays incoming invitations with accept/decline actions.
- Each active client sends an authenticated presence heartbeat every 10 seconds. A 30-second lease determines online/offline status.
- The server performs legal temporary-AI actions only after the owner-configured grace period (default 30 seconds, bounded 5–120). Match-row locking serializes actions and a two-second throttle prevents rapid repeated actions. On return, the player's heartbeat processes any overdue AI action before restoring human control.
- The owner-only policy is exposed in the admin panel; each policy change is audited.

## Not implemented yet
- WebSocket/push delivery; the client currently uses bounded 2-second state polling.
- Ranked records, rating/progression, spectator access and league integration.
- Production-like multi-client/two-device acceptance and real-network interruption testing.
- Final owner acceptance of the board visuals and rule profile.

These remaining capabilities are not release-ready until their end-to-end tests and owner acceptance are complete.


## Concurrency contract
- Roll, move, and forfeit requests must include the exact `expectedStateVersion` from the latest server snapshot.
- The API locks the match row and rejects stale commands with HTTP 409 and the current version before mutating the match.
- Clients must reload the authoritative snapshot after a 409; they must never infer or fabricate a new version.


## Completed-match history
- `GET /api/v1/manch/matches/history` returns up to 50 finished matches for the authenticated player only.
- Each record includes winner, finish reason, monotonic state version, timestamps and the seated player usernames.
- The online lobby displays wins/losses and finish reason; history loading is supplementary and does not block room discovery when unavailable.


## Player statistics

`GET /api/v1/manch/matches/stats`

Requires authentication. Returns only the authenticated player's aggregate results from finished matches in which they participated.

```json
{
  "stats": {
    "played": 12,
    "wins": 7,
    "losses": 5
  }
}
```

Waiting, active, and cancelled rooms are excluded. A multiplayer finished match counts as one win for its winner and one loss for each other participant. Accounts with no finished matches receive zero values.
