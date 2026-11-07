# Royal Club — Infrastructure Agent and Central Network Control Change Proposal

- **Proposal date:** 2026-10-31
- **Status:** Proposed WBS v1.1 scope extension; not yet adopted as the governing baseline
- **Existing baseline:** Owner-approved WBS v1.0 remains immutable at 1,000 points / 53 leaf packages
- **Proposed extension:** 100 additional points, for a proposed v1.1 total of 1,100 points if the owner formally adopts it
- **Implementation branch:** `docs/infra-agent-network-change-proposal-20261031`
- **Production effect:** None. This proposal does not change DNS, hosting, API routing, secrets, database schema, deployment, or agent runtime.

## 1. Executive decision requested

Royal Club needs a dedicated **Infrastructure & Reliability Agent** and a single, secure network-configuration control plane. The owner must be able to manage API domain/hosting changes without programming knowledge, while all clients and product modules continue using one consistent API-origin resolver.

This proposal adds a scoped extension to the existing agent and infrastructure plans. It does not silently edit or supersede WBS v1.0. Until the owner explicitly adopts WBS v1.1, the official 1,000-point baseline and its percentages remain unchanged; the proposed 100-point extension is tracked separately.

## 2. Owner outcomes

1. One central source of truth for the public API origin across Android and web.
2. A domain/server change applies consistently to authentication, account, friends, chat, wallet, subscriptions, notifications, ranking, lobby, all online games, admin, Agent Center and API integrations.
3. Remote network configuration is signed, schema-versioned, time-bounded, monotonic and rollback-capable.
4. Only the authenticated primary owner can draft, activate or roll back production network configuration.
5. The owner receives plain-language incident notifications and a recommended action; safe diagnostics and reversible low-risk recovery may be automated.
6. A dedicated agent monitors, diagnoses, tests, records and reports infrastructure incidents, but cannot grant itself permission or bypass owner approval.
7. Claude, DeepSeek or other model providers may be consulted through server-side adapters when enabled, with strict data minimization, budget limits and independent validation.

## 3. Dedicated Infrastructure & Reliability Agent

### 3.1 Mission

Monitor and help maintain API availability, hosting, DNS, TLS certificates, routing, database connectivity, health checks, backups, deployment provenance, logs, security posture, operational cost and incident recovery.

The agent is an intelligent operator and advisor, not an unrestricted administrator. It must explain technical issues in simple Persian in the owner-facing UI and notifications.

### 3.2 Responsibilities

- Continuously evaluate configured health signals and detect outages, degraded latency, repeated 4xx/5xx patterns, certificate expiry, DNS/TLS failures, database connectivity issues, backup failures and unexpected cost/usage changes.
- Correlate incidents with recent approved deployments/configuration versions and produce evidence-based root-cause hypotheses.
- Run read-only diagnostics, safe health probes, log searches with secret redaction, configuration validation and non-production tests.
- Prepare recovery plans, domain migration drafts, deployment checklists, rollback plans and provider portability comparisons.
- Perform only explicitly allowlisted, reversible, low-risk actions within a bounded scope; verify the outcome and automatically stop if verification fails.
- Notify the owner when an incident is detected, when an action is proposed, when an approval is required, and when recovery succeeds or fails.
- Maintain an incident timeline, action audit, evidence links, impact estimate and clear next step.
- Keep the owner informed without creating unsolicited daily emails or recurring reports. Schedules and notification channels must be configured and approved separately.

### 3.3 Autonomy levels

| Level | Permitted behavior | Examples |
|---|---|---|
| A — autonomous read/diagnose | Allowed after the agent is separately activated | Health checks, read-only logs, DNS/TLS checks, test execution, alert classification, draft incident report |
| B — bounded reversible action | Only individually allowlisted and tested; must be logged and verified | Restart a non-production worker, clear a bounded disposable cache, retry a safe idempotent health probe |
| C — owner approval required | Never execute before exact-action approval | Production deployment, active domain/API-origin change, DNS mutation, certificate replacement, primary/standby switch, secret rotation, database restore, firewall/network policy change |
| D — forbidden | Never permitted to the agent | Delete production data, expose credentials, weaken TLS/authentication, bypass access controls, self-grant permissions, disable audit, perform irreversible financial or destructive actions |

Approval must be bound to the exact action, parameters, target environment, expected impact, rollback method, requester, approver and expiry. A changed action requires a new approval. Approval is single-use and must not be self-approved by the requester.

### 3.4 Multi-model consultation

- The central Royal Club agent remains the coordinator and final policy enforcer.
- Claude may be used for code review or alternative implementation analysis; DeepSeek may be used for an independent diagnosis or second opinion; other providers require owner-approved adapters.
- All provider calls originate server-side. Provider API keys are stored only in the server secret manager and are never sent to Android/web clients or other agents.
- Each provider has an explicit allowlist of task types, data categories, token/cost budgets, timeout and retention policy.
- Do not send passwords, OTPs, JWTs, API keys, database URLs, private messages, full user records or unnecessary personal data to model providers.
- Treat every model response as untrusted advice. The agent must cross-check technical claims against repository state, logs, tests and approved policy.
- If a provider is unavailable, over budget or returns conflicting advice, the agent falls back to local diagnostics and notifies the owner; it must not block critical incident reporting.

### 3.5 Required safety controls

- Default-deny server-side permissions and resource/environment scoping.
- Separate read, recommend, execute and approve capabilities.
- Unique revocable credentials per agent/provider adapter.
- Human approval for all production-impacting changes.
- Immutable audit trail with secret redaction.
- Task deadlines, concurrency limits, retry ceilings, idempotency keys and dead-letter handling.
- Global kill switch, per-agent pause/revoke, and queued-task cancellation.
- No agent identity, role, credential, schedule or permission is activated merely because this document exists.

## 4. Central network configuration architecture

### 4.1 Single transport requirement

All mobile and web API calls must route through one shared transport and origin resolver. No feature module may construct a production API URL independently or hardcode a provider hostname.

The shared layer covers:

- registration, login, session validation and recovery;
- profiles, account settings and identity;
- friends, private chat, images and notifications;
- wallet, credits, subscriptions and entitlements;
- progression, leaderboard and ranking;
- lobby, invites, match state and every online game;
- admin, Agent Center and internal API calls;
- web client and any future supported client.

The database connection string remains server-only and is never a client API origin.

### 4.2 Signed, versioned remote configuration

The app contains a pinned public verification key and a minimal bootstrap-origin list. A private signing key stays only in a protected server-side signing service/secret manager.

A published configuration includes:
- schema version and configuration version;
- issued-at and expiry timestamps;
- primary and optional standby HTTPS API origins;
- minimum compatible API version;
- rollout cohort/percentage when required;
- non-sensitive maintenance and diagnostic metadata;
- signature over a canonical representation of the full payload.

The client accepts a configuration only after validating signature, schema, expiry, hostname/HTTPS policy and monotonic version. Invalid, expired, unsigned, malformed or replayed/downgraded configurations are rejected. The last-known-good configuration is cached securely.

A rollback is published as a **new, higher configuration version** that points back to a previously known-good origin. The version counter never moves backwards; this prevents replay of an older signed configuration.

Bootstrap endpoints must be operationally independent of the API origin they are intended to replace. If bootstrap is unavailable, clients continue using the last-known-good configuration and report degraded status.

### 4.3 Validation before activation

A proposed domain/upstream remains a draft until all required checks pass:

1. Fresh domain ownership challenge (TXT) and expiry/replay checks.
2. DNS resolution and rejection of loopback, private, link-local, multicast or otherwise unsafe upstream targets.
3. HTTPS certificate chain, hostname match and expiry validation.
4. API health, API version compatibility and required route checks.
5. CORS, Authorization header forwarding, request/response semantics and websocket checks where required.
6. No caching of authenticated/private responses.
7. SSRF and DNS-rebinding protection.
8. Real-device and target-network validation, including VPN on/off where relevant.
9. Owner review of validation report, impact, rollout and rollback plan.
10. Explicit second owner confirmation before production activation.

A server-side health probe is not proof that an ISP or mobile carrier can reach the domain. The system must distinguish server health from user-network reachability.

### 4.4 Failover and safe retries

- Use primary while healthy; use standby only for classified connection, DNS, TLS, timeout or service-unavailable failures.
- Do not fail over on 401, 403, validation errors, business-rule errors or ordinary 4xx responses.
- Do not replay a state-changing request after an ambiguous timeout unless it has a server-enforced idempotency key or the client can prove the first request was not accepted.
- Never disable TLS verification or fall back to plain HTTP.
- Keep account identity/session trust independent of IP address, VPN state and carrier route. Approved origins must share compatible authentication/session trust.

### 4.5 Owner-facing administration

Add a phone-friendly **Admin → Infrastructure & Network** area with:
- active API domain, hosting label, config version and environment;
- primary/standby status and last successful probe;
- DNS, TLS, API health and reachability status;
- draft domain/server setup wizard;
- domain ownership instructions and validation results;
- explicit Activate and Roll back actions with impact preview and confirmation;
- incident history, audit events and owner notifications.

The UI must never display secret values. Credentials are configured through approved secret-management paths, not ordinary text fields.

## 5. Proposed WBS v1.1 extension (100 points)

This is a proposal only. WBS v1.0 remains the official 1,000-point baseline until the owner adopts this extension.

| Proposed ID | Work package | Points | Exit evidence |
|---|---|---:|---|
| 8.1 | Shared mobile/web API transport and origin resolver | 20 | Every feature service uses the shared client; automated scan/test finds no stray production origins |
| 8.2 | Signed bootstrap, cached last-known-good config and monotonic versioning | 20 | Signature, expiry, malformed config, replay/downgrade, offline bootstrap and rollback tests pass |
| 8.3 | Owner-only infrastructure control plane and admin UX | 15 | Draft/validate/activate/rollback flows; unauthorized access returns 403; audit records are complete |
| 8.4 | Domain/hosting validation and real-network migration rehearsal | 10 | DNS/TLS/CORS/API/websocket and real Android VPN-on/off checks recorded |
| 8.5 | Infrastructure & Reliability Agent read-only monitor/diagnose/report | 10 | Alerts, incident timeline, evidence-based diagnosis and plain-language owner notifications verified |
| 8.6 | Safe action executor, approval gates, audit and kill switch | 10 | Exact-action approval, idempotency, revocation, cancellation and failure-closed tests pass |
| 8.7 | Multi-model adapters and budget/privacy controls | 5 | Server-only credentials, provider allowlist, redaction, budgets, timeout and fallback tests pass |
| 8.8 | Operations observability, incident runbooks and owner recovery workflow | 10 | Backup/restore/rollback drills, alerts and recovery acceptance evidence recorded |
|  | **Total proposed extension** | **100** |  |

If formally adopted, the project denominator becomes 1,100 points. Historical v1.0 reporting remains reproducible and must not be silently recalculated. Until adoption, report v1.0 progress and the extension's progress separately.

## 6. Implementation sequence and dependencies

1. **Architecture and inventory:** enumerate every API caller in mobile/web, current hardcoded origins, auth/session behavior, hosting, DNS/TLS and operational dependencies.
2. **Shared transport:** introduce one client/resolver and migrate feature services in small slices with regression tests.
3. **Signed config:** implement canonical signing/verification, pinned public key, monotonic versions, cache and last-known-good behavior.
4. **Control plane:** add owner-only draft/validation/publish/rollback APIs and audit records; no production activation during initial implementation.
5. **Admin UX:** add status, wizard, validation, owner approval and rollback preview.
6. **Agent read-only mode:** health/log diagnostics, incident classification, notifications and evidence capture.
7. **Bounded actions and model adapters:** only after security review, staging acceptance and explicit owner approval.
8. **Migration rehearsal:** test on staging and real devices/network classes; retain old route and rollback.
9. **Production launch:** a separate explicit owner decision after all critical acceptance gates pass.

## 7. Acceptance checklist

### Network and client
- [ ] Auth, friends, chat, wallet, subscriptions, notifications, leaderboard, admin, Agent Center and all online games use the shared resolver.
- [ ] Android and web clients accept valid signed config and reject invalid signature, expiry, malformed schema, replay and downgrade.
- [ ] Cached last-known-good config works when bootstrap is unavailable.
- [ ] A rollback uses a new monotonic version and restores a previously verified origin.
- [ ] No non-idempotent request is duplicated during failover.
- [ ] Same account/session works across VPN-on/VPN-off and approved primary/standby origins.
- [ ] TLS remains strict; no HTTP fallback or trust-all certificate behavior exists.

### Owner control and security
- [ ] Non-owner and delegated assistants cannot activate or roll back production routing.
- [ ] Draft changes do not alter active routing.
- [ ] Activation requires successful validation plus a second explicit owner confirmation.
- [ ] Secrets never appear in clients, UI responses, logs or audit payloads.
- [ ] Every activation/rollback records actor, reason, version, validation evidence and outcome.
- [ ] Old known-good configuration remains available until the rollback window is closed.

### Infrastructure Agent
- [ ] Agent can monitor, diagnose and notify without production write permissions.
- [ ] Every active action is allowlisted, scoped, reversible, logged and verified.
- [ ] Production actions require exact-action owner approval.
- [ ] Kill switch and revocation stop new and queued execution.
- [ ] Model-provider calls are server-side, budgeted, redacted and treated as untrusted advice.
- [ ] No recurring email/report schedule is enabled without separate owner configuration.

## 8. Explicit non-authorizations

This proposal does not authorize:
- purchasing a domain or changing DNS;
- switching hosting, proxy, primary/standby route or production API origin;
- changing production secrets, firewall rules, CORS, database or migrations;
- deploying to production or decommissioning an existing service;
- creating agent identities, issuing credentials, granting permissions or enabling runtime/schedules;
- sending external emails/messages or enabling third-party model APIs;
- enabling paid features, real SMS or wallet automation;
- building or preparing an APK;
- merging this proposal or any other PR into `main`.

Each item above remains behind its own explicit owner approval and acceptance gate.

## 9. Change log

| Version | Date | Change | Authority |
|---|---|---|---|
| Proposal 1.0 | 2026-10-31 | Adds the Infrastructure & Reliability Agent, central signed network configuration and a proposed 100-point WBS extension. | Draft for owner review; WBS v1.0 unchanged |
