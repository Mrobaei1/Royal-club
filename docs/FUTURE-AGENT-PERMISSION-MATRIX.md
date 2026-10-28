# Royal Club — Future Agent Permission Matrix and Implementation Plan

**Status:** preparation specification only. No roles, agents, provider credentials, scheduled tasks, or production permissions are created or enabled by this document.

## Authority and safety boundary

The system manager remains the decision-maker for the number of agents, their identities, responsibilities, permission limits, launch timing, and which actions require human approval. Implementation must not infer authority from a username, email, display name, or a row inserted by a migration. In particular, `ElizArya` must not receive elevated access merely because of the username.

All permissions are enforced by the API. A hidden menu or mobile-side check is not authorization. Default is deny. A newly created identity has no permissions until an authenticated owner action explicitly grants them. Revocation must take effect on the next protected request and must be auditable.

## Permission vocabulary

- **Read:** view only the minimum data needed for the assigned task.
- **Recommend:** create a proposed action for review; cannot execute it.
- **Execute:** perform a narrowly scoped, reversible action after server authorization.
- **Approve:** finalize a specific business decision only where an explicit policy and permission permit it.
- **Owner-only:** remains unavailable to agents unless the manager later approves a separately reviewed policy.
- **Human review:** ambiguous, conflicting, high-impact, or out-of-policy cases are queued; no automatic fallback to approval.

## Proposed default matrix

Every entry below is a proposed future ceiling, not a granted permission.

| Domain | Read | Recommend / prepare | Execute / approve by default | Required guardrails |
|---|---|---|---|---|
| Registration and membership | Minimal account status and abuse signals | Flag duplicate/suspicious requests | No account deletion, role change, or identity merge | Generic responses; privacy minimization; audit |
| Marketing and sales | Aggregated acquisition/conversion metrics | Draft copy, plans, and campaign reports | No spend, publish, or contact users until separately authorized | Budget caps; consent and channel policy; approval record |
| Wallet deposit verification | Deposit claims and trusted provider evidence required for matching | Explain match/mismatch and request missing evidence | **No authority until explicitly granted.** If granted, approve only verified, final, exact matches; wallet credit must be idempotent | Provider-confirmed status; unique transaction/reference; amount/currency/recipient match; duplicate lock; limits; immutable ledger; audit |
| Wallet correction/debit/refund | Only case-specific records | Recommend correction with evidence | Owner-only by default | Separate permission from deposit approval; dual review if manager policy requires |
| VIP/subscription | Relevant status and manager-published rules | Recommend eligibility | No entitlement changes until separately authorized | Server-side balance/rule check; transaction; replay protection; audit |
| Leagues and competitions | Published rules, schedules, standings | Prepare schedule/results for review | No result override, prize, or entry-charge change by default | Rule versioning; dispute queue; immutable decision history |
| Moderation | Reports and minimum evidence | Triage and recommend | No permanent suspension or deletion by default | Evidence access controls; appeal path; action reason and audit |
| Site operations | Health metrics and redacted errors | Diagnose and recommend remediation | No secret changes, deployment, or destructive operation | Read-only first; rate limits; incident log; kill switch |
| Lobby/social | Aggregate activity and user reports | Flag spam/abuse | No private-message reading outside approved moderation workflow | Need-to-know access; audit and retention policy |
| Advertising | Delivery/performance metrics | Prepare approved campaign drafts | No spend or publish by default | Explicit budget and publish permissions; approval gates |
| Analytics/reporting | Aggregated or pseudonymized metrics | Generate reports | No external email or scheduled delivery until separately approved | Recipient/timezone/retention approval; redact personal data |

## Deposit verification state machine

1. **Received:** create a deposit claim with a server-generated identifier; do not credit the wallet.
2. **Evidence lookup:** query a configured trusted payment source using its server-side credential. A user-uploaded receipt or screenshot is supporting context only, never proof of settlement.
3. **Match:** require exact transaction identity/reference, recipient/merchant account, amount, currency, and a final successful/settled provider status. Check that the transaction has not been used for another claim.
4. **Policy gate:** verify that the agent is active, its deposit-approval permission is currently granted, the manager-configured limits/rules are satisfied, and no hold/reversal/dispute exists.
5. **Atomic approval:** in one database transaction, claim the unique provider transaction, record the decision and evidence reference, append the wallet ledger entry, and update the balance. Enforce a unique idempotency key so retries cannot credit twice.
6. **Hold/review:** pending, failed, reversed, disputed, inconsistent, over-limit, missing-evidence, or uncertain cases remain uncredited and go to a human review queue.
7. **Reconciliation:** later provider reversals create an alert and a reviewed compensating ledger event; never silently rewrite or delete the original ledger entry.

Provider credentials must be server-only and separately revocable. Persist only the minimum provider reference/status/evidence needed for audit; never store card data or unnecessary secrets. Use bounded retries, request timeouts, rate limits, and safe handling of provider outages.

## Required implementation components (in order)

1. **Schema and migration:** role/agent identities, permission grants, grantor, scope, active/revoked status, timestamps, reason, and audit events. Use migrations with rollback guidance; no seed data may grant privileged access.
2. **Authorization service:** typed permission constants, deny-by-default checks, resource scoping, and server-side enforcement on every protected route. Avoid broad wildcard permissions.
3. **Audit trail:** actor, action, target, timestamp, result, reason, and approval reference; redact passwords, OTPs, tokens, API keys, and payment secrets.
4. **Owner controls:** review identities and grants, grant/revoke narrowly scoped permissions, see status/audit, pause an agent, and use a kill switch. Require re-authentication or equivalent strong confirmation for high-impact changes where supported.
5. **Review queue:** evidence, reason codes, decision history, reviewer identity, and safe retry behavior.
6. **Deposit provider adapter:** provider-neutral interface for lookup/verification; implement a concrete adapter only after the manager selects the provider and its official API is verified. Keep unconfigured/off by default.
7. **Idempotent wallet integration:** use the existing server-side ledger and database transactions; add a unique external transaction identifier and concurrency tests before allowing any automatic credit.
8. **Agent runtime:** only after the manager approves a specific use case; isolated credentials, bounded task queue, retries/dead-letter handling, rate/volume limits, timeout, metrics, and immediate disable switch.
9. **Admin UI and localization:** Persian and English only; RTL/LTR review; no secrets returned to clients.
10. **Verification:** unit/integration tests, negative authorization tests, concurrency/replay tests, migration rollback review, staging acceptance, and production-readiness checklist.

## Minimum security tests before any activation

- Unauthenticated and ordinary-user requests cannot list, create, grant, revoke, or impersonate agents.
- A username/email alone cannot create or elevate an owner or agent.
- An agent with read-only permission cannot execute or approve.
- A revoked permission is denied immediately on subsequent requests.
- Cross-user/resource scope violations are denied.
- Duplicate provider transaction IDs and concurrent retries produce exactly one ledger credit.
- Pending, failed, reversed, mismatched, disputed, or screenshot-only claims never credit a wallet.
- Provider outage, timeout, malformed response, and rate limiting fail closed.
- Audit records are written for approvals, denials, grant changes, revocations, and manual overrides, without secrets.
- Kill switch blocks queued and new tasks; re-enable requires an authorized manager action.
- Existing wallet balances and ledger history remain consistent after failures and rollback.

## Explicitly out of scope until separate manager approval

- Creating or activating actual agent identities.
- Assigning production permissions or enabling automatic deposit approval/wallet credit.
- Selecting/configuring a payment provider or storing payment credentials.
- Scheduled agents, daily email reports, external user contact, advertising spend, production deployment, pull-request merge, or APK generation.

## Current repository evidence and next gate

The current API already has server-side wallet accounts/transactions and owner-only wallet-credit protection, but a complete reusable role/permission management system is not yet established. Reuse the existing transaction ledger rather than adding a second balance system. First implement and test the authorization/audit foundation with no privileged seed grants; then add one domain at a time under a separately reviewed manager decision. This document alone does not make the project ready for Phase 4.
