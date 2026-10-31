# Royal Club — Infrastructure, Domain & Network Management Architecture

**Status:** Architecture baseline — implementation pending  
**Owner control:** Primary owner only; delegated assistants cannot change infrastructure  
**Scope:** Android clients, web client, API origin, reverse proxies, DNS/TLS, health checks and safe server/domain migration.

## 1. Product requirement

Royal Club must not bind user identity, account eligibility, authorization or session validity to the user's IP address, country, VPN state, carrier or network route. The same account and valid session must continue to work when the user changes between VPN and non-VPN networks, subject only to normal security checks.

The owner must eventually be able to manage the public API domain and the active API hosting target from one phone-friendly **Admin → Infrastructure & Network** screen. A configuration change must propagate to all supported clients without requiring an APK rebuild for every ordinary host migration.

This is a control-plane capability, not a promise that a domain can defeat an ISP, country-level block, DNS interference or provider outage. The selected domain, DNS provider, TLS endpoint and hosting route must actually be reachable from the target networks. No architecture can guarantee reachability on every network.

## 2. Terminology and separation of concerns

Do not combine these values into one "server URL":

1. **Public API origin** — HTTPS address used by mobile/web clients, e.g. `https://api.example.com`.
2. **Origin/upstream target** — internal API host or deployment to which the public reverse proxy forwards traffic.
3. **Database endpoint** — private PostgreSQL/Neon connection used only by the API runtime. Never expose this to clients or the admin UI as a public API URL.
4. **Bootstrap/configuration origins** — independent, small set of HTTPS endpoints from which clients can obtain a signed, versioned network configuration if their cached API origin is unavailable.
5. **Web frontend origin** — separate from API origin; changing one must not silently overwrite the other.

The app's public API origin must never be a direct database address or a provider's private connection string.

## 3. Admin experience

Add an owner-only section: **مدیریت ← زیرساخت و شبکه** (Admin → Infrastructure & Network).

### A. Current status panel
Display:
- active public API domain and configuration version;
- active hosting/provider label and upstream health (never credentials);
- DNS resolution, HTTPS certificate validity/expiry and API health status;
- last successful health-check time and recent failure category;
- mobile/web client configuration propagation status;
- primary and standby route status.

Statuses must distinguish *unknown*, *not checked*, *healthy*, *degraded*, *unreachable* and *misconfigured*. Never show "VPN problem solved" merely because a health endpoint responds from the server's own network.

### B. Domain and server setup wizard
Owner can create a **draft** configuration with:
- public API domain (hostname only; HTTPS is mandatory);
- hosting/provider label;
- upstream/origin target (hostname/port/path; credentials are not accepted in ordinary text fields);
- optional standby public API origin and standby upstream;
- deployment/environment label (production/staging);
- optional operator note.

The wizard produces the required DNS record(s) and a unique TXT ownership challenge. It must explain that the owner needs to create those records at the DNS provider. The system then checks ownership, DNS, TLS, API health, CORS and protocol compatibility. No automatic DNS mutation is assumed; future DNS-provider integration requires explicit provider authorization and a separate audited operation.

### C. Validate → activate workflow
1. Save as draft; active production route remains unchanged.
2. Verify domain ownership using a fresh, expiring TXT challenge.
3. Verify DNS A/AAAA/CNAME resolution and reject private, loopback, link-local, multicast and otherwise unsafe upstream addresses.
4. Verify HTTPS certificate chain, hostname match and expiry.
5. Verify the public health endpoint and API version/compatibility.
6. Verify proxy behavior for Authorization, request methods, bodies, status codes and response headers; ensure private/authenticated responses are not cached.
7. Run CORS and websocket checks where applicable.
8. Display all results and the target test locations/networks. A server-side probe is not proof that users' ISPs can reach the domain.
9. Require a second explicit owner confirmation to activate.
10. Publish a signed, monotonically versioned client network configuration; retain the previous known-good configuration for rollback.

No save/draft operation may change production routing. No activation may proceed while critical checks fail.

### D. Emergency controls
- **Rollback to previous configuration** (owner confirmation, reason, audit record).
- **Disable standby** without deleting its configuration.
- **Maintenance/read-only mode** is separate from routing and requires its own confirmation.
- Never auto-fail over an in-flight non-idempotent request. Retry writes only when the request has a server-enforced idempotency key or the client can prove the first attempt was not accepted.

## 4. Client-side network architecture

### A. One API transport layer
Replace scattered `AuthService.baseUrl` and per-service URL construction with one shared API transport/client. Auth, account, friends, chat, wallet, notifications, leaderboard, admin, lobby and game services must use the same resolver, timeout policy, headers, error model and telemetry policy.

No feature service may hardcode a provider hostname. A repository check/lint test must reject new hardcoded API origins outside approved bootstrap/configuration files and deployment definitions.

### B. Signed remote network configuration
The app ships with:
- a minimal bootstrap origin list (independent of the active API origin where operationally possible);
- a public verification key pinned in the app;
- a safe built-in last-known-good default.

The app downloads a signed configuration containing:
- schema/config version and issued/expiry times;
- primary and standby public API origins;
- minimum compatible API version;
- rollout percentage or client cohort if needed;
- optional maintenance notice and non-sensitive diagnostics metadata.

The app verifies the signature, schema, expiry and monotonic version before accepting it. Invalid, expired, unsigned or downgraded config is rejected. The last-known-good config is cached securely. Bootstrap endpoints must not depend solely on the API origin they are meant to replace.

The owner changes the domain/upstream in Admin; the server validates it; then the control plane publishes the signed config. Clients refresh at startup and on a bounded schedule, and keep a valid cached config during outages. This avoids a new APK for routine endpoint changes. A truly new bootstrap trust root or new bootstrap infrastructure may still require a planned app release.

### C. Failover policy
- Health-check primary and standby using a lightweight, unauthenticated health endpoint.
- Prefer primary when healthy; use standby only when the failure is classified as connection/DNS/TLS/timeout or server-unavailable.
- Do not fail over on 401/403, validation errors, business-rule errors or ordinary 4xx responses.
- Do not send a request body to a second origin after an ambiguous timeout unless the operation is idempotent or carries a server-enforced idempotency key.
- Bind an authenticated session to the account/token, not to an IP address or a particular hostname. The API must accept the same valid token across approved origins that share the same auth trust and session store.
- Keep TLS verification enabled. Never add a "trust all certificates" or HTTP fallback.
- Avoid storing sensitive request/response bodies in network diagnostics.

### D. Session behavior
- No stored token → show login.
- Successful authenticated session check → signed in.
- Confirmed 401/expired or revoked token → clear token and request login.
- Timeout, DNS failure, TLS/connectivity error, 5xx or unavailable API → retain token and show retry/offline/degraded state; never silently log the user out.
- 403 is authorization denial, not automatically an expired session.
- Explicit user logout clears the local token.
- If the API is unavailable, online actions may be disabled with clear feedback; offline-capable screens may remain accessible. Do not pretend server-side operations succeeded offline.

## 5. Proxy and hosting requirements

A public reverse proxy must:
- forward HTTP methods, paths, query strings, request bodies, Authorization and required application headers;
- preserve response status and relevant headers;
- enforce request size and timeout limits;
- never cache authenticated/private API responses;
- protect against SSRF and upstream host injection;
- use strict TLS between proxy and upstream;
- apply rate limits and abuse controls without blocking legitimate shared-NAT/mobile networks;
- support websocket/upgrade traffic if the game/chat architecture requires it;
- expose a minimal health/version endpoint without leaking secrets;
- keep database credentials only in server-side secret storage.

A CDN/proxy is not automatically a solution to VPN reachability. Its hostname and IP ranges must be tested from the networks Royal Club actually serves. Avoid depending on a single provider or a provider domain that has already failed the user's no-VPN test.

## 6. Server and domain migration procedure

1. Prepare the new API deployment and database connectivity without switching clients.
2. Confirm schema compatibility and required secrets on the new host.
3. Attach the public domain and configure DNS/TLS.
4. Test from multiple external vantage points and, critically, real Android devices on target no-VPN networks.
5. Run health, auth, read/write, websocket, CORS, load and security smoke tests.
6. Publish the new signed network config to a small canary cohort.
7. Monitor error rate, latency, login success, route selection and rollback threshold.
8. Increase rollout gradually.
9. Keep the old origin operational during the rollback window.
10. Only decommission the old host after explicit owner approval and verified stability.

DNS TTL reduction, DNS changes, secret rotation, production deployment and decommissioning are controlled operational actions; they are not implicit side effects of editing a draft in the admin UI.

## 7. Security and governance

- Infrastructure configuration endpoints are primary-owner-only using the existing owner authorization mechanism; no assistant/delegated permission may modify production routing.
- Require recent re-authentication or a second confirmation for activation, rollback and destructive operations.
- Store secrets in the host's secret manager; never return secret values to the mobile client or read them back into the admin form.
- Validate hostnames and upstreams server-side; defend against SSRF, DNS rebinding and private-network targets.
- Audit actor, timestamp, old/new non-secret values, validation report, reason, config version and outcome.
- Redact tokens, database URLs, API keys and certificate private keys from logs.
- Configuration updates are atomic and versioned; retain a bounded history and known-good rollback.
- IP/country/VPN information may be used only as optional diagnostics or risk signals under policy; never as a hard requirement for login or authorization.

## 8. Required acceptance tests

### Admin and control plane
- Non-owner and delegated assistant receive 403 for read/write infrastructure endpoints.
- Owner can save a draft without changing active routing.
- Invalid hostname, HTTP URL, private upstream, expired challenge, bad TLS, unhealthy API and incompatible API version cannot be activated.
- Ownership challenge expires and cannot be replayed.
- Activation requires explicit confirmation and produces an audit event plus a new signed config version.
- Rollback restores the prior version atomically.
- Secrets never appear in API responses, UI, logs or audit payloads.

### Client and session
- Every service uses the shared transport; no stray hardcoded production origin remains.
- Invalid signature, expired config, replayed/downgraded config and malformed config are rejected.
- Cached last-known-good config works when bootstrap is unavailable.
- Primary outage selects a healthy standby for safe reads and idempotent operations.
- No failover occurs for 401/403 or validation/business errors.
- Ambiguous write timeout does not duplicate wallet, payment, match, invite or other state-changing operations.
- Same account/session works across VPN on/off and across approved primary/standby origins.
- Network timeout, DNS failure, TLS failure and 5xx preserve the stored session; confirmed 401 clears it; 403 does not.
- Auth, wallet, chat, friends, notifications, leaderboard, admin and online game flows use the same origin resolver.

### Network reachability
- Health checks from server-side probes are supplemented by real-device tests on representative mobile and fixed networks, with VPN off and on.
- DNS resolution, TLS handshake, health endpoint, login and authenticated API calls are tested separately.
- Results include timestamp, network class and failure stage; do not collect precise location unless separately justified and consented.

## 9. Implementation sequence

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0 | Baseline audit and architecture (this document) | All API callers, auth paths, host configs and deployment workflows inventoried |
| 1 | Shared mobile/web API transport | All feature services route through one client; regression tests pass |
| 2 | Signed bootstrap and cached network config | Signature/version/expiry/rollback tests pass |
| 3 | Owner-only infrastructure API and audit history | Authorization and validation tests pass |
| 4 | Admin Infrastructure & Network UI | Draft, validate, activate, status and rollback flows work |
| 5 | Proxy/hosting adapters and health probes | Primary/standby route tests pass without production switch |
| 6 | Real-network migration rehearsal | VPN on/off and no-VPN tests pass on target networks |
| 7 | Owner-approved production activation | Canary stable, rollback proven, owner authorizes switch |

## 10. Current constraints and explicit non-goals

- No custom domain is currently assigned to Royal Club.
- The existing Neon API and Netlify host both failed the user's no-VPN reachability test; this is evidence about that tested network, not a universal global result.
- The current app uses a compile-time `API_BASE_URL` and several services build requests directly from it. The shared transport migration is therefore a prerequisite.
- The session gate was found to treat every `/me` error as logout. A branch-only correction now distinguishes confirmed HTTP 401 from transient failures; it still requires CI and device verification.
- This architecture does not promise to bypass every country's filtering or every ISP block. A working result requires a suitable provider/domain and validation from the user's actual target networks.
- No domain purchase, DNS change, production deployment, secret change, database migration or APK build is authorized by this architecture document.
