# Phase 1 — API security review

Date: 2026-11-04
Reviewed source: current `main` (`f39a718ead43b88b08c4ffbc683e11acab12be1b`)

## Scope and limits

This is a source/configuration review, not a penetration test. Production was inspected read-only; no production state, secret, deployment, migration, or provider setting was changed. Current Neon metadata and GitHub Actions health evidence are recorded below. Secret values and the actual CORS allowlist value were not read. Runtime claims are limited to the exact deployment metadata and workflow checks noted here.

## Controls confirmed in source

- `JWT_SECRET` is required at startup and must be at least 32 characters; access tokens are signed with a one-hour expiry.
- Authentication is based on submitted account credentials and JWT claims, not IP address or VPN exit IP.
- Registration and login have separate account-keyed rate limits after request-body parsing.
- Production CORS requires an explicit allowlist, rejects wildcard origins, and requires HTTPS origins. The development allowlist is explicit.
- Helmet and Fastify's global rate limiter are registered.
- Owner-only writes are checked server-side against the numeric `OWNER_USER_ID`; missing/invalid configuration denies owner-only actions. The ID is not sourced from a username or email.
- SMS configuration endpoints are owner-only; the API returns only whether an encrypted key exists, not the key. SMS settings remain disabled, and real-provider activation is rejected.
- Wallet credits are server-side and recorded in a transaction ledger; the existing readiness checklist records integration coverage for denying ordinary users wallet-credit access.

## Open findings — Phase 1 is not security-cleared

1. **Production configuration is only partially verified.** Current read-only Neon metadata for active Function deployment 81 lists `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NEON_FUNCTION_RUNTIME`, `NODE_ENV`, and `OWNER_USER_ID`. This supersedes the older observation that `OWNER_USER_ID` was absent. The metadata does not reveal values, so the numeric owner ID's value and exact CORS allowlist remain unverified. `SMS_CREDENTIALS_ENCRYPTION_KEY` is not listed; SMS remains disabled and must not be activated until separately approved and securely configured. No secret values were read or changed.
2. **Owner authorization is a single numeric-ID gate, not a role system.** A dormant delegated-permission API/schema now supports allowlisted grants, resource scopes, revocation, a 50-delegate ceiling, and audit records, with integration coverage for scope and revocation. The owner UI supports grant listing/revocation and currently only exposes report-reading/report-management grants. Integration coverage now includes scope enforcement, revocation, kill switch, non-owner denial, and the 50-delegate ceiling; the complete approved manager/assistant/agent permission matrix and broader operational scopes remain open. No grants are seeded; do not grant permissions or activate identities based on planning docs.
3. **OTP is implemented behind a production activation gate.** A development-only hashed challenge lifecycle, Iranian phone normalization, per-phone cooldown/daily limits, per-IP route limits, Kavenegar adapter, owner-only connection check, cost-confirmed test-message endpoint, and matching owner UI controls exist. Purpose-bound OTP request/verify/register/login/link endpoints and gated mobile OTP/phone-linking UI are now wired and have API integration coverage for simulator registration, login, phone linking, purpose separation, verified-phone uniqueness, profile-edit protection, expiry, cooldown, attempt exhaustion, daily limits, production lock, provider failure handling, and owner-action guardrails. The settings API still blocks activation, so production SMS/authentication remain disabled; owner-approved provider activation and manual account-flow review remain open. Keep email/password authentication available.
4. **Localization is incomplete.** ARB parity does not establish that all visible labels/errors are localized, nor does it prove RTL/LTR behavior. Complete the source audit and device review.
5. **Production deployment provenance and network policy remain open.** The active Function deployment is still ID 81 (created 2026-10-31), so it predates the 2026-11-04 logging hardening merged to `main`; Neon metadata does not expose its bundled Git SHA. A post-merge GitHub Actions run on `main` (41733596963) successfully called `/api/v1/health` and `/api/v1/health/db`, confirming the currently deployed API and database respond, but it does not prove that the latest `main` source is deployed or reconcile the full current schema. Neon project metadata reports an empty allowed-IP list. `CORS_ORIGINS` is configured by name and the production health check succeeds, consistent with startup validation, but the exact allowed origins were not exposed or independently tested from each client origin. Do not change network rules, apply migrations, or deploy without the required release approval.

## Required closure evidence

- [x] Read-only metadata review of active Function environment-variable names, Neon allowed-IP policy, and production health/database endpoints; no secret values were read. Evidence: deployment 81 metadata and Actions run 41733596963.
- [ ] Verify the actual numeric owner-ID value and exact production CORS allowlist through an authorized secure configuration review; determine whether an IP allowlist is compatible with Neon Function networking.
- [x] Add integration coverage for expired/malformed JWTs, unauthenticated and non-owner administrative calls, and missing owner configuration.
- [x] Harden API request log redaction and request metadata on `main` commit `f39a718ead43b88b08c4ffbc683e11acab12be1b` (PR #151): redact request bodies and credential headers, omit query strings/client IPs from request serialization, use server-generated correlation IDs, validate log levels, and add regression tests. Exact-head API build/unit/integration, Flutter, backgammon engine, and Web Preview workflows passed before merge; post-merge `main` workflows passed. External Neon/host log retention and access controls remain unverified.
- [x] Implement dormant permission storage, owner-only grant/revocation/audit endpoints, fail-closed scoped enforcement, and kill switch; test scope, revocation, kill switch, and the 50-delegate ceiling.
- [ ] Complete the approved role/permission matrix and owner-facing management workflows before creating or activating any additional privileged identity.
- [x] Add OTP simulator/provider unit and API integration tests while real SMS remains off by default (latest API CI run must remain green).
- [x] Implement purpose-bound OTP registration/login/account-phone linking with verified-phone uniqueness while leaving the feature disabled by default.
- [ ] Complete the owner-approved production activation/migration plan and manually validate the real provider flow before enabling it.
- [ ] Complete localization parity/string audit and test Persian RTL plus English LTR on actual Android devices.
- [ ] After explicit release approval only, deploy the latest reviewed source and verify deployment provenance, schema/migrations, API/database health, and registration/login smoke tests. No deployment or migration was performed in this review.

## Decision

**Open — not cleared for Phase 1 sign-off.** Code-level OTP request/verify/register/login/link flows and automated tests are present but real SMS remains disabled. Production configuration/activation, full RBAC acceptance, localization device review, and live/manual evidence remain open. This review must not be represented as a completed penetration test.

## Follow-up evidence — 2026-10-31

- The later Phase 1 readiness record reports that the numeric `OWNER_USER_ID` was validated and is present in active Neon Function deployment 81. This supersedes the 2026-10-28 observation that it was absent from the then-active deployment, but does not by itself close the complete production configuration/security review.
- The API logger now uses a centralized redaction policy for the entire request body, authorization/cookie/API-key headers, and response cookies. This is source-level protection on branch `phase1/backgammon-integrity-20261031`; exact-head API tests must pass before treating the change as verified. It is not a substitute for reviewing external host logs or secret-store access.
- The integration suite now also checks that the same authenticated account session remains valid when the apparent client network header changes. This is automated evidence for IP-independent identity, not a substitute for the requested real-device VPN-on/VPN-off acceptance.
- Production deployment, schema mutation, SMS activation, real SMS delivery, and privileged grant creation remain untouched and approval-gated.

**Current decision remains Open.** The source-level controls and CI can be completed independently, but production security acceptance and manual device checks must remain explicit sign-off gates.


## Evidence refresh — 2026-11-04

- PR #151 merged as `f39a718ead43b88b08c4ffbc683e11acab12be1b`. The API logger hardening is now part of `main`; exact-head CI passed, and the post-merge main runs passed: [Validate Royal Club](https://github.com/Mrobaei1/Royal-club/actions/runs/41733596925), [Royal Club validation](https://github.com/Mrobaei1/Royal-club/actions/runs/41733597127), [Royal Club Web Preview](https://github.com/Mrobaei1/Royal-club/actions/runs/41733597102), and [Production API Health](https://github.com/Mrobaei1/Royal-club/actions/runs/41733596963).
- The Production API Health job explicitly checked both `/api/v1/health` and `/api/v1/health/db`; both returned the expected healthy status. This proves runtime availability and database connectivity for the configured endpoint, not source provenance.
- Active Neon Function deployment 81 exposes the environment-variable names `CORS_ORIGINS`, `DATABASE_URL`, `JWT_SECRET`, `NEON_FUNCTION_RUNTIME`, `NODE_ENV`, and `OWNER_USER_ID`. Values remain undisclosed. `SMS_CREDENTIALS_ENCRYPTION_KEY` is not present in the environment-name list; SMS remains disabled.
- Neon project metadata reports `allowed_ips.ips=[]`. This is an observed configuration, not an automatic vulnerability finding: the hosting/network architecture must be reviewed before deciding whether an allowlist is feasible.
- The active deployment 81 predates the logging hardening merge. Latest-source deployment and provenance remain owner-approval-gated; no production deploy, migration, secret change, or network-policy change was made.

**Decision remains Open — not security-cleared.** Source-level security tests and log redaction are now evidenced on `main`; deployed-source provenance, exact CORS/owner configuration values, network policy, schema reconciliation, external log controls, and final production acceptance remain open.
