# Host application integration plan

This document prepares the eventual integration without changing the host application. The module remains standalone until the owner explicitly authorizes wiring it into the Royal Club app and API.

## API integration contract

The host API must provide the module with:

- The existing authenticated Fastify request hook; chess must not introduce a parallel token format or trust user IDs supplied by clients.
- A trusted identity resolver that returns the existing Royal Club numeric user ID as a decimal string.
- A manager authorization callback based on the host's actual manager-role policy; never infer manager rights from username, client state or a hard-coded account.
- The existing PostgreSQL pool and a database role with only the required chess-table privileges.
- A server-owned configuration source for the public API/WebSocket base URL and environment.

When approved, register the chess HTTP routes and WebSocket route in the existing API composition root. Keep them behind the same authentication, logging, CORS, request limits and shutdown lifecycle as the host API. Do not expose a second public listener unless the owner separately approves that architecture.

## Flutter integration contract

The host app must inject:

- Its current authenticated access token through a secure provider (do not persist a second token copy inside the chess module).
- The configured API base URI from the central host configuration.
- The signed-in user's stable Royal Club account identity and username.
- The localized app theme, navigation and manager-role result.

The module must not own login, signup, wallet, subscriptions, user identity creation or the global navigation policy. Add one chess entry point only after owner approval; normal users must never see manager controls.

## Database migration gate

- Review migrations 001–010 against the exact production schema and current migration ledger.
- Test forward application, rollback/recovery, indexes, locks, foreign keys and data retention in a disposable clone first.
- Confirm the host's bigint user IDs and username constraints before applying.
- Obtain explicit owner approval for the target environment and migration window.
- Apply through the repository's approved migration runner, not an ad-hoc production SQL session.
- Verify schema version, constraints, route smoke tests, backups and rollback readiness after approval.

No migration in this branch is part of the host production migration runner today.

## Security and product constraints

- All chess state and legal moves remain server-authoritative.
- All participant and manager checks remain server-side.
- Public profiles expose usernames and approved chess statistics only.
- No voice/video calls, live microphone, WebRTC, STUN/TURN, audio relay or paid audio provider may be integrated.
- Future asynchronous voice messages remain a separate owner-approved feature and are not a dependency of chess integration.
- Do not build or distribute an APK as part of this preparation.

## Integration acceptance sequence

1. Owner authorizes host-app/API wiring and names the target environment.
2. Complete the host auth and manager-role mapping review.
3. Approve and apply database migrations using the controlled process.
4. Wire API routes and Flutter navigation behind configuration.
5. Run host API, Flutter, migration, security and regression suites.
6. Complete physical two-device testing, including reconnect and accessibility.
7. Review the deploy preview and staging telemetry.
8. Obtain separate owner approval before production deployment, APK distribution or PR merge.

Until the required authorization is provided, the correct status is **prepared / blocked by owner approval**, not complete.
