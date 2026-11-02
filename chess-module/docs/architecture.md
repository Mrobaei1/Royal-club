# Architecture and integration boundaries

## Authority boundaries
The API is authoritative for move legality, side-to-move, clocks, game termination, rating/progression, room admission and manager settings. The mobile client renders state and sends intents; it never declares a result or submits XP deltas.

## Clock model
The selected time-control row is copied into a game snapshot at game creation. The game stores both remaining clocks, active side, server timestamp and increment. Only the active side loses time. A reconnect obtains the same server snapshot. Admin edits apply to future games only. Client countdowns are display interpolation, not authority.

## Progression
Chess has its own progression rows and event ledger; it reuses the approved Royal Club level curve but does not share XP with backgammon. New players start at level 1 / 0 XP. A normal win awards +20/+5, a draw +5/+5, and resignation +20/-5. XP is cumulative; level thresholds are cumulative and are not deducted. Level is permanent and XP has a zero floor. Event uniqueness and the game-result transaction prevent duplicate awards.

## Voice messages — deferred, not enabled
Royal Club is a games platform, not a voice/video calling application. Live voice calls, video calls, push-to-talk rooms, WebRTC media sessions, microphone streaming, TURN/STUN relay infrastructure and peer-to-peer media are explicitly out of scope.

A future **voice-message** feature may let a player record and send an audio clip from a microphone button in an existing chat. This is asynchronous message attachment functionality only; it must never create a live audio session or call. For the current release:
- Voice-message sending and playback remain disabled.
- Do not request microphone permission or initialize audio capture.
- Do not add or provision paid media relay services.
- Keep only manager-facing configuration scaffolding: a global enable/disable switch, optional per-chat/game availability, maximum recording duration and upload-size limits, plus a clear disabled-by-default state.
- Enabling the feature in a future release requires an explicit manager action and a separately approved implementation of secure recording upload, storage, access control, retention/deletion and playback.
- Any future provider credentials/API keys must be stored server-side in the manager-controlled secret configuration; never embedded in the mobile app or committed to source control.
- If no free and operationally acceptable storage/transport option is configured, the manager switch must remain unavailable or off. No paid service may be activated automatically.

## Integration gate
The module remains isolated from `apps/api/src/server.ts` and Flutter navigation. Its SQL migrations are not in the production migration runner. The API and mobile client are built/tested independently; integration remains a separate owner-approved step.
