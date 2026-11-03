# Royal Club — standalone chess module

This module is intentionally isolated from the production Flutter app and API. It is not registered in the app menu, imported by the existing server, deployed, or merged into `main`.

## Scope
- Server-authoritative legal chess using `chess.js`.
- Three seeded, manager-configurable time controls: 90 seconds, 5 minutes and 15 minutes.
- Server clocks, timeout adjudication, draw offers, resignation and immutable per-game settings snapshots.
- Private rooms with host cancellation and 10-minute expiry; random matchmaking with level compatibility, queue cancellation and status polling.
- Persisted in-game text chat with PostgreSQL-triggered WebSocket notifications.
- Username-only public profiles, independent XP progression and Elo ratings.
- Bilingual Persian/English Flutter lobby, board, text chat controls and manager time-control screen.

## Deferred voice-message policy
Royal Club is a games platform and will not provide voice calls, video calls, live push-to-talk, WebRTC media or media relay infrastructure. Those routes, clients, signaling handlers, dependencies and database lease objects are removed.

A future asynchronous voice-message feature may use a microphone button to record and send audio clips in chat. It is deferred and disabled for now. The current release must not request microphone permission, record audio, play voice messages, or provision paid audio infrastructure. The manager screen contains only a locked, disabled placeholder; there is no active feature flag or backend endpoint. Future activation requires the owner's explicit decision and an approved secure implementation. No paid provider or service may be enabled automatically.

## Structure
- `api/`: Fastify routes, chess engine, clocks, scheduler, matchmaking, progression, rating, WebSocket text chat and tests.
- `mobile/`: Flutter UI and authenticated API client.
- `database/migrations/`: isolated migrations `001` through `010`; never included in the production migration runner.
- `contracts/`: WebSocket event contract.
- `docs/`: architecture, security boundaries and acceptance matrix.

## Local verification

API, from `chess-module/api`:
```sh
npm install
npm test
npm run build
```

PostgreSQL migration integration tests run when `CHESS_TEST_DATABASE_URL` is set. The isolated GitHub Actions workflow provisions PostgreSQL 16 and runs the migration smoke test automatically. The API suite also compares adapter legal-move sets with the independent Stockfish engine in CI; local runs enable this test by setting `STOCKFISH_PATH` to the Stockfish executable.

Flutter, from `chess-module/mobile`:
```sh
flutter pub get
flutter analyze
flutter test
```

## Acceptance boundary
Green CI proves static analysis, automated tests and migration smoke tests only. It does not replace physical-device reconnect tests, accessibility and RTL/LTR device acceptance, production database review, or security review.

## Integration gate
Do not merge into `main`, register routes, expose a home-screen entry, deploy, migrate production, or build an APK without the owner's separate explicit instruction.

## Acceptance checklists

- [`docs/acceptance-matrix.md`](docs/acceptance-matrix.md): automated coverage and remaining gates.
- [`docs/device-acceptance-checklist.md`](docs/device-acceptance-checklist.md): two-device, reconnect, accessibility and staging load procedure.
- [`docs/security-resilience-checklist.md`](docs/security-resilience-checklist.md): authorization, input validation, concurrency and operational security review.
- [`docs/host-integration-plan.md`](docs/host-integration-plan.md): prepared host API/auth/database/UI integration sequence; no host wiring is performed before owner approval.
