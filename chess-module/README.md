# Royal Club — standalone chess module

This module is intentionally isolated from the production Flutter app and API. It is not registered in the app menu, imported by the existing server, deployed, or merged into `main`.

## Scope
- Server-authoritative legal chess using `chess.js`.
- Three seeded, manager-configurable time controls: 90 seconds, 5 minutes and 15 minutes.
- Server clocks, timeout adjudication, draw offers, resignation and immutable per-game settings snapshots.
- Private rooms with host cancellation and 10-minute expiry; random matchmaking with level compatibility, queue cancellation and status polling.
- Persisted in-game chat with PostgreSQL-triggered WebSocket notifications.
- Username-only public profiles, independent XP progression and Elo ratings.
- Push-to-talk with PostgreSQL-backed exclusive speaker leases, authenticated offer/answer/ICE signaling and a Flutter WebRTC client.
- Bilingual Persian/English Flutter lobby, board, game chat/voice controls and manager time-control screen.

## Structure
- `api/`: Fastify routes, chess engine, clocks, scheduler, matchmaking, progression, rating, WebSocket signaling and tests.
- `mobile/`: Flutter UI, authenticated API client and WebRTC voice client.
- `database/migrations/`: isolated migrations `001` through `005`; never included in the production migration runner.
- `contracts/`: WebSocket event contract.
- `docs/`: architecture, security boundaries and acceptance matrix.

## Local verification

API, from `chess-module/api`:
```sh
npm install
npm test
npm run build
```

PostgreSQL migration integration tests run when `CHESS_TEST_DATABASE_URL` is set. The isolated GitHub Actions workflow provisions PostgreSQL 16 and runs the migration smoke test automatically.

Flutter, from `chess-module/mobile`:
```sh
flutter pub get
flutter analyze
flutter test
```

## Voice deployment requirements
The host Android application must request microphone permission (`RECORD_AUDIO`) and internet access. iOS hosts must provide `NSMicrophoneUsageDescription`. The sample client includes STUN servers for development; production deployments should configure TURN over UDP/TCP/TLS and verify real-device NAT traversal. Microphone permission prompts and audio routing must be accepted on physical devices before voice is considered production-ready.

## Acceptance boundary
Green CI proves static analysis, automated tests and migration smoke tests only. It does not replace two-physical-device voice tests, reconnect/network-loss tests, accessibility and RTL/LTR device acceptance, production database review, or security review. The acceptance matrix tracks these separately.

## Integration gate
Do not merge into `main`, register routes, expose a home-screen entry, deploy, migrate production, or build an APK without the owner's separate explicit instruction.
