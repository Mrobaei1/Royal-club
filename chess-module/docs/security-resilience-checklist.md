# Staging security and resilience review

This is a verification plan for the standalone chess module. It does not authorize production deployment or claim that an external penetration test has been completed.

## Identity and authorization

- [ ] Verify every HTTP route rejects missing, malformed, expired and invalid bearer tokens.
- [ ] Verify the authenticated user identity is derived only from the trusted authentication layer, never from a request body or query parameter.
- [ ] Verify nonparticipants cannot read game snapshots, move history, chat, draw offers, profiles containing private data, or WebSocket events.
- [ ] Verify a participant cannot act for the opponent, alter player IDs, or change immutable game settings.
- [ ] Verify manager-only time-control and audit endpoints reject ordinary users and unauthorized manager roles.
- [ ] Verify username-based profile lookup returns only approved public fields.

## Input and protocol boundaries

- [ ] Fuzz all route path parameters, query parameters and JSON bodies with missing, null, wrong-type, oversized and boundary values.
- [ ] Verify room codes, game IDs, chat cursors, move coordinates, promotion values, time controls and opponent-level constraints are validated server-side.
- [ ] Verify WebSocket payload size, JSON shape, command allowlist and ping limiter under concurrent clients.
- [ ] Verify errors do not expose SQL, stack traces, tokens, internal hostnames or database details.
- [ ] Verify chat text is rendered as text and cannot inject HTML or executable content into any client surface.

## State integrity and concurrency

- [ ] Race moves from the same player, move versus timeout, draw claim versus timeout, draw response versus timeout, and resignation versus move across separate API instances.
- [ ] Confirm one terminal transition and one XP/rating settlement per game under every race.
- [ ] Verify idempotency keys/unique constraints protect every progression award and terminal result.
- [ ] Verify reconnect snapshots are authoritative and stale events cannot roll back a newer revision.
- [ ] Verify presence is reference-counted across multiple devices and released after abrupt disconnects.

## Database and operations

- [ ] Review all migrations for least privilege, indexes, foreign keys, constraints, lock duration and rollback safety.
- [ ] Verify the database role cannot bypass the immutable administrative-audit trigger or alter/delete recorded audit events.
- [ ] Confirm migration execution is isolated and repeatable in staging before requesting production approval.
- [ ] Verify database connection limits, pool saturation behavior, query timeouts and cleanup after client disconnects.
- [ ] Verify logs omit access tokens, authorization headers and unnecessary personal data.
- [ ] Verify backup/restore and recovery procedures for chess history, ratings and audit events.
- [ ] Run a bounded staging load test and capture API latency, DB latency, connection counts, event-loop utilization and error rates.

## Release gates

- [ ] Review dependency audit output and pin/approve dependency updates.
- [ ] Complete an independent security review of authentication integration and production configuration.
- [ ] Complete physical two-device acceptance and accessibility review.
- [ ] Obtain explicit owner approval before production migrations, host-app wiring, deployment, APK build/distribution or PR merge.

Record each result with commit SHA, environment, evidence link, tester and remediation/retest status. Mark unavailable external reviews as blocked rather than passed.
