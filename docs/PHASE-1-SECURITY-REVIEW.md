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
2. **Owner authorization is a single numeric-ID gate, not a role system.** A dormant delegated-permission API/schema now supports allowlisted grants, resource scopes, revocation, a 50-delegate ceiling, and audit records, with integration coverage for scope and revocation. The owner UI supports grant listing/revocation and currently only exposes report-reading/report-management grants. Integration coverage now includes scope enforcement, revocation, kill switch, non-owner denial, and the 50-delegate ceiling; the complete approved manager/assistant/agent permission matrix and broader operational scopes remain open. No grants are seeded; do not grant permissions or activate identities based on planning docs.
3. **OTP is not implemented end-to-end.** A development-only hashed challenge lifecycle, Iranian phone normalization, per-phone cooldown/daily limits, per-IP route limits, Kavenegar adapter, owner-only connection check, cost-confirmed test-message endpoint, and matching owner UI controls exist. Phone OTP is not wired into account registration/login; the simulator lifecycle, expiry, cooldown, attempt exhaustion, daily limits, production lock, provider failure handling, and owner-action guardrails now have API integration/unit coverage. Owner UI/manual review and real account-registration/login integration remain open. Keep real SMS disabled and existing email/password authentication available.
4. **Localization is incomplete.** ARB parity does not establish that all visible labels/errors are localized, nor does it prove RTL/LTR behavior. Complete the source audit and device review.
5. **Production deployment/schema is behind this branch.** A read-only Neon query on 2026-10-28 confirmed the `Royal-Club-API` production database is reachable (PostgreSQL 18.6), but `sms_otp_settings`, `sms_otp_challenges`, `admin_permission_grants`, and `admin_permission_audit_log` do not exist there. The deployed API health endpoint could not be verified through the available HTTP check. The production project currently has no Neon IP allowlist configured. Do not apply migrations or deploy the branch without explicit release approval; production CORS/secrets and runtime health still need verification.

## Required closure evidence

- [ ] Inspect deployed secret/configuration *without exposing values*; verify production CORS and database access configuration, and review whether a Neon IP allowlist is feasible for the hosting architecture.
- [x] Add integration coverage for expired/malformed JWTs, unauthenticated and non-owner administrative calls, and missing owner configuration.
- [ ] Verify secret redaction across all logs/error paths and review remaining negative authorization cases on the latest CI commit.
- [x] Implement dormant permission storage, owner-only grant/revocation/audit endpoints, fail-closed scoped enforcement, and kill switch; test scope, revocation, kill switch, and the 50-delegate ceiling.
- [ ] Complete the approved role/permission matrix and owner-facing management workflows before creating or activating any additional privileged identity.
- [x] Add OTP simulator/provider unit and API integration tests while real SMS remains off by default (latest API CI run must remain green).
- [ ] Integrate OTP with account registration/login and account-phone linking only after a reviewed migration plan and explicit owner approval.
- [ ] Complete localization parity/string audit and test Persian RTL plus English LTR on actual Android devices.
- [ ] Deploy only after explicit release approval, then verify actual API/database health and expected schema on the deployed branch; also capture manual acceptance evidence.

## Decision

**Open — not cleared for Phase 1 sign-off.** Source-level controls and initial RBAC/OTP foundations are present, but production configuration, full RBAC acceptance, OTP authentication integration, localization, and live/manual evidence remain open. This review must not be represented as a completed penetration test.
