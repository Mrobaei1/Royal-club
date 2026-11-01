# UNO integration checklist (approval-gated)

This checklist prepares the UNO module for a later Royal Club integration. **Do not merge or wire it into the production app until the owner explicitly approves.** No existing game, route, home screen, or root mobile dependency is changed by this standalone branch.

## 1. Backend service

- Deploy apps/uno as a separate Node.js 22 service.
- Configure DATABASE_URL to the Royal Club PostgreSQL database and reuse the existing JWT_SECRET.
- Configure CORS_ORIGINS with the exact production web origins.
- Configure TURN_URL and TURN_SHARED_SECRET for a Coturn REST-auth server. Keep the shared secret in the hosting provider's secret store; never commit it.
- Follow [TURN_DEPLOYMENT_RUNBOOK.md](./TURN_DEPLOYMENT_RUNBOOK.md) for Coturn, DNS, TLS, firewall, credential, and cross-network verification. A successful /ice-config response alone does not prove media connectivity.
- Keep the service to **one instance** until room mutations use distributed per-room transactions and Socket.IO has a shared adapter. PostgreSQL snapshots currently preserve rooms across restarts but do not make multiple live instances safe.
- Verify /health, authenticated /ice-config, Socket.IO authentication, and room restore before opening access to players.

## 2. Flutter app (only after approval)

- Add the dependencies from apps/uno/flutter/pubspec.yaml to the root mobile app using compatible versions.
- Add UnoOnlineScreen behind the UNO game route; pass the signed-in player's access token, numeric/string user ID, and the UNO service base URL.
- Add Android permissions INTERNET, RECORD_AUDIO, and MODIFY_AUDIO_SETTINGS; keep Android minimum SDK at 23 or higher.
- Add iOS NSMicrophoneUsageDescription.
- Confirm that the existing Royal Club navigation, theme, localization, login, and username presentation are preserved.
- Do not expose full names, email addresses, or other private profile fields in UNO room state or chat.

## 3. Acceptance tests before release

- 2-player and 6-player tables work; a seventh player is rejected.
- The game does not auto-start; all seated players must be ready and only the host can start.
- Host can select 1, 3, or 5 round wins; all players ready again between rounds.
- A new player cannot join after the first round starts.
- Chat works during a match and obeys the host's chat switch.
- Microphone permission is requested only after the player taps the mic; host mute cannot be bypassed through the normal client.
- Voice works across separate Wi-Fi/mobile networks using the configured TURN service, including TURN/TLS fallback where UDP is blocked.
- Disconnect/reconnect restores the seat and private hand; host controls transfer if the host disconnects.
- PostgreSQL restart restore and token-version revocation tests pass.
- Run the standalone CI suite, then perform physical Android/iOS device tests.
- Build an APK only after a separate explicit owner instruction.

## 4. Explicit release gates

- [ ] Coturn host provisioned, patched, and monitored.
- [ ] DNS, TLS certificate, firewall listener ports, and relay port range verified externally.
- [ ] Coturn REST shared secret configured only in secret stores and matched by the UNO service.
- [ ] /ice-config returns time-limited credentials for an authenticated user; expired credentials are rejected by Coturn.
- [ ] Real Android devices on different networks complete a bidirectional voice call using a relay candidate.
- [ ] Voice mute, host mute, voice disable, reconnect, and participant leave are physically verified.
- [ ] iOS microphone permission and real-device audio path verified if iOS is in the release scope.
- [ ] Horizontal scaling remains disabled until distributed room transactions and a Socket.IO adapter are implemented and tested.
- [ ] Owner separately approves integration and, later, any APK build.

Infrastructure provisioning and physical-device testing are external deployment tasks. Documentation or green CI does not satisfy these gates.
