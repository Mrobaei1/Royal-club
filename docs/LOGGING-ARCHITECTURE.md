# Royal Club Logging Architecture

## Scope

The API currently uses Fastify's Pino logger. This document defines the first implementation increment and the target architecture for production-scale observability. It does not claim that a centralized log backend or a 1,000-user load test is already deployed.

## Implemented in the API

- Structured Pino logging through the shared `createRoyalLoggerOptions()` factory.
- Server-generated UUID request IDs; caller-provided request IDs are not trusted.
- Safe request serialization: query strings and client IP addresses are omitted; route templates are preferred when Fastify has resolved one.
- Response serialization limited to the status code.
- Redaction of request bodies, authorization/cookie/API-key headers, proxy authorization, and response cookies.
- Configurable validated log level through `LOG_LEVEL`, defaulting safely to `info`.

## Event schema

Application events should use stable event names and structured fields rather than interpolated strings. Recommended common fields:

| Field | Meaning |
| --- | --- |
| `timestamp` | UTC event time |
| `level` | Pino severity |
| `service` | Stable service identifier |
| `event` | Stable snake_case event name |
| `req.id` | Server-generated request correlation ID |
| `trace_id` | Distributed trace ID, when tracing is enabled |
| `user_ref` | Pseudonymous user reference; never raw personal details |
| `game_id` | Game/match correlation ID, where applicable |
| `duration_ms` | Measured operation duration |
| `error_code` | Stable, non-sensitive error classification |

Do not log passwords, OTPs, access/refresh tokens, API keys, full request bodies, private chat contents, payment credentials, or unnecessary personal data. Financial and security audit records require a separate durable audit design and must not rely solely on ordinary application logs.

## Scale-out target

1. Keep log emission off request-critical database paths. Pino writes structured records to stdout/stderr.
2. In containerized deployments, collect stdout/stderr with an agent/collector (OpenTelemetry Collector or Vector).
3. Send operational logs to a dedicated backend such as Loki or an equivalent managed service; do not store high-volume logs in the primary game PostgreSQL database.
4. Use bounded buffering, batching, retry with backoff, and explicit backpressure/drop policies. Low-severity diagnostic events may be sampled/dropped under pressure; security and financial audit events must use a separately durable path.
5. Use OpenTelemetry traces/metrics to correlate API, WebSocket, game, and database latency.
6. Keep dashboards and alerting separate from the game request path.

## Initial retention proposal

These are planning defaults, not yet enforced: debug 2 days, info 7 days, warning 14 days, error 30 days, security 90 days. Audit retention must be set by legal and owner policy.

## Load and acceptance plan

Run staged tests at 100, 500, 1,000, and 2,000 concurrent simulated users. Measure request p50/p95/p99 latency with logging enabled and disabled, CPU/memory, emitted records/sec, collector queue depth, backend ingest delay, and dropped records. Verify no secrets appear in captured output. Define numeric latency and loss budgets before declaring the 1,000-user target passed.

## Deployment safety

No external logging backend, credentials, production environment variables, retention policy, or production deployment are configured by this code change. Configure the collector/backend and secrets in the target hosting environment after an owner-approved deployment plan.
