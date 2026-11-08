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

The worker's scheduler error callback is explicitly typed and emits only room identifier, error message, and event timestamp; it never logs private card state or database credentials.


## Exact-head CI trigger — 2026-11-06
The Hokm API/mobile proposal received source and test changes after the earlier recorded green runs. The branch's latest source head did not expose a GitHub Actions run in the repository evidence sweep. This entry intentionally triggers the repository's current validation workflows on the exact updated head; no test is considered passed until the resulting runs complete. Remaining product-rule questions Q25/Q26 must be resolved from the owner's recorded selections before acceptance. The current implementation uses a 20-second individual reconnect grace and a separate 20-second all-four-disconnected cancellation deadline. A separate 120-second reference remains unresolved; the 20-second implementation value is not treated as final owner-approved product wording until the original selection is verified. Production worker deployment and physical four-device acceptance remain release gates.


## Current-main reconciliation and evidence ledger — 2026-11-08

Canonical integration candidate: PR #195, branch `integration/hokm-current-main-rebase`. It is based on the current mainline snapshot and supersedes the stale/conflicting integration approach in PR #133 for validation purposes. Neither PR is authorized for merge until the owner explicitly approves.

### Engineering corrections made during reconciliation

- Fixed match progression so a voluntary forfeit or unrecovered disconnect receives exactly -5 XP and the opposing partnership is guaranteed +20 XP at match completion. The guaranteed +20 replaces, rather than stacks with, the ordinary award. Regression tests cover both forfeit and disconnect paths.
- Fixed a cumulative progression defect: room reads now hydrate account XP/level from `hokm_player_progress` before the next match transition. Without this, a new room could start with an empty per-room progression map and overwrite the player's previous aggregate. PostgreSQL hydration tests were added.
- Fixed early match completion after a disconnect: if the match ends before the 20-second reconnect takeover deadline, any player still disconnected is settled as a forfeit (-5 XP, no ordinary win/loss award, opposing partnership guaranteed +20 XP). A regression test covers completion before grace expiry.
- Added a stable forfeit idempotency key end-to-end so retries with the original room version return the committed result instead of applying a second action.
- Worker and PostgreSQL event-listener logs no longer serialize raw database error messages that could contain infrastructure details.
- The current mainline infrastructure-reliability agent catalog and its integration assertions were preserved during reconciliation.

### Current evidence state

- PR #195 is mergeable and exact-head GitHub Actions workflows have been triggered. A queued/in-progress state is not a pass; final results must be checked against the final head SHA.
- Automated source tests cover rules, private-hand projections, scoring, authenticated routes, PostgreSQL room persistence, room-event notifications, and mobile widgets/services.
- The dedicated Hokm deadline worker is a separate process. The API route integration does not itself provision or supervise that worker.

### Release gates that remain open

1. **Owner decision reconciliation:** Question 26 is recorded as option 1, but its original question/options are not present in the retrievable approved record. The exact next-hakem successor seat is also unresolved: the implementation/test selects the opposite seat when the previous hakem's partnership loses, while the recovered owner wording only says the hakem turn rotates. A separate 120-second timing reference also conflicts with the current 20-second individual reconnect and all-four-disconnected implementation. Do not change these rules based on inference; retrieve the original owner-approved wording and reconcile them before marking rules acceptance complete.
2. **Worker staging:** no staging environment or Hokm worker service is currently provisioned in the connected Railway project (the inspected project contains only a production environment and an undeployed UNO Server service). Create/approve an isolated staging environment first, then deploy two worker instances there; prove compare-and-swap prevents duplicate actions, restart recovery, shutdown behavior, clock drift handling, and overdue-deadline alerting. Do not attach the Hokm worker to the existing production environment without explicit owner approval.
3. **Physical acceptance:** complete a four-device match, verify all four players' 3-second hand reveal, private hands/chat, cancellation, owner controls, disconnect takeover and reconnect hand-back on real devices and real network interruption.
4. **Load and operational acceptance:** validate production-like concurrency, API/database pool limits, worker backlog and monitoring with recorded results.
5. **Final review:** exact-head API build/unit/integration, Flutter analyze/tests, web preview, security review and owner sign-off must all pass on the same final candidate head.

No production migration/deployment, worker provisioning, APK build, or merge to `main` is included in this evidence refresh.
