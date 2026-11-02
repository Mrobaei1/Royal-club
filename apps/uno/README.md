# Royal Club UNO — isolated development package

Standalone and not imported by the Royal Club mobile app or API. Integration, deployment, database migration and APK creation remain separate owner-approval gates.

## Product rules
- 2–6 seated players per table; host creates the table and players join with its short code.
- Every player explicitly marks ready. Readiness never starts a match automatically; only the host can press Start.
- Host selects 1, 3 or 5 round wins before the first round; all players ready again between rounds.
- Joining after the first round starts is rejected.
- Public identity is username only. Private hands go only to their owner; public state exposes card counts.
- Text chat is limited to seated players and can be disabled by the host.
- No voice/video calls, microphone capture, WebRTC, TURN or live-media signalling.

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
The isolated Flutter package provides the lobby, readiness, host start, card actions, private hand and text chat. It requests no microphone permission and contains no audio/video or live-media dependency.

## Operational boundaries
- PostgreSQL snapshots restore rooms after restart, but only a single service instance is supported until room mutations use distributed per-room transactions and Socket.IO uses a shared adapter.
- No production secrets or database credentials belong in this repository.
- No APK is built by this package.

## Socket events
Client: `uno:room:create`, `uno:room:join`, `uno:room:ready`, `uno:room:match-to-win`, `uno:room:start`, `uno:game:action`, `uno:chat:send`, `uno:room:communication`, `uno:room:leave`.

Server: `uno:room:state`, `uno:game:state`, `uno:game:hand`, `uno:game:private`, `uno:chat:message`.

All commands use acknowledgement envelopes. The gateway derives player identity from the verified token.
