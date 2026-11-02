# Hokm production API integration proposal

## Scope of this change

This branch ports the independently tested Hokm domain/service/scheduler modules into the current Royal Club API source and proposes authenticated /api/v1/hokm/* routes. It does not deploy or merge to main.

## Authentication and authority

- Every player request passes the existing requireMatchAuth JWT/session verification and derives the user ID only from the verified sub claim.
- Request-body user IDs are ignored for identity.
- The API adapter assigns owner only when the verified numeric JWT subject matches the server-side OWNER_USER_ID.
- Until the Royal Club owner explicitly approves and implements a broader delegated Hokm manager permission, report/appeal review is restricted to the configured owner. Ordinary players cannot review management records.
- If OWNER_USER_ID is unset or invalid, manager review fails closed.
- Player and manager projections omit raw round state/private hands.

## Database

The API startup migration creates:
- hokm_rooms: authoritative room JSON and compare-and-swap version.
- hokm_player_progress: XP/level aggregate linked to the Royal Club user.

The dedicated worker verifies that the migration is present before it starts.

## Dedicated worker

The Royal Club API may run in a serverless Neon Function runtime, where an in-process timer is not reliable. The Hokm deadline scheduler therefore runs as a separate long-lived Node process.

Build and start:
- npm run build
- npm run start:hokm-worker

Worker configuration:
- DATABASE_URL: same PostgreSQL database used by the API.
- HOKM_SCHEDULER_INTERVAL_MS: optional, default 250.
- HOKM_SCHEDULER_BATCH_SIZE: optional, default 100.

The worker uses the PostgreSQL CAS repository, handles SIGTERM/SIGINT, and logs only bounded operational error metadata (never hands, room payloads or credentials). It must be deployed as a separate always-on worker service with the same database network access. The API merge does not create or deploy that service automatically.

## Validation plan

- API build must compile all Hokm TypeScript modules and the worker.
- API integration tests must verify JWT-derived identity, private-hand isolation, owner-only report review, and unanimous cancellation.
- The isolated Hokm suite and PostgreSQL 16 restart/CAS test remain the domain-level evidence.
- Before production use, run migration against a production-like database, start two worker instances, verify restart and clock-drift behavior, monitor overdue deadlines, and complete four-device acceptance.

## Release boundaries

- This is a proposal branch / PR only; no production deployment or main merge is authorized by this work.
- No APK build is included.
- No voice/video calls, conference calls, live push-to-talk, WebRTC calling/signalling, TURN or media relay are allowed.
- Optional recorded voice messages remain dormant and disabled; this work adds no audio feature.

Implementation note: the TypeScript API build uses explicit adapter-option boundaries for repository and scheduler injection; this keeps the PostgreSQL adapter substitutable for the in-memory test repository and allows the worker to supply structured error monitoring.
