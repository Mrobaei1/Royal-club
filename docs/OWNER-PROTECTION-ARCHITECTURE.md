# Royal Club — Owner Protection & Governance Layer

- **Status:** implementation specification; branch-only; not a production security certification.
- **Owner authority:** the Royal Club owner is the sole principal for the protected ownership boundary. The general manager/owner is not merely an operational administrator.
- **Implementation branch:** `security/owner-protection-layer`
- **Baseline:** `main` at `3a7d68354f628b43c0080b4ea5bebc6d241ea325` (re-verify before each code change).

## 1. Security objectives

1. Preserve the same configured owner identity and prevent delegated identities from acquiring ownership.
2. Prevent a manager, deputy, assistant, agent, API client, or compromised ordinary session from deleting, disabling, demoting, replacing, or locking out the owner.
3. Enforce the approved hierarchy server-side; UI visibility is never an authorization boundary.
4. Require fresh owner authentication for high-impact owner actions and explicit owner approval for every financial outflow/refund.
5. Keep agent execution dormant unless separately enabled by the owner; never allow an agent to grant itself capabilities.
6. Make sensitive actions attributable and tamper-evident.
7. Fail closed on missing, conflicting, stale, or malformed owner configuration and authorization state.
8. Preserve safe recovery of the same owner's access without creating a successor owner.

## 2. Threat model

In scope: stolen assistant/manager credentials; malicious or compromised agents; privilege escalation; forged/stale JWT claims; replayed approvals; concurrent/repeated requests; compromised API clients; accidental owner deletion; database application-role misuse; incomplete or failed migrations; partial service outage; audit-log tampering attempts.

Out of scope for software-only guarantees: a malicious repository owner with control of GitHub/release signing and production secrets, a compromised hosting/cloud root account, a compromised owner device, or coercion of the owner. These require independent provider controls, hardware-backed credentials, recovery procedures, and operational governance.

## 3. Protected ownership invariant

- The authoritative owner anchor is a securely provisioned immutable numeric account ID, not a username, display name, email, phone number, IP address, or client-supplied JWT role.
- The API must deny owner-only operations if the configured owner ID is absent, invalid, or inconsistent with the durable owner record.
- The owner ID must never be editable through ordinary application APIs, manager UI, agent tools, or database rows writable by the application runtime.
- No endpoint or workflow may transfer ownership, replace the owner, delete the owner, disable the owner, demote the owner, revoke the owner's only viable access path, or allow a deputy to become owner.
- Any future ownership transfer, if ever explicitly desired by the owner, is a separate out-of-band governance project and is not implemented by this layer.
- Username `ElizArya` or any other name alone must never confer owner/super-admin status.

## 4. Layers and required controls

### L1 — Owner identity anchor
- Resolve the owner from a secret/configuration value provisioned outside the app and a durable singleton owner record.
- Compare numeric IDs server-side; never trust role claims in a request body or token as the sole source of owner authority.
- Detect configuration/database disagreement and fail closed for privileged operations.
- Bootstrap is a one-time, controlled operation with no public self-service route and no username-based inference.
- Never place owner secrets, recovery codes, or private keys in source control, logs, mobile bundles, or agent context.

### L2 — Strong authentication and step-up
- Require MFA for owner sign-in and step-up authentication for ownership/security/financial actions. Prefer passkeys/WebAuthn; retain a separately secured recovery factor.
- Use short-lived access tokens, rotation/revocation of refresh sessions, token-version/session invalidation, CSRF protection where cookie sessions are used, rate limits, and replay protection.
- Bind approvals to an exact canonical action digest, target, amount/currency where relevant, expiry, requester, approver, and one-time consumption.
- Do not rely on IP address or VPN state as identity proof.

### L3 — Immutable owner protections
- Reject all attempts by non-owner identities to modify owner account status, role, credentials, contact channels, MFA/recovery settings, or ownership mapping.
- Owner self-service security changes require step-up and notifications; high-risk changes should have a cooling-off/confirmation path.
- No manager or agent may remove the owner's last active session or recovery factor.
- Security lockouts may freeze risky operations and suspicious sessions, but must not silently transfer ownership or disable every owner recovery path.

### L4 — Hierarchical RBAC and least privilege
- Keep the approved hierarchy: owner/manager-general; deputy; department managers; specialist agents.
- Department managers act only within their own department and approved scope.
- Deputy supervises/co-ordinates departments within delegated authority; cannot change owner policy or owner-only controls.
- Separate `read`, `propose`, `approve`, and `execute` permissions. Deny by default and validate every protected API request server-side.
- A display name, username, email, or agent prompt is never a permission.
- No self-grant, self-escalation, cross-department scope expansion, or privilege inheritance by default.

### L5 — Owner approval and sensitive-action gate
- Refunds and every withdrawal/transfer/outbound movement of Royal Club funds require a fresh, explicit, action-specific owner approval. This is non-delegable and has no blanket standing approval.
- Bind the approval to immutable details (recipient, destination, amount, currency, network, fees, purpose, request ID and digest); any edit invalidates the approval.
- Require idempotency keys, transaction-safe ledger writes, replay protection, and a final authorization check immediately before execution.
- Agents may verify evidence or recommend; the financial core alone performs ledger changes after policy checks and valid owner approval.
- Database migrations, production deployments, owner identity changes, permission-policy changes, and destructive actions remain separately approval-gated.

### L6 — Agent lifecycle and emergency containment
- A department manager may select approved agents, assign scoped tasks, and evaluate/report performance.
- A department manager may request agent removal/disablement but cannot unilaterally fire, permanently disable, or delete an agent.
- Such requests follow the approved management chain and require final explicit owner approval before permanent offboarding.
- A temporary, reversible safety pause may be triggered by a narrowly defined automated risk control to contain active harm; it is not a firing/deletion, cannot alter permissions/ownership, is fully audited, alerts the owner, and requires owner review to continue beyond the emergency window.
- Agent runtime, schedules, external messages, and financial execution remain disabled by default until separately authorized.

### L7 — Tamper-evident audit and alerting
- Record actor, effective principal, action, target, timestamp, outcome, reason, request/correlation ID, approval ID/digest, and before/after state where safe.
- Never record passwords, OTPs, access tokens, API keys, private keys, seed phrases, or raw recovery codes.
- Use append-only permissions and database constraints/triggers; separate the runtime writer from audit administration.
- Hash-chain audit entries and periodically anchor checkpoints to an independently controlled append-only destination. Hash chains alone do not prevent a privileged database owner from rewriting history.
- Alert the owner through an independent channel for attempted owner changes, suspicious privileged activity, recovery events, financial outflow requests, and policy changes.
- Retention, export, and alert delivery must be defined; no external message schedule is enabled by this specification.

### L8 — Recovery and resilience
- Recovery restores access to the same owner identity; it never appoints a deputy or agent as owner.
- Store recovery material offline or in a dedicated secret manager with owner-controlled access; never send it to agents or ordinary administrators.
- Test backup/restore of owner identity metadata, permission policy, and audit checkpoints.
- On identity-provider, database, or policy-engine failure, deny privileged/destructive/financial actions while preserving safe read-only diagnostics and recovery.
- Document revocation of lost devices/sessions, credential rotation, incident response, and post-recovery review.

## 5. Architecture boundaries

- **Policy decision point:** central server-side module that evaluates actor, target, action, scope, risk, step-up proof, approval digest, expiry, and replay state.
- **Policy enforcement points:** every API route, task runner, scheduler, webhook, database mutation path, and financial executor.
- **Owner control plane:** owner-only workflows for identity recovery, security posture, delegated grants, and approval queue.
- **Audit plane:** append-only event writer and independent checkpoint/alert pipeline.
- **No trusted UI:** mobile/web UI only presents actions; the API re-evaluates every authorization.
- **No agent self-governance:** agent instructions are untrusted input; capabilities are derived from server-side grants.

## 6. Required negative and adversarial tests

- Missing/malformed owner configuration; owner-record/config mismatch; duplicate or absent owner anchor.
- Username/email spoofing, JWT role spoofing, stale token, revoked session, expired/replayed approval.
- Deputy/department manager/agent tries to alter owner role, status, MFA, recovery, sessions, or owner mapping.
- Cross-department command; manager attempts permanent agent offboarding without the full chain and owner approval.
- Any refund/withdrawal/transfer with no owner approval, wrong digest, changed recipient/amount, expired approval, duplicate request, or reused approval.
- Concurrent approvals and execution races; transaction rollback; audit write failure.
- Attempts to update/delete audit events, bypass triggers, or execute through a route/job/webhook that omits the policy enforcement point.
- Failures of database, auth provider, notification channel, or policy service; verify fail-closed behavior.
- Recovery restores the same owner and does not elevate the deputy.

## 7. Rollout sequence and gates

1. Inventory current owner identity, authorization paths, permission tables, all privileged routes, jobs, webhooks, and production differences.
2. Complete a threat model and owner-approved policy mapping; add additive schema/migration with rollback and parity checks.
3. Implement the policy decision/enforcement layer and negative tests before UI.
4. Add durable owner anchor, session/MFA step-up, approval binding, and audit integrity.
5. Integrate every sensitive API and background execution path; add concurrency and failure-injection tests.
6. Add owner-facing review/recovery/alerts only after backend enforcement is proven.
7. Run isolated staging migration and adversarial acceptance; review exact commit and CI.
8. Obtain separate owner approval for production migration/deployment and any activation. No live migration, secret changes, grants, agent activation, payment execution, or APK build is authorized by this branch task.

## 8. Current repository findings at baseline

- The API currently uses `OWNER_USER_ID` numeric-ID checks for owner-only routes; this is stronger than username matching but remains a single configured-ID gate.
- Delegated permission storage, scope checks, audit records, a kill switch, and agent policy helper primitives already exist; their current state must be integrated with the approved hierarchy rather than assumed complete.
- Existing agent policy code denies declared sensitive actions, but it is a guard primitive and not a complete execution runtime.
- The security review identifies incomplete RBAC matrix/production acceptance and production schema/configuration drift. These findings must be revalidated against the latest branch before coding.
- No agent identities or grants are to be created or activated as part of this work.
- No production migration or deployment is performed from this branch.

## 9. Definition of done

The layer is complete only when all protected routes and execution paths enforce the policy; owner invariants hold under adversarial tests; migrations are tested on an isolated database with rollback evidence; audit tampering attempts are denied/detected; owner recovery is verified; exact-head CI passes; and production rollout receives separate explicit approval. Documentation-only or helper-only code is not completion.
