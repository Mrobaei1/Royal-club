# Architecture and integration boundaries

## Authority boundaries
The API is authoritative for move legality, side-to-move, clocks, game termination, rating/progression, room admission and voice ownership. The mobile client renders state and sends intents; it never declares a result or submits XP deltas.

## Clock model
The selected time-control row is copied into a game snapshot at game creation. The game stores both remaining clocks, active side, server timestamp and increment. Only the active side loses time. A reconnect obtains the same server snapshot. Admin edits apply to future games only. Client countdowns are display interpolation, not authority.

## Progression
Chess has its own progression rows and event ledger; it reuses the approved Royal Club level curve but does not share XP with backgammon. New players start at level 1 / 0 XP. A normal win awards +20/+5, a draw +5/+5, and resignation +20/-5. XP is cumulative; level thresholds are cumulative and are not deducted. Level is permanent and XP has a zero floor. Event uniqueness and the game-result transaction prevent duplicate awards.

## Voice
Push-to-talk uses a server-owned per-room lease with a short expiry. Only the first valid request wins. Releasing the button, disconnecting, lease expiry, or host disabling voice releases the lease. The API uses a PostgreSQL conditional upsert for exclusive leases. WebRTC offer/answer/ICE signaling is relayed over the authenticated game WebSocket, media is peer-to-peer, and the Flutter client renews the lease while the push-to-talk control is held. Device permission, TURN relay configuration, NAT traversal and two-device acceptance still require environment testing.


### Voice deployment requirements

The mobile voice client accepts an injected `iceServers` list. The checked-in Google STUN entries are discovery-only and do not provide a relay path when direct peer connectivity is blocked. Do not embed a TURN shared secret or long-lived TURN password in the mobile application.

Before production voice acceptance:

1. Provision a maintained TURN service (for example, coturn) with UDP and TCP listeners and TLS/TCP fallback on a reachable hostname.
2. Enable TURN REST API credentials with a server-side shared secret. Keep that secret in the API runtime secret store; never commit it or pass it through Flutter build defines.
3. Issue short-lived per-user credentials from the authenticated API (username expiry bound, password HMAC-SHA1 per the TURN REST convention) and deliver only the temporary ICE username/password to the authenticated game participant.
4. Configure the Flutter `ChessVoiceClient.iceServers` with the provider's `turn:`/`turns:` URLs and the temporary credentials. Keep STUN entries as additional candidates.
5. Validate relay-only connectivity and two-device push-to-talk over separate mobile networks, including microphone permission denial, background/foreground, network handoff and lease expiry.

Until these infrastructure and device checks pass, voice signaling is automated-test verified but media relay is not production accepted.

## Integration gate
The module remains isolated from `apps/api/src/server.ts` and Flutter navigation. Its SQL migrations are not in the production migration runner. The API and mobile client are built/tested independently; integration remains a separate owner-approved step.
