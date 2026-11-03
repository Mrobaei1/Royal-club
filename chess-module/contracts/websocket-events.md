# Chess real-time contract (v1)

All WebSocket connections are authenticated by the account JWT and scoped to a game in which the user is a participant. The server derives identity from the authenticated connection; client-supplied user IDs are ignored.

## HTTP commands
- Room creation, join, host cancellation and time-control listing.
- Matchmaking join, queue cancellation and status polling.
- Move submission, game snapshot and paginated move history.
- Persisted text chat send/history.
- Draw offer/respond, current-position or prospective-move draw claim, and resignation.
- Clock timeout claim (automatic server scheduler remains authoritative).
- Player profile and manager time-control CRUD.

## WebSocket client → server
- `ping: {type:"ping"}`; server replies with `chess:pong`.
- Ping is limited to 30 messages per connection in any rolling 10-second window.
- Maximum inbound WebSocket payload is 16 KiB.
- Malformed JSON and all commands other than `ping` close the connection with policy code 1008; oversized payloads are rejected by the transport.
- No media, microphone, WebRTC, signaling, TURN or STUN commands are supported.

## WebSocket server → client
- `chess:connected`: authenticated game subscription is ready.
- `chess:state`: canonical FEN, PGN, status, clocks and revision.
- `chess:chat:message`: username, message and server timestamp.
- `chess:draw:offered`: offer ID only; sender identity remains private.
- `chess:draw:response`: offer ID and accepted/declined/cancelled status.
- `chess:opponent:presence`: username and connected state; internal user IDs are not exposed.
- `chess:pong` and `chess:error`.

Move/chat database changes and draw-offer lifecycle changes are delivered through PostgreSQL notifications. Every committed terminal transition (checkmate, automatic/claimed draw, accepted draw offer, resignation, or timeout adjudication) also publishes `chess:state` after commit. Clients refresh the authenticated HTTP snapshot after a state event; that snapshot includes `drawClaimable` and `drawClaimReason`, which are not trusted from client input.

## Voice-message policy
Voice calls, video calls, push-to-talk, live microphone streaming, WebRTC and media relay are out of scope. A future asynchronous voice-message attachment may be considered separately. Until that work is explicitly approved and implemented, recording, microphone permission, upload, storage and playback remain disabled. The manager UI may display a locked, disabled placeholder only; it is not a working feature flag.

## Privacy
Public player payloads contain username and public chess statistics only. They must never include legal name, phone, email, or internal user IDs. Internal IDs may be used inside database operations and authenticated route paths but are not broadcast to other players.
