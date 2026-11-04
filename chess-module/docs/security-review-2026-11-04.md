# Chess module security review — 2026-11-04

## Executive result

**Internal source review: completed for the isolated chess module. Independent third-party security approval: not completed.**

This report records a code-level review and one corrected input-validation weakness. It does not certify the host-integrated or deployed Royal Club service.

## Reviewed scope

- HTTP route authentication hook and trusted identity adapter boundary.
- Game/room participant authorization and private game/history/chat access.
- Manager-only time-control mutation and audit-read authorization.
- SQL parameterization and PostgreSQL BIGINT identifier validation.
- Chat length and transactional per-user rate limit.
- WebSocket authentication hook, participant lookup, payload limit, JSON shape, command allowlist and ping limiter.
- PostgreSQL notification channel naming and cross-instance delivery model.
- Multi-device presence registration and cleanup paths.
- Transactional result/progression/rating settlement.
- Administrative audit event trigger and migration behavior.

## Finding fixed

### Profile path accepted out-of-range numeric identifiers

**Risk:** A route parameter containing only decimal digits was previously accepted without checking the PostgreSQL BIGINT upper bound or requiring a positive value. Values such as `9223372036854775808` could reach the database and produce avoidable database errors.

**Correction:** `GET /chess/players/:userId/profile` now uses the shared `isPositivePostgresBigintId` validator before issuing SQL.

**Regression coverage added:** zero, PostgreSQL BIGINT overflow and oversized decimal strings must return `400 invalid_user_id`.

**Verification:** Current-head CI run [41783043723](https://github.com/Mrobaei1/Royal-club/actions/runs/41783043723) is required to pass before this fix is considered verified.

## Positive controls observed in source

- User identity is obtained through an injected trusted adapter and checked as a positive PostgreSQL BIGINT before use.
- Game and offer IDs are validated before route handlers execute.
- Game state, history and chat reads are scoped to the two participants.
- Moves, resignations, draw claims and draw-offer actions re-check player membership and game state inside database transactions.
- SQL values are parameterized; notification channel names are built only from validated numeric game IDs.
- Chat is trimmed, bounded to 2,000 characters and limited transactionally to eight messages per player per ten seconds.
- WebSocket connections require participant membership; inbound payloads are capped at 16 KiB, only ping is accepted, malformed/unsupported commands close the connection, and ping traffic is rate-limited.
- Administrative settings and audit reads require the injected manager authorization check.
- Audit rows reject UPDATE and DELETE through a database trigger.

These are source observations; deployed behavior still depends on the host adapter, database role and runtime configuration.

## Residual security gates

| Area | Status | Required evidence |
|---|---|---|
| Host authentication | Not verifiable in isolated module | Review real bearer/session validation, issuer/audience, expiry, revocation, identity mapping and failure behavior |
| WebSocket browser origin policy | Not verifiable without host auth model | Verify cookie/token transport and enforce origin policy where browser credentials are used |
| Database privilege separation | Not verified against production roles | Runtime role must not own audit tables or alter/disable triggers; migration role must be separate |
| Global HTTP abuse controls | Host-level verification pending | Confirm gateway/global per-IP and per-account limits for room creation, moves, draw actions and expensive reads |
| Production TLS/proxy/secrets/logging | Not in isolated module scope | Review deployment configuration, secret handling, redaction and trusted proxy settings |
| Backup/restore | Not executed | Demonstrate restore of game history, ratings and audit records |
| External independent assessment | Not performed | Qualified third-party review / penetration test of the integrated staging deployment |

### Audit immutability qualification

The migration trigger blocks ordinary SQL UPDATE/DELETE operations. PostgreSQL table owners and superusers can still alter or disable triggers. The trigger alone must not be represented as tamper-proof against privileged database operators. Production role separation and restricted DDL privileges are mandatory.

## Explicit exclusions

No production endpoint was tested. No production migration, deployment, host-app wiring, APK build/distribution or PR merge was performed. The isolated chess module does not define the actual production authentication implementation.

No voice/video call, push-to-talk, WebRTC, microphone capture or paid audio infrastructure was introduced.

## Final disposition

The internal source-review work package is recorded as complete after current-head CI passes. **Work package 7 remains open as an independent-review gate** until a qualified external reviewer has examined the host-integrated staging deployment and supplied a dated report with scope, findings, remediation and retest evidence.
