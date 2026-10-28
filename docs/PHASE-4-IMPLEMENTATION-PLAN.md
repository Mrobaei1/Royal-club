# Royal Club — Phase 4 preparation plan

## Gate
Phase 4 remains blocked until the Phase 1–3 checklist is accepted. This document prepares the implementation sequence; it does not authorize deployment, paid features, new privileged identities, production SMS, agent automation, or APK creation.

## Phase 4 workstreams

1. **Operational control plane**
   - Confirm the real owner identity and securely provision OWNER_USER_ID outside source control.
   - Review owner-only access, permission grant/revocation audit, deny-by-default checks, and emergency kill switch.
   - Add no privileged seed grants and do not grant permissions based only on username.

2. **Agent framework (dormant until owner approval)**
   - Separate task definitions, capability declarations, approval requirements, run state, audit events, and cancellation.
   - Use explicit scopes and bounded execution; default-deny all external actions.
   - Require human approval for financial actions, role changes, outbound messages, production configuration, and destructive operations.
   - Keep scheduling, email reports, and agents disabled until separately approved.

3. **Wallet/deposit verification (separate gated milestone)**
   - Verify a provider's official API and settlement semantics before choosing an adapter.
   - Match a unique provider transaction ID, enforce idempotency under concurrent retries, and keep uncertain claims in a human review queue.
   - Never credit from screenshots, user assertions, pending transfers, or ambiguous evidence.
   - Preserve the existing server-owned wallet ledger; no direct client balance mutation.

4. **Game/league expansion**
   - Complete Phase 2 league-entry implementation first (issue #26): free-by-default rules, subscription-day entitlements, per-league manager configuration, atomic consumption, retry safety, and audit history.
   - Keep chess/card-game navigation and future game support isolated from backgammon engine changes.
   - Do not introduce a new game or paid rule until current backgammon and social acceptance gates pass.

5. **Release and observability**
   - Define production health checks, deployment rollback, database migration rollback, redacted audit review, and operational runbooks.
   - Separate automated CI evidence from manual Android/device/network acceptance.
   - Keep deployment and APK creation manual-only with explicit owner authorization.

## Exit criteria

- Phase 1–3 readiness checklist has no unresolved required items or each exception is explicitly accepted by the owner.
- API authorization, ledger idempotency, game-state integrity, and localization tests pass on the exact proposed commit.
- Production configuration and database health are verified against the real deployment.
- Owner has reviewed the permissions matrix and explicitly approved any activation.
- No production charge, SMS, agent identity/grant, schedule, deployment, merge, or APK build is activated merely by this plan.