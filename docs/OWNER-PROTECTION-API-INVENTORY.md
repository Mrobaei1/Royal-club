# Owner-protection API inventory — post-integration review

- **Reviewed source:** `apps/api/src/server.ts` on mainline `44eb8183b68af10a6578d5f6306586dff95b07a8`.
- **Method:** static route declaration scan plus focused source inspection. This is an initial inventory, not a complete penetration test.
- **Implementation:** PR #179 (durable anchor) and PR #183 (password step-up), both merged.

## Current enforcement observed

- `requireOwnerAuth` first calls `requireMatchAuth`, compares the JWT subject to numeric `OWNER_USER_ID`, and verifies the singleton durable owner identity record.
- The durable record is provisioned once from the configured owner on the first successful owner-authenticated request; a PostgreSQL trigger rejects ordinary UPDATE/DELETE attempts.
- Every owner-only POST/PATCH/PUT/DELETE route uses `requireOwnerStepUp`; read-only routes use `requireOwnerAuth`.
- Step-up verifies the current owner password with the existing scrypt hash and timing-safe comparison, issues a five-minute signed token, and binds it to the active access-token session subject, version and JTI.
- The admin panel exposes re-authentication; the mobile client stores the token securely, sends it on admin requests, and clears it on logout.
- Route access is enforced server-side; hiding admin UI is not treated as a security control.
- Existing delegated permission execution remains dormant.

## Owner-guarded routes found in the static scan

| Method | Route |
|---|---|
| GET | `/api/v1/admin/game-disconnect-policies` |
| PATCH | `/api/v1/admin/game-disconnect-policies/:gameType` |
| GET | `/api/v1/admin/leagues` |
| POST | `/api/v1/admin/leagues` |
| PATCH | `/api/v1/admin/leagues/:id` |
| POST | `/api/v1/admin/leagues/:id/schedule` |
| GET | `/api/v1/admin/leagues/:id/report` |
| PATCH | `/api/v1/admin/league-matches/:id` |
| PATCH | `/api/v1/admin/league-appeals/:id` |
| GET | `/api/v1/admin/agent-templates` |
| GET | `/api/v1/admin/agent-tasks` |
| POST | `/api/v1/admin/agent-tasks` |
| GET | `/api/v1/admin/agent-task-proposals` |
| GET | `/api/v1/admin/agent-task-audit` |
| POST | `/api/v1/admin/agent-task-proposals/:id/approve` |
| POST | `/api/v1/admin/agent-task-proposals/:id/cancel` |
| POST | `/api/v1/admin/agent-task-proposals/:id/reject` |
| GET | `/api/v1/admin/voice-messages/settings` |
| PATCH | `/api/v1/admin/voice-messages/settings` |
| GET | `/api/v1/admin/voice-messages/audit` |
| GET | `/api/v1/admin/permissions/settings` |
| PATCH | `/api/v1/admin/agent-tasks/:id/status` |
| PATCH | `/api/v1/admin/permissions/settings` |
| GET | `/api/v1/admin/permissions/grants` |
| POST | `/api/v1/admin/permissions/grants` |
| DELETE | `/api/v1/admin/permissions/grants/:id` |
| GET | `/api/v1/admin/permissions/audit` |
| GET | `/api/v1/admin/users/:userId/profile` |
| POST | `/api/v1/admin/wallet/credit` |
| GET | `/api/v1/admin/security/sms-otp` |
| PATCH | `/api/v1/admin/security/sms-otp` |
| POST | `/api/v1/admin/security/sms-otp/test-connection` |
| POST | `/api/v1/admin/security/sms-otp/test-message` |
| GET | `/api/v1/admin/security/sms-otp/audit` |
| POST | `/api/v1/admin/notifications` |
| GET | `/api/v1/admin/account-customization-pricing` |
| PATCH | `/api/v1/admin/account-customization-pricing` |
| GET | `/api/v1/admin/subscription-plans` |
| PATCH | `/api/v1/admin/subscription-plans/:code` |

## Financial boundary observed

- The scanned owner-only financial write route is wallet credit, which is an inbound credit operation.
- User subscription activation is an authenticated user operation that debits that user's own wallet according to the existing subscription flow.
- No dedicated refund, owner-wallet withdrawal, or outbound asset-transfer route was found in this route scan. This does not mean the financial domain is complete; future outflow/refund routes must be blocked by the owner-approval gate before being introduced.
- Existing wallet ledger/idempotency controls require a separate detailed audit before any financial acceptance claim.

## Work still required

- Verify all route declarations, Fastify hooks, scheduled jobs, Neon functions, webhook handlers, and direct database write paths; a text scan can miss indirect registrations.
- Replace the single environment-only owner check with a durable, fail-closed owner anchor after a reviewed migration/bootstrap plan.
- Add durable one-time action-bound owner approvals before introducing any refund or outbound-funds route; step-up authentication alone is not an approval ledger.
- Ensure owner deletion/disable/demotion/session lockout cannot occur through any account-management path or FK cascade.
- Review database role ownership and migration privileges; an application role with table ownership/DDL rights can bypass a trigger, so a trigger alone is not a complete tamper-proof boundary.
- Reconcile current source schema with production before any separately approved deployment.
