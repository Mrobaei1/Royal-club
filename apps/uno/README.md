# Royal Club UNO — integrated client, separately deployed backend

The Royal Club root Flutter app now includes the UNO lobby/table client and home-screen entry. It resolves the persistent UNO service origin from the owner-managed, versioned and Ed25519-signed central API configuration. The backend in this directory remains a separate persistent Node.js service and must be deployed independently; no production deployment or database migration is implied.

## Product rules
- 2–6 seated players per table; host creates the table and players join with its short code.
- Every player explicitly marks ready. Readiness never starts a match automatically; only the host can press Start.
- Host selects 1, 3 or 5 round wins before the first round; all players ready again between rounds.
- Joining after the first round starts is rejected.
- Public identity is username only. Private hands go only to their owner; public state exposes card counts.
- Text chat is limited to seated players and can be disabled by the host.
- No voice/video calls, microphone capture, WebRTC, TURN or live-media signalling.
- Recorded voice messages are a possible future option only; they remain disabled and are not implemented in this package. Any future activation requires a separate owner decision and manager-controlled setting; no paid audio provider is permitted.

## Backend
Node.js 22+, TypeScript, Fastify and Socket.IO.

```sh
cd apps/uno
cp .env.example .env
npm install
npm test
npm run build
npm run dev
```

The service exposes `GET /health`. Socket.IO authenticates with the existing Royal Club HS256 access token and resolves only the public username from the existing users table. It does not accept client-supplied usernames or query full name/email.

## Flutter client
The production app client is integrated under `apps/mobile/lib/uno/` and verifies the Ed25519 signature on the central service configuration before connecting. `apps/uno/flutter/` remains an isolated/reference client package; it is not copied into the root app. The client requests no microphone permission and contains no audio/video or live-media dependency.

## Root-app integration and service discovery
- The root app exposes UNO from the home screen; the backend remains a separate persistent service.
- Configure the backend's stable HTTPS origin in the owner panel under Central game-service configuration. Each change creates a signed version; rollback creates a new signed version.
- `UNO_SERVER_URL` on the API is only the initial seed for a new configuration record. After initialization, the owner panel is authoritative.
- The mobile app does not use `--dart-define=UNO_SERVER_URL`; it fetches and verifies the signed configuration through the Royal Club API.

## Operational boundaries
- PostgreSQL snapshots restore rooms after restart. Because room mutations are currently process-local, the service acquires a PostgreSQL session advisory lock before loading snapshots and refuses to start if another instance owns it. This prevents concurrent replicas from corrupting snapshots; it does not provide horizontal scaling. Distributed per-room transactions and a shared Socket.IO adapter are still required before multi-instance operation.
- No production secrets or database credentials belong in this repository.
- No APK is built by this package.

## Socket events
Client: `uno:room:create`, `uno:room:join`, `uno:room:ready`, `uno:room:match-to-win`, `uno:room:start`, `uno:game:action`, `uno:chat:send`, `uno:room:communication`, `uno:room:leave`.

Server: `uno:room:state`, `uno:game:state`, `uno:game:hand`, `uno:game:private`, `uno:chat:message`.

All commands use acknowledgement envelopes. The gateway derives player identity from the verified token.
