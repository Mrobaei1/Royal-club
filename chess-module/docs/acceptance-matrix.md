# Chess module acceptance matrix

| Area | Automated coverage | Remaining acceptance |
|---|---|---|
| Legal chess | Engine unit tests for ordinary moves, illegal moves, castling, en passant, promotion and checkmate | Full edge-case suite: stalemate, repetition, 50/75-move, insufficient material, pinned pieces |
| Time controls | Defaults and active-player decrement/increment/timeout unit tests | Server DB snapshot, reconnect and simultaneous clock/move race tests |
| Progression | Cost curve, cumulative thresholds, permanent levels, zero floor, win/draw/resignation deltas | PostgreSQL transactional/idempotency integration tests |
| Room level gate | Unit tests for threshold boundary | Authenticated route and hostile-client tests |
| Voice PTT | Exclusive lease, expiry, release, disconnect and disable unit tests | Multi-instance PostgreSQL atomicity, device permission and real-time media transport |
| Mobile board | Widget tests for orientation and legal-move callback | Device layout, RTL/LTR, accessibility and promotion dialog acceptance |
| Chat | Event contract documented | Persisted chat, authorization, spam/rate-limit and two-device live test |
| Profiles | Username-only contract documented | API payload privacy regression tests and full public profile stats |
| Admin settings | Time-control and room settings model documented | Manager UI, permission checks, audit log and immutable active-game snapshots |

A row is not complete merely because a contract or placeholder exists. Integration readiness requires every automated test to pass, the remaining acceptance items to be closed or explicitly accepted, and owner approval for the separate merge step.
