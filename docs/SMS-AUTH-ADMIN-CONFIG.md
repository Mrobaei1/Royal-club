# SMS OTP authentication — owner-controlled rollout

## Decision and rollout defaults

- Target country for the first rollout: Iran only.
- Authentication method planned for production: phone number + one-time SMS code (OTP).
- Default state in every environment: SMS delivery disabled.
- Development and QA must remain usable without a paid SMS account or real SMS delivery.
- No provider credentials, sender line, or SMS spending are required to build, run, or test the app.
- Enabling production delivery is an explicit owner/admin action and requires a successful configuration check.

## Admin settings to provide

Add an owner-only section under **Admin → Security & Authentication → SMS / Phone OTP**. The section should expose:

1. **Phone OTP login**: enabled/disabled toggle, default disabled.
2. **Delivery mode**: disabled / development simulator / real provider. Real provider must be impossible to select unless all required server-side settings are valid.
3. **Provider**: provider-neutral interface, with KaveNegar as a candidate first adapter and the ability to add/replace providers without changing authentication business logic.
4. **Credentials**: API key and any provider-specific sender/template identifier. Secrets must be written only to server-side secret storage/environment, never returned to the client or included in normal API responses, logs, exports, or mobile app configuration.
5. **Test connection / test message**: separate actions with explicit confirmation that a real SMS may incur cost. Do not automatically send a test SMS when saving settings.
6. **OTP policy**: expiry (initial default 2 minutes), resend cooldown, per-phone and per-IP request limits, maximum verification attempts, daily send ceiling, and supported phone-number country (Iran only initially).
7. **Status and audit**: configured/unconfigured, last connection-check result/time, last provider error with secrets/OTP/phone redacted, who changed settings, and when. Never store or log raw OTPs.
8. **Emergency switch**: immediately disable real SMS sending without deleting provider configuration.

All settings and actions must be authorized on the server. Hiding the menu item is not authorization. Only the current securely assigned owner/admin role may read/update settings or invoke provider tests.

## Safe behavior while disabled

- Disabled mode must not call an external SMS provider and must not incur SMS charges.
- QA should use a clearly isolated development simulator or explicitly configured test numbers/codes. Test OTPs must be unavailable in production and must never be a universal fixed code.
- The simulator should preserve the real OTP lifecycle and validation rules: issue, expiry, attempt counting, resend cooldown, throttling, and successful one-time consumption. The test code should be visible only through a development-only test mechanism, not normal production API responses.
- If phone OTP is disabled, keep the currently supported authentication flow available for development until the owner explicitly approves the migration/cutover. Do not force existing accounts into phone-only authentication during preparation.
- Do not issue a session/access token until OTP verification succeeds when phone OTP is enabled.

## Backend design requirements

- Define an SMS provider interface (send verification message, health/configuration check, normalized provider result); provider adapters must be replaceable.
- Keep the OTP/authentication service separate from provider-specific HTTP/API details.
- Normalize and validate Iranian mobile numbers server-side and enforce uniqueness before linking a phone number to an account.
- Store OTP verification challenges securely (hash the OTP rather than storing it in plaintext), with expiry, attempt counters, resend throttling, and one-time consumption. Use database-safe updates/transactions to prevent concurrent verification or duplicate account creation.
- Apply per-phone and per-IP limits; return generic responses that do not disclose whether a phone number already has an account.
- Redact phone numbers, provider response bodies, API keys, and OTPs from logs. Apply request timeouts and bounded retries; never blindly retry a send operation that may have already been accepted by the provider.
- Add tests for disabled-mode no-send behavior, simulator flow, wrong/expired/reused OTP, resend cooldown, attempt limits, rate limits, duplicate phone numbers, concurrent requests, provider failures/timeouts, admin authorization, secret redaction, and preserving the existing auth path while the feature is disabled.
- Do not migrate existing users or remove email/password fields until a separately reviewed migration plan and owner approval exist.

## Delivery sequence

1. Add this specification and keep Phase 4 blocked until the current phase readiness gates are satisfied.
2. Inspect current account schema, registration/login handlers, owner authorization, admin UI, deployment configuration, and test harness before editing implementation.
3. Implement provider-neutral backend configuration and a disabled-by-default feature flag; add schema migration and tests.
4. Add owner-only admin controls and English/Persian localization; verify secrets are never sent to the mobile client.
5. Add the development simulator and tests, without configuring a paid provider or sending real messages.
6. Add the first provider adapter only after its official API requirements are verified. Keep it disabled and unconfigured by default.
7. Run API build/unit/integration tests and mobile analysis/tests. Verify the exact commit's CI status.
8. Production activation, provider credentials, real test SMS, and account-authentication cutover remain explicit owner decisions.

## Acceptance criteria

- A clean checkout builds/tests without SMS credentials.
- SMS is off by default and no provider request occurs while off.
- Development authentication can be tested without sending an SMS.
- The owner can configure a provider and policy in the admin panel, but enabling real sending requires a deliberate action.
- Only authorized administrators can change settings; secret values cannot be read back by client APIs.
- English and Persian settings UI is complete, including Persian RTL.
- All OTP security tests pass; no APK is built and no PR is merged as part of this work without the owner's separate authorization.
