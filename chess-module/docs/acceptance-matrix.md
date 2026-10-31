# Chess module acceptance matrix

| Area | Automated coverage | Remaining acceptance |
|---|---|---|
| Legal chess | Engine unit tests for ordinary/illegal moves, castling, en passant, promotion, checkmate, stalemate, repetition, 50/75-move and insufficient material | Remaining rare FEN edge cases and property-based legal-move fuzzing |
| Time controls | Defaults, active-player decrement/increment, automatic server timeout scheduler, row-lock adjudication and reconnect snapshot API | Simultaneous clock/move race tests and physical-device reconnect acceptance |
| Progression | Cost curve, cumulative thresholds, permanent levels, zero floor, win/draw/resignation deltas | PostgreSQL transactional/idempotency integration tests |
| Room level gate | Unit tests for threshold boundary | Authenticated route and hostile-client tests |
| Voice PTT | Exclusive lease, expiry, release, disconnect and disable unit tests; DB-backed lease, authenticated signaling relay, lease renewal and Flutter WebRTC client implemented | Multi-instance PostgreSQL atomicity, device permission, TURN/NAT traversal and two-device media acceptance |
| Mobile board | Widget tests for orientation and legal-move callback | Device layout, RTL/LTR, accessibility and promotion dialog acceptance |
| Chat | Persisted chat API, participant authorization, transactional per-player rate limit, PostgreSQL notification trigger and WebSocket delivery implemented | Spam/rate-limit and two-device live test |
| Profiles | Authenticated username-only profile API, aggregate stats and bilingual profile card with in-game detail sheet implemented | API payload privacy regression tests and full public profile stats |
| Admin settings | Time-control CRUD API, manager permission check, transactional audit trail, immutable active-game snapshots and bilingual manager screen | API permission regression tests and full host-app wiring |

A row is not complete merely because a contract or placeholder exists. Integration readiness requires every automated test to pass, the remaining acceptance items to be closed or explicitly accepted, and owner approval for the separate merge step.

| Room lifecycle | Private-room expiry, host cancellation, matchmaking queue expiry/status polling, pending draw expiry and terminal draw cleanup | Concurrent room join/cancel race tests and two-client matchmaking acceptance |
| PostgreSQL migrations | Migrations 001–006 applied in an isolated PostgreSQL 16 integration test; timeout adjudication and progression side effects exercised against a real database | Production schema review and multi-instance contention tests |
| Flutter API transport | Authenticated HTTP/WebSocket client for lobby, moves, chat, profiles, draw, admin and voice | Full host application wiring and device-level reconnect tests |
