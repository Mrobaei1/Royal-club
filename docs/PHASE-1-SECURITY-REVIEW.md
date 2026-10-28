# Phase 1 — API security review

Date: 2026-10-28
Branch: `feature/chat-ai-invite-ux`

## Scope and limits

This is a source/configuration review of the repository branch, not a penetration test or a verification of the live deployment. No production database, host environment, secret store, SMS provider, or device session was changed or queried during this review. Runtime claims below are limited to what repository code demonstrates.

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

1. **Production configuration is not verifiable from source.** Confirm actual `JWT_SECRET`, `CORS_ORIGINS`, `OWNER_USER_ID`, `DATABASE_URL`, encryption key, host access controls, and secret rotation in the deployment environment. Never put secret values in this document or Git.
2. **Owner authorization is a single numeric-ID gate, not a role system.** A dormant delegated-permission API/schema now supports allowlisted grants, resource scopes, revocation, a 50-delegate ceiling, and audit records, with integration coverage for scope and revocation. The owner UI supports grant listing/revocation and currently only exposes report-reading/report-management grants; full permission-matrix acceptance and broader negative tests remain open. No grants are seeded; do not grant permissions or activate identities based on planning docs.
3. **OTP is not implemented end-to-end.** A development-only hashed challenge lifecycle, Iranian phone normalization, per-phone cooldown/daily limits, per-IP route limits, Kavenegar adapter, owner-only connection check, cost-confirmed test-message endpoint, and matching owner UI controls exist. Phone OTP is not wired into account registration/login; the new flows still need comprehensive integration tests and manual UI review. Keep real SMS disabled and existing email/password authentication available.
4. **Localization is incomplete.** ARB parity does not establish that all visible labels/errors are localized, nor does it prove RTL/LTR behavior. Complete the source audit and device review.
5. **No live deployment verification was possible.** The code's health routes and CI cannot prove that the production API/database is healthy or that deployed CORS/secrets match repository guidance.

## Required closure evidence

- [ ] Inspect deployed secret/configuration *without exposing values*; verify production CORS and database access configuration.
- [ ] Add and pass negative tests for expired/malformed JWTs, unauthenticated and non-owner administrative calls, secret redaction, and missing owner configuration.
- [ ] Implement and test role/permission storage and server enforcement before creating or activating any additional privileged identity.
- [ ] Complete OTP integration tests and account-registration/login integration while real SMS remains off by default.
- [ ] Complete localization parity/string audit and test Persian RTL plus English LTR on actual Android devices.
- [ ] Record successful health checks against the actual production API and database, plus manual acceptance evidence.

## Decision

**Open — not cleared for Phase 1 sign-off.** Source-level controls and initial RBAC/OTP foundations are present, but production configuration, full RBAC acceptance, OTP authentication integration, localization, and live/manual evidence remain open. This review must not be represented as a completed penetration test.
