# Royal Club UNO — isolated development package

This package is deliberately standalone. It is not imported by the Royal Club mobile app or API, and it does not change the home screen, routes, database schema, deployment configuration, or any existing game.

## Product rules
- 2–6 seated players per table.
- The host creates the table; players join with its short code.
- Every seated player must explicitly mark ready.
- Readiness never starts a match automatically. Only the host can press Start.
- Joining before start resets readiness; joining after start is rejected.
- Player-facing identity is the public username only.
- Private hands are sent only to their owner; public game state exposes card counts.
- Text chat and voice chat can be independently disabled by the host.
- The host can mute a participant; a participant can mute their own microphone.
- Voice signalling is authenticated and limited to seated players.

## Backend
Node.js 22+, TypeScript, Fastify and Socket.IO.

```sh
cd apps/uno
cp .env.example .env
# Set JWT_SECRET to a random secret of at least 32 characters.
npm install
npm test
npm run build
npm run dev
```

The service exposes `GET /health`. Socket.IO uses the access token in `handshake.auth.token`. The verifier accepts the existing Royal Club HS256 JWT subject and expiry, then resolves only the public `username` from the existing `users` table using the verified subject. It never accepts a client-supplied username or queries full name/email. The service requires the existing `JWT_SECRET` and `DATABASE_URL`.

## Flutter client
The isolated Flutter package is in `flutter/`. It is not added to `apps/mobile/pubspec.yaml` and is not routed from the existing app. It provides the room/lobby, readiness, host start, card actions, private hand, text chat and WebRTC microphone controls. See `flutter/README.md` for platform permissions and TURN configuration.

## Important deployment boundaries
- The first room manager is in-memory and designed for one service instance. It is suitable for development and test; it is **not** a multi-instance production room store. Before production, replace it with an atomic PostgreSQL/Redis room repository and configure a Socket.IO Redis adapter.
- WebRTC voice uses a peer mesh for at most six participants. Reliable connectivity across restrictive NATs requires a TURN service; configure `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` in the mobile client. A managed SFU is the preferred production scaling path.
- The socket gateway accepts an injected token verifier; the server's HS256 verifier is intentionally isolated and must be checked against the current API token claims before deployment.
- No production secrets, database credentials, or TURN credentials belong in this repository.
- No APK is built by this package.

## Socket event contract
Client events: `uno:room:create`, `uno:room:join`, `uno:room:ready`, `uno:room:start`, `uno:game:action`, `uno:chat:send`, `uno:voice:mute`, `uno:voice:signal`, `uno:room:communication`, `uno:room:leave`.

Server events: `uno:room:state`, `uno:game:state`, `uno:game:hand`, `uno:chat:message`, `uno:voice:signal`.

Every command uses an acknowledgement envelope: `{ ok, data?, error? }`. Never trust client-supplied player IDs; the gateway derives identity from the verified token.
