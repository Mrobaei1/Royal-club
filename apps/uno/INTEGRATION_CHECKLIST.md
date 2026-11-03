# UNO integration checklist (approval-gated)

Do not merge or wire this standalone module into the production app until the owner explicitly approves.

## Backend
- Deploy as a separate Node.js 22 service only after approval.
- Configure DATABASE_URL, JWT_SECRET and exact CORS_ORIGINS through approved secret stores.
- Keep one service instance until distributed per-room transactions and a shared Socket.IO adapter are implemented. The service now acquires a PostgreSQL session advisory lock before loading room snapshots and exits if another instance owns the lock; the integration test verifies a competing instance is rejected.
- Verify health, authenticated Socket.IO login, room restore, reconnect and private-hand isolation.

## Flutter
- Add only dependencies from apps/uno/flutter/pubspec.yaml to the root mobile app.
- Add UnoOnlineScreen behind the UNO route with access token, public user ID and service base URL.
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
- Standalone CI and physical Android Persian/English tests pass.
- APK build requires separate explicit owner instruction.

No voice/video calling, microphone permission, TURN service, live media or paid audio provider is required or permitted. Recorded voice messages remain a future optional capability, disabled and outside this release; activation requires separate owner approval and manager control.
