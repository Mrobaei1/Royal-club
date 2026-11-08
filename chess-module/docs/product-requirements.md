# Chess module — product requirements and decisions

## Product boundary

- Chess is a standalone module under `chess-module/`; it is not registered in the production Flutter navigation or API.
- The module remains independently buildable and testable until the owner explicitly approves host integration.
- The server is authoritative for identity, room admission, legal moves, clocks, terminal results, rating and progression. Clients submit intents and render server state.
- The initial client is Flutter with Persian (RTL) and English (LTR) support. The service uses Fastify and PostgreSQL.
- Chess progression and Elo are independent chess records; chess XP is not shared with backgammon.

## Player experience

- Online play supports private rooms and random matchmaking.
- The host may configure a minimum opponent level; the server enforces it for both room joins and matchmaking.
- Seeded time controls are 90 seconds (ultra-fast), 5 minutes (rapid) and 15 minutes (classical). Managers may add, edit, enable or disable time controls; a game's time-control snapshot is immutable after creation.
- Players may use participant-only persisted text chat when enabled for the room.
- Players may offer, accept or decline draws; claim an eligible draw; resign; reconnect; and recover the authoritative board and clock state.
- Public player identity is username-based; private account details are not part of the chess public profile.
- Board interaction covers legal-move feedback, castling, en passant, all four promotions, checkmate, stalemate and claimable/automatic draw rules.

## Rating and progression

- New chess profiles start at level 1, 0 XP and 1200 Elo.
- Normal decisive result: winner +20 XP, loser +5 XP.
- Draw: both players +5 XP.
- Resignation: winner +20 XP, resigning player −5 XP.
- XP is cumulative lifetime XP; thresholds are cumulative and XP is not spent on level-up. Level never decreases and XP cannot fall below zero.
- Level-up cost for level L is `round(300 + 5 × (L − 1) + 0.08 × (L − 1)^2)`.
- Elo is separate from XP, uses the default K-factor of 32 and applies a zero-sum transfer between opponents, constrained by the valid PostgreSQL integer range.
- Each terminal result and its XP/Elo events must be settled exactly once in the same database transaction.

## Security, privacy and reliability

- Every HTTP and WebSocket operation requires trusted authentication; a client-supplied user ID is never authoritative.
- Only game participants may read or mutate their game, history, chat and draw state. Manager-only settings and audit routes enforce server-side authorization.
- PostgreSQL BIGINT identifiers are validated before database access; user input is validated at route boundaries.
- Moves, timeout adjudication, draw claims, resignation and progression settlement must be safe under concurrent requests and multiple API instances.
- Reconnect returns an authoritative snapshot; stale notifications must not roll the client back to an older revision.
- WebSocket messages are bounded and rate-limited. Chat is persisted, participant-only and rate-limited per player.
- Database migrations are isolated from the production migration runner and must be repeatable in a disposable test database before any separately approved production migration.
- Automated CI is necessary but does not substitute for two-device acceptance, staging load tests or independent security review.

## Explicit exclusions and deferred features

- No voice calls, video calls, live push-to-talk, WebRTC, microphone streaming, STUN/TURN or media relay.
- Asynchronous voice messages are deferred and disabled: no microphone permission, recording, playback, backend endpoint or paid audio provider is active.
- No production migration, host-app/API wiring, production deployment, APK build/distribution or PR merge is authorized by this document. Each remains a separate owner-controlled decision.

## Acceptance evidence

- Automated engine, API, PostgreSQL, WebSocket and Flutter tests are tracked in [the acceptance matrix](./acceptance-matrix.md).
- Physical two-device and staging procedures are tracked in [the device acceptance checklist](./device-acceptance-checklist.md) and [the security/resilience checklist](./security-resilience-checklist.md).
- Host integration prerequisites are tracked in [the host integration plan](./host-integration-plan.md).
- A checklist or plan is not evidence of a passed test; external checks remain blocked until executed and recorded with commit, environment and results.
