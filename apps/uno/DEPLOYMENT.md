# UNO backend deployment and multi-device test

## Runtime
- Deploy this directory (`apps/uno`) as one persistent Node.js 22 container/service.
- Configure a stable HTTPS endpoint. Socket.IO must support WebSocket upgrades; do not deploy this process as a short-lived serverless function.
- Start exactly one replica. The current room manager is process-local and intentionally takes a PostgreSQL advisory lock to prevent a second instance from corrupting room snapshots.
- Configure a persistent PostgreSQL connection and the existing Royal Club HS256 JWT signing secret. Never commit either value.

## Required environment
| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | Set to `production`. |
| `HOST` | yes | Set to `0.0.0.0`. |
| `PORT` | platform | Use the port supplied by the host, or 4100. |
| `DATABASE_URL` | yes | TLS-enabled PostgreSQL connection. The service reads `users(id, username, token_version)` and creates/updates `uno_room_snapshots`. |
| `JWT_SECRET` | yes | Exact Royal Club HS256 signing secret; at least 32 characters. Store only in the host's secret manager. |
| `CORS_ORIGINS` | recommended | Comma-separated trusted web origins. Native Android clients do not rely on browser CORS. |

## Database and security gate
Before connecting a live Royal Club database, provision a least-privilege database role and review the SQL permissions required for:
- SELECT on `users(id, username, token_version)`
- CREATE/SELECT/INSERT/UPDATE on `uno_room_snapshots`

The server currently creates the snapshot table at startup. Do not point it at production until the owner approves the database, role grants, and first startup. Never use a broad owner/superuser credential for the runtime.

## Mobile client configuration
Build the mobile app with:
```sh
flutter build apk --dart-define=UNO_SERVER_URL=https://<approved-uno-host>
```
The UNO endpoint is separate from the Royal Club API base URL. Do not set a placeholder URL: the app will otherwise fail to connect.

## Two-device acceptance test
1. Deploy one backend replica and confirm `GET /health` returns `ok: true`.
2. Build/install the same configured app on two or more physical devices. Ensure each device can reach the HTTPS endpoint.
3. Sign in with distinct Royal Club accounts that have public usernames.
4. Device A creates a room; share its short room code with device B.
5. Device B joins. Verify both devices see the same roster and readiness state.
6. Mark both players ready; verify only the host can start.
7. Play turns and verify each player receives only their own private hand while opponents see card counts.
8. Verify text chat, disconnect/reconnect, room persistence after a controlled restart, and that a second backend replica refuses to start.
9. Record device models, OS versions, build SHA, backend version, and pass/fail evidence in the UNO acceptance checklist.

## Current limitations
- One backend replica only. Horizontal scaling is blocked until room state and Socket.IO coordination are distributed.
- Real multi-device play cannot be validated by a static web preview or by the home-screen tile alone; it requires the deployed endpoint and configured app build.
- No APK or production deployment is performed by this repository change.
