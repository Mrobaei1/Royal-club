# Royal Club — Future agent and assistant team charter

## Status and authority

This document records the owner's intended future scope. It does **not** authorize creating agents or assistant accounts, assigning roles, granting credentials, enabling automations, or changing live permissions.

The Royal Club system manager is the decision-maker for:
- when agent/assistant capabilities are designed, implemented, tested, and launched;
- whether to create any agent or assistant, how many to create, and which tasks to assign;
- the exact permission set and limits of each identity;
- whether a sensitive action may be automated, requires human approval, or remains manager-only;
- when access is changed or revoked.

Until that decision is made, no new identity or permission is to be activated merely because it appears in this planning document.

## Potential responsibility domains

The eventual team may cover the following domains. These are responsibility areas, not pre-approved grants of access.

1. **Registration and membership:** review signup and membership requests, flag suspicious patterns, and help resolve account-status issues.
2. **Marketing and sales:** prepare campaigns, analyze acquisition/conversion, and report sales performance.
3. **Wallet and VIP membership:** reconcile wallet activity, flag discrepancies, and review VIP/subscription requests against manager-approved rules.
4. **Leagues and competitions:** coordinate registrations, schedules, published rules, standings, and result-review workflows.
5. **Moderation and violations:** triage reports, gather relevant evidence, identify repeat abuse, and recommend or perform only explicitly authorized moderation actions.
6. **Internal site operations:** monitor service health and feature-level errors, route incidents, and report operational status.
7. **Lobby and social network:** monitor lobby activity and community reports and help maintain the user experience.
8. **Advertising:** prepare and schedule approved campaigns, monitor delivery, and report performance.
9. **Analytics and reporting:** produce auditable metrics, trends, operational summaries, and management reports.

## Required access-control design

Before implementation or activation, design and review a permission matrix mapping each identity to specific resources and actions. Apply least privilege, deny by default, and separate read, propose, approve, and execute capabilities.

- **No authority by name alone:** a username, display name, or email address must never automatically confer an administrator or agent role.
- **Manager-controlled provisioning:** role assignment and permission changes require an authenticated manager action and must be auditable.
- **Sensitive actions:** wallet credits/debits or corrections, VIP approval where it changes entitlements, account suspension, competition result changes, advertising spend, and security/configuration changes must follow an explicit manager-approved policy. Keep approval gates where the policy requires them.
- **Server-side enforcement:** hiding controls in the UI is not authorization. Every protected API operation must verify the authenticated identity and permission on the server.
- **Auditability:** record actor identity, action, target, timestamp, outcome, and approval reference for sensitive operations. Do not log passwords, OTPs, API keys, or other secrets.
- **Bounded automation:** each agent should have a defined scope, rate/volume limits, failure handling, and a manager-accessible disable/kill switch before scheduled or event-driven execution is enabled.
- **Credential isolation:** use separate, revocable credentials per service/agent; never expose server secrets to mobile/web clients or other agents without a specific need.
- **Human review:** provide a review queue for uncertain, high-impact, or policy-sensitive cases. An agent recommendation must not silently become an irreversible action.
- **Privacy:** expose only the user data needed for the assigned task. Public-facing profile and social features must continue to show usernames rather than another user's full name or email.
- **Reporting:** define report recipients, retention, timezone, and delivery method before scheduling reports. No recurring report or external message is enabled by this document.

## Implementation sequence when the manager authorizes it

1. Confirm the requirements and manager-approved permission matrix.
2. Audit existing owner authorization and data model; define migration and rollback plans before changing roles.
3. Implement server-side role/permission checks and audit logging first, with negative tests for unauthorized users.
4. Add manager-facing provisioning, permission review, status, and disable controls.
5. Implement one responsibility domain at a time, starting with read-only/reporting tasks where practical.
6. Test isolation, approval gates, rate limits, failure recovery, revocation, and audit records.
7. Run staging acceptance tests and obtain the manager's explicit launch approval before enabling production agents or schedules.

## Current non-goals

- Do not create or activate agent/assistant accounts as part of documenting this charter.
- Do not assign the intended super-admin role solely from the username `ElizArya`.
- Do not enable wallet, VIP, moderation, advertising-spend, or competition-changing automation by default.
- Do not enable scheduled jobs, daily emails, or production automation without separate manager approval.
- Do not treat this charter as authorization to merge pull requests, deploy services, or build an APK.
