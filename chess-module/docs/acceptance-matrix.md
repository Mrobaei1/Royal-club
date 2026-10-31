# Chess module acceptance matrix

| Area | Automated coverage | Remaining acceptance |
|---|---|---|
| Legal chess | Engine unit tests for ordinary moves, illegal moves, castling, en passant, promotion and checkmate | Full edge-case suite: stalemate, repetition, 50/75-move, insufficient material, pinned pieces |
| Time controls | Defaults, active-player decrement/increment, automatic server timeout scheduler, row-lock adjudication and reconnect snapshot API | PostgreSQL integration and simultaneous clock/move race tests |
| Progression | Cost curve, cumulative thresholds, permanent levels, zero floor, win/draw/resignation deltas | PostgreSQL transactional/idempotency integration tests |
| Room level gate | Unit tests for threshold boundary | Authenticated route and hostile-client tests |
| Voice PTT | Exclusive lease, expiry, release, disconnect and disable unit tests; DB-backed lease, authenticated signaling relay and Flutter WebRTC client implemented | Multi-instance PostgreSQL atomicity, device permission, TURN/NAT traversal and two-device media acceptance |
| Mobile board | Widget tests for orientation and legal-move callback | Device layout, RTL/LTR, accessibility and promotion dialog acceptance |
| Chat | Persisted chat API, participant authorization, PostgreSQL notification trigger and WebSocket delivery implemented | Spam/rate-limit and two-device live test |
| Profiles | Authenticated username-only profile API and aggregate stats implemented | API payload privacy regression tests and full public profile stats |
| Admin settings | Time-control CRUD API with manager permission check and immutable active-game snapshots | Manager UI, audit log and permission regression tests |

A row is not complete merely because a contract or placeholder exists. Integration readiness requires every automated test to pass, the remaining acceptance items to be closed or explicitly accepted, and owner approval for the separate merge step.
