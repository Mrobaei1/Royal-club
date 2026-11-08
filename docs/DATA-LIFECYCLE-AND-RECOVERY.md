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
