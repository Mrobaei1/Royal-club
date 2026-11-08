# Royal Club — data lifecycle, retention and recovery requirements

**Reviewed:** 2026-11-08  
**Status:** Engineering proposal mapped to WBS 1.5; retention durations and operational schedule require owner approval.

## Data classes

| Class | Examples | Required handling |
|---|---|---|
| Account identity | username, phone, credential/session metadata | private by default; least-privilege access; never expose in public projections |
| Social content | friend relations, private chat, image attachments, notifications | participant/recipient authorization; bounded storage; deletion behavior must be explicit |
| Game state | rooms, moves, match snapshots, results | server-authoritative writes; preserve only as required for active play, disputes and progression |
| Financial-like internal records | non-transferable credit ledger, subscription entitlements | immutable/auditable ledger semantics; never treat internal credits as cash |
| Security/audit | owner actions, permission grants, OTP audit, request security events | redact secrets; restrict access; retain only for approved operational/security purpose |
| Telemetry | health, latency, error and usage aggregates | minimize identifiers; bounded retention; document aggregation and deletion |

## Lifecycle controls

1. Collect only fields required for the feature and documented purpose.
2. Use server-side authorization for read, export, update and deletion.
3. Public projections expose usernames only; account phone/email/full name remain private.
4. Deletion must define cascading behavior, legal/financial audit exceptions, and whether anonymization is preferable to hard deletion.
5. Keep credentials, OTP codes, tokens, provider secrets and raw authentication material out of logs and analytics.
6. Keep internal credits and entitlement records auditable; never silently rewrite historical balances.
7. Set per-class retention durations only after the owner approves the policy and any applicable legal requirements are reviewed.

## Backup and recovery controls

- Identify the source database, branch, provider, region and recovery-point schedule.
- Define RPO/RTO per service and data class; values require explicit owner decision.
- Maintain at least the three most recent approved recovery points only after backup scheduling/retention is configured and verified.
- Test restoration into an isolated branch/environment; never overwrite Production during rehearsal.
- Verify schema/catalog, referential integrity, application startup, authentication, representative game/social reads and transactional ledger consistency after restore.
- Record snapshot ID, source branch, restore target, start/end time, verification output, RPO/RTO achieved and cleanup of temporary resources.
- Maintain forward-fix and rollback/recovery procedures for every production migration.

## Current evidence and known gaps

- A read-only Production inventory in the technical blocker audit found one manual snapshot dated 2026-10-31 and an empty recurring snapshot schedule.
- A restore rehearsal created an isolated branch from that snapshot and verified its catalog; the original Production branch and Function were preserved. This did not establish three-point retention, application-level recovery, measured RPO/RTO or a recurring backup schedule.
- Production schema/source drift and the missing users.token_version prerequisite for UNO are documented in current deployment/security records. No production migration or deployment is authorized by this document.
- UNO's dedicated runtime requires a separate least-privilege role and owner-run snapshot migration; it must not use broad API/owner credentials.
- Exact retention periods, legal deletion exceptions, backup schedule, RPO/RTO and disaster-recovery activation are unresolved owner decisions.

## Acceptance checklist

- [x] Data categories and minimum handling principles documented.
- [x] Production backup inventory and isolated restore evidence referenced.
- [ ] Owner approval of retention durations and deletion exceptions.
- [ ] Owner approval of backup cadence and three-point retention.
- [ ] Application-level restore rehearsal with integrity checks.
- [ ] RPO/RTO targets approved and measured.
- [ ] Production migration rollback and recovery drill approved and tested.

## Safety

This document does not authorize a Production snapshot schedule change, migration, deletion, restore, deployment, or access-policy change.


## Proposed retention and deletion schedule — not yet owner-approved

This is a conservative proposal for decision, not an active retention policy. No automated deletion or retention job may be enabled from this proposal alone.

| Data class | Proposed retention | Deletion / exception |
|---|---|---|
| Account profile and credentials | While account exists; credential/session artifacts expire or revoke on their own security lifecycle | On verified account deletion, remove or irreversibly anonymize personal profile fields subject to legally required records |
| Active game rooms and transient presence | Active room lifetime plus 30 days for dispute/recovery support | Purge expired room snapshots and transient presence after the window |
| Completed game history/results | 24 months | Retain minimal non-identifying aggregate statistics longer only if approved |
| Private chat and image attachments | 12 months after last activity | Delete both metadata and stored binary objects; preserve only a narrowly scoped record if a substantiated safety/legal hold applies |
| Notifications | 90 days after creation | Delete expired read/unread notifications; do not treat notifications as durable financial evidence |
| Wallet ledger and subscription transactions | 7 years as a proposed audit period | Restrict access; never rewrite history; confirm applicable legal/accounting obligations before adoption |
| Security and owner audit events | 12 months online, then up to 24 months archived | Redact tokens/secrets; restrict owner/security access; shorten if no longer necessary |
| Operational telemetry | 30 days raw, 13 months aggregated | Aggregate or anonymize identifiers before longer retention |
| OTP challenges and delivery metadata | 24 hours for challenge material; 90 days for redacted delivery audit | Never retain plaintext OTP; remove expired challenge rows |

### Deletion workflow proposal

1. Verify account ownership and any legally required identity/hold checks.
2. Disable login and revoke active sessions immediately.
3. Enumerate linked profile, social, media, game, notification and device records.
4. Delete or anonymize personal data according to the approved class schedule; retain only approved ledger/audit exceptions.
5. Remove object-store binaries and derived thumbnails; verify no public URL remains.
6. Record a minimal deletion audit event without copying the deleted personal content.
7. Verify completion and report exceptions to the owner.

### Owner decisions required

- Confirm or revise each retention duration and any legal/accounting exceptions.
- Confirm account deletion behavior for internal credits, subscriptions, match history, chat and reports.
- Confirm whether a user may export their account data before deletion.
- Confirm jurisdictional legal review and the responsible data controller/contact.
- Approve the actual scheduled purge mechanism and evidence/audit format.

Until these decisions are made, retention/deletion remains a documented design proposal and WBS 1.5-A remains Pending. No records are automatically purged by this document.
