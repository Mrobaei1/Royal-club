# Royal Club — standalone chess module

This module is intentionally isolated from the production Flutter app and API. It is not registered in the app menu, imported by the existing server, deployed, or merged into `main`.

## Scope
- Server-authoritative legal chess using `chess.js` (BSD-2-Clause).
- Three configurable clocks: Blitz-like 90 seconds per player (user-facing name: Ultra-fast), Rapid 5 minutes, Classical 15 minutes.
- Clock settings are snapshotted when a game starts; changes affect new games only.
- Online chat, username-only public profiles, reconnect-safe server clocks, minimum opponent progression level, independent chess XP, and one-speaker push-to-talk lease.
- Persian/English-ready contracts and isolated migrations.

## Structure
- `api/`: engine, clock, progression, room policy, voice lease, tests.
- `mobile/`: Flutter client package placeholder; deliberately not wired into the host app.
- `database/migrations/`: isolated schema.
- `contracts/`: event and API contracts.
- `docs/`: architecture, security and integration gates.

## Local verification
From `chess-module/api`:
```sh
npm ci
npm test
npm run build
```

The host repository CI does not yet execute this isolated package. A dedicated CI workflow is added as part of the module. Passing package checks is necessary but not sufficient for integration: two-device acceptance, production DB migration review, and owner approval remain mandatory.

## Integration gate
Do not merge into `main`, register routes, expose a home-screen entry, deploy, migrate production, or build an APK without the owner's separate explicit instruction.
