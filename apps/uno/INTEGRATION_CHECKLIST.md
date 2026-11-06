# UNO integration and release checklist

Root-app integration is merged. The backend remains a separate persistent service; production deployment, live database migration and APK creation still require explicit owner release authorization.

## Backend
- Deploy as a separate persistent Node.js 22 service only after explicit production release approval.
- Configure DATABASE_URL, JWT_SECRET and exact CORS_ORIGINS through approved secret stores.
- Keep one service instance until distributed per-room transactions and a shared Socket.IO adapter are implemented. The service now acquires a PostgreSQL session advisory lock before loading room snapshots and exits if another instance owns the lock; the integration test verifies a competing instance is rejected.
- Verify health, authenticated Socket.IO login, room restore, reconnect and private-hand isolation.

## Flutter
- Root client integration is complete in `apps/mobile/lib/uno/`; do not copy the isolated `apps/uno/flutter` package into the root app.
- The root client uses the authenticated Royal Club API and verifies the Ed25519-signed central game-service configuration before connecting.
- Configure the UNO HTTPS origin in the owner panel; the old build-time `--dart-define=UNO_SERVER_URL` path is removed.
- Do not add microphone permissions, audio/video dependencies or media infrastructure.
- Preserve navigation, theme, localization, login and username privacy.

## Acceptance
- 2-player and 6-player tables work; seventh player is rejected.
- No auto-start; all seated players ready and host explicitly starts.
- Match target 1, 3 or 5 round wins; all players ready again between rounds.
- New players cannot join after the first round starts.
- Text chat works during play and obeys the host switch.
- Disconnect/reconnect restores seat and private hand; host controls transfer when host disconnects.
- PostgreSQL restart restore and token-version revocation tests pass.
- Standalone CI and root CI pass; physical Android Persian/English tests still require device execution and evidence.
- APK build requires separate explicit owner instruction.

No voice/video calling, microphone permission, TURN service, live media or paid audio provider is required or permitted. Recorded voice messages remain a future optional capability, disabled and outside this release; activation requires separate owner approval and manager control.
