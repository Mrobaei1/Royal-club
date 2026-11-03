# Royal Club — data lifecycle, retention and backup policy

**Policy state:** owner-approved requirements recorded 2026-11-03; operational implementation and acceptance remain open.

## 1. Account and personal data

- Account data is retained while the account remains active.
- After an account-deletion request, personal data must be deleted or anonymized as required by applicable law.
- Financial and security audit records are retained only for the period required by law and legitimate audit obligations.
- The implementation must separate personal profile data from financial/security audit records so a deletion request can remove or anonymize personal data without corrupting legally required audit history.
- The service must record deletion requests and completion evidence without retaining unnecessary personal data in the audit event.

## 2. League archive lifecycle

- Each completed league's ZIP archive is retained on Royal Club servers.
- Only the General Manager (GM) may access/download league archives.
- The GM configures each archive's retention duration through the admin panel.
- The archive is automatically deleted when its configured retention period expires, whether or not the GM downloaded it.
- Access, download, retention changes and automatic deletion must be auditable.
- Expired archive deletion must not delete unrelated league results or financial/security audit records.

## 3. Backup and recovery requirements

- **Daily backup is required.**
- Keep the **latest three usable recovery points**.
- A restore test is required before sensitive changes.
- Backups must be encrypted and access-controlled; credentials and unrestricted permanent download links must never be placed in source control or ordinary logs.
- Restore tests must use an isolated branch/environment, not overwrite Production.
- Every backup/restore operation must record the backup identifier, source commit/deployment context where available, timestamps, result and integrity checks.

## 4. Decisions still required

The following operational parameters have **not** been specified by the owner and must not be guessed:

- Daily backup execution time and timezone.
- RPO and RTO targets.
- Recovery priority/order for services and data domains.
- Full disaster-recovery topology, failover procedure and exercise cadence.
- Whether the daily backup delivery workflow includes time-limited email download links, and its approved recipients/destination.

The current Neon Free plan did not permit the attempted scheduled-snapshot configuration. A provider-plan change or a separately approved backup service is therefore required before the daily requirement can be operationally satisfied. Do not change billing, add paid services, create schedules, provision secrets or send backup links without the owner's separate approval.

## 5. Acceptance evidence

The policy is not operationally complete until evidence demonstrates:

1. Daily backups run successfully on the approved schedule.
2. At least the latest three recovery points are available and integrity-checked.
3. A restore from a selected recovery point succeeds in an isolated environment.
4. Restore is tested before each sensitive production change according to the approved runbook.
5. Account deletion removes/anonymizes personal data while preserving only legally required financial/security audit records.
6. GM-only archive access, configurable retention, audit history and automatic expiry deletion work end-to-end.

This document records requirements; it does not authorize Production changes or claim that backup, deletion or archive automation is already implemented.
