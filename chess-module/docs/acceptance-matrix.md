# Chess module acceptance matrix

| Area | Automated coverage | Remaining acceptance |
|---|---|---|
| Legal chess | Engine unit tests for ordinary/illegal moves, castling, en passant, promotion, checkmate, stalemate, repetition, 50/75-move and insufficient material | Remaining rare FEN edge cases and broader property-based fuzzing |
| Time controls | Defaults, active-player decrement/increment, automatic scheduler with concurrent PostgreSQL sweeps, timeout adjudication and duplicate-run idempotency, row-lock adjudication, concurrent move-vs-timeout integration race test and reconnect snapshot API | Physical-device reconnect acceptance and broader multi-instance stress testing |
| Progression | Cost curve, cumulative thresholds, permanent levels, zero floor, win/draw/resignation deltas, PostgreSQL XP/Elo awards and duplicate-result idempotency |
| Room level gate | Unit and PostgreSQL route tests cover minimum-level rejection, host cancellation and self-join rejection | Multi-account adversarial and concurrent admission acceptance |
| Voice PTT | Exclusive lease, expiry, release, disconnect and disable unit tests; DB-backed lease, authenticated signaling relay, lease renewal and Flutter WebRTC client implemented | Multi-instance PostgreSQL atomicity, device permission, TURN/NAT traversal and two-device media acceptance |
| Mobile board | Widget tests for canonical orientation, server-approved legal-move callback, stale-selection clearing on position updates, and terminal-game clock stop | Device layout, RTL/LTR, accessibility and promotion dialog acceptance |
| Chat | Persisted chat API, participant-only history access, transactional per-player rate limit, PostgreSQL notification trigger and WebSocket delivery implemented | Spam/rate-limit and two-device live test |
| Profiles | Authenticated username-only profile API, aggregate stats, and regression checks that hide full name, phone, email and internal user ID | Device acceptance and expanded per-time-control statistics review |
| Admin settings | Time-control CRUD API, manager permission checks, transactional audit trail, immutable active-game snapshots, PostgreSQL route tests and bilingual manager screen | Full host-app wiring and manager-role integration with the host application |

A row is not complete merely because a contract or placeholder exists. Integration readiness requires every automated test to pass, the remaining acceptance items to be closed or explicitly accepted, and owner approval for the separate merge step.

| Room lifecycle | PostgreSQL route tests cover private-room create/join/self-join/cancel/expiry, minimum-level denial, two-account matchmaking/cancellation, draw, chat, voice, moves, profiles, nonparticipant privacy and admin authorization | Multi-instance contention and actual two-device acceptance |
| PostgreSQL migrations | Migrations 001–009 applied in isolated PostgreSQL 16 integration tests; real-database route flows, concurrent timeout scheduler sweeps and exactly-once adjudication, expired draw-offer cleanup and audit schema exercised | Production schema review and multi-instance contention tests |
| Flutter API transport | Authenticated HTTP/WebSocket client, auto-connected game session view, server-synchronized clocks, reconnect handling, lobby and game controls | Full host application wiring and device-level reconnect tests |
