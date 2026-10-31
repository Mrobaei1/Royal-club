# Chess real-time contract (v1)

All WebSocket connections are authenticated by the account JWT and scoped to a game in which the user is a participant. The server derives identity from the authenticated connection; client-supplied user IDs are ignored.

## HTTP commands
The authoritative commands are exposed through authenticated Fastify routes:
- Room creation, join, host cancellation and time-control listing.
- Matchmaking join, queue cancellation and status polling.
- Move submission, game snapshot and paginated move history.
- Chat send/history, draw offer/respond and resignation.
- Clock timeout claim (automatic server scheduler remains authoritative).
- Voice lease request, renew, release, host enable/disable.
- Player profile and manager time-control CRUD.

## WebSocket client → server
- ping: {type:"ping"}; server replies with chess:pong.
- chess:voice:signal: {type, signalType:"offer"|"answer"|"candidate", payload}.
  - offer is accepted only from the active lease owner.
  - answer is accepted only from the other participant.
  - ICE candidates are accepted only while a valid lease exists.
  - SDP/candidate payloads are validated and capped; signaling is rate-limited per socket.

## WebSocket server → client
- chess:connected: authenticated game subscription is ready.
- chess:state: canonical FEN, PGN, status, clocks and revision.
- chess:chat:message: username, message and server timestamp.
- chess:draw:offered: offer ID only; sender identity remains private.
- chess:draw:response: offer ID and accepted/declined/cancelled status.
- chess:voice:granted / chess:voice:released: current speaker username and lease status.
- chess:voice:settings: whether the host has enabled voice.
- chess:voice:signal: relayed offer/answer/ICE payload; sender identity is not exposed.
- chess:opponent:presence: username and connected state; internal user IDs are not exposed.
- chess:pong and chess:error.

Move, chat and voice-lease events are emitted by PostgreSQL triggers so updates committed by any API instance reach subscribed clients. Draw-offer lifecycle events are emitted by the API after the transaction commits.

## Privacy
Public player payloads contain username and public chess statistics only. They must never include legal name, phone, email, or internal user IDs. Internal IDs may be used inside database operations and authenticated route paths but are not broadcast to other players.
