# Live PostgreSQL acceptance test

The Node 20 Hokm workflow starts an ephemeral PostgreSQL 16 service and installs the `pg` driver only in the CI runner. The repository itself does not gain a runtime driver dependency from this test step.

When `HOKM_LIVE_DATABASE_URL` is set, `test/postgres-live.test.js`:
1. Applies the actual SQL migration to the ephemeral database.
2. Creates two independent repository/service instances backed by the same PostgreSQL Pool.
3. Races two joins against the same room version and requires exactly one compare-and-swap transition to succeed.
4. Completes room setup and starts a four-player match.
5. Persists all four disconnects and their all-disconnected deadline.
6. Constructs a new repository/service/scheduler instance to simulate process restart.
7. Polls the persisted deadline and verifies cancellation after the full 20-second grace, with no winner/result.

The test uses a UUID-scoped room/user prefix and deletes only those rows in its cleanup. It must run only against a dedicated disposable test database. Never point this test at a production database.

Without `HOKM_LIVE_DATABASE_URL`, the live test is skipped and the deterministic unit suite still runs. Production readiness still requires a separate owner-approved deployment/database acceptance using the actual Royal Club environment.
