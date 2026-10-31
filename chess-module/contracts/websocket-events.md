# Chess WebSocket contract (v1)

All events are authenticated by the existing account JWT. The server derives user identity from the authenticated connection; client-supplied user IDs are ignored. Every command carries `requestId` for retry correlation. Room membership and permissions are checked server-side.

## Client → server
- `chess:room:create`: `{requestId, settings}`
- `chess:room:join`: `{requestId, roomCode}`
- `chess:move`: `{requestId, gameId, from, to, promotion?}`
- `chess:draw:offer` / `chess:draw:respond`
- `chess:resign`
- `chess:chat:send`: `{requestId, gameId, text}`
- `chess:voice:request`: `{requestId, gameId, leaseId}`
- `chess:voice:release`: `{requestId, gameId, leaseId}`
- `chess:voice:signal`: `{gameId, signalType: offer|answer|candidate, payload}` (authenticated, active-game and host-enabled checks; payload capped for PostgreSQL notification limits)
- `chess:clock:sync`: `{requestId, gameId}`

## Server → client
- `chess:room:created`, `chess:room:joined`, `chess:room:error`
- `chess:state`: canonical FEN, PGN, side to move, status, clocks, revision
- `chess:move:accepted` / `chess:move:rejected`
- `chess:clock`: server timestamp and remaining milliseconds for both sides
- `chess:chat:message`: username, message, server timestamp
- `chess:voice:granted`, `chess:voice:occupied`, `chess:voice:released`, `chess:voice:disabled`
- `chess:voice:signal`: relayed to the other participant; sender identity is server-derived
- `chess:opponent:disconnected` / `chess:opponent:reconnected`

Public player payloads contain username and public chess statistics only. They must never include legal name, phone, email, or other private account fields.
