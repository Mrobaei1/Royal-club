# Royal Club — Phase 5 Production Operations Runbook

- **WBS scope:** 7.1–7.8 and 1.5
- **Last reviewed:** 2026-10-31
- **Repository:** `Mrobaei1/Royal-club`
- **Safety posture:** production deployment, schema mutation, network allowlist changes, snapshot-schedule changes, SMS activation, and APK creation are approval-gated. This runbook documents the verified state and safe procedures; it does not authorize those operations by itself.

## 1. Current verified production snapshot

Read-only checks against Neon project `crimson-moon-58282245`, production branch `br-misty-flower-bavs47dm`:

- Neon Function `royalclubapi`: active deployment **81**, status `completed`, runtime `nodejs24`, created `2026-10-31T10:24:43Z`.
- Deployment environment includes `OWNER_USER_ID`; `SMS_CREDENTIALS_ENCRYPTION_KEY` is absent, so live SMS must remain disabled.
- Deployment 81 predates PR #84. The current main source contains the owner-only agent-task audit endpoint, but that endpoint is **not proven to be deployed**.
- Source declares 33 public application tables and the live schema has 33 public tables with matching table names. This is **table-name parity only**; column, constraint, index, and ordered-migration parity are not yet signed off.
- Trigger `Royal Club expired empty-room cleanup` is enabled with cron `* * * * *` and calls `POST /internal/cleanup-expired-empty-rooms`. Read-only Neon logs showed repeated function invocation begin/end entries at one-minute intervals during the inspected window. The log backend did not expose route-level success attributes, so end-to-end cleanup correctness during idle periods still requires a controlled verification.
- Neon snapshot schedule query returned an empty schedule. Automated backup/restore is **not accepted**.
- Read-only database checks during this review found no long-running queries and no held locks. These are point-in-time observations, not ongoing monitoring.
- Production database IP allowlist is currently empty according to the latest recorded review. Do not change it until the actual hosting egress requirements and connectivity implications have been verified.
- Production API deployment and Android APK workflows must remain manual-only.

## 2. Release and deployment procedure

1. Confirm the exact candidate commit on `main`, inspect the diff, and verify the four required CI areas: API build/unit/integration tests, Flutter analyze/tests, backgammon engine audit, and web preview.
2. Confirm that the deployment candidate is the intended commit. Neon deployment metadata does not currently attest the bundled Git SHA; record the workflow run URL, candidate SHA, deployment ID, timestamp, and post-deployment health/smoke evidence together.
3. Confirm owner authorization for this specific production deployment. Do not deploy on merge or push.
4. Use GitHub Actions workflow `.github/workflows/deploy-neon-function.yml` via manual dispatch with the confirmed Neon project and branch IDs.
5. Verify the workflow reports API build/tests, function deployment ready, `/api/v1/health`, and `/api/v1/health/db` passing. Run the deployment workflow's approved smoke checks and retain run/artifact identifiers; do not include secrets in logs or evidence.
6. Re-read the Neon function metadata and record the active deployment ID, runtime, creation time, and environment-variable *names only*.
7. If health or smoke checks fail, stop further release actions. Preserve the previous deployment metadata and use the provider-supported rollback/redeploy procedure only after explicit approval. Never print credentials or copy secrets into issue/PR comments.

## 3. Database change and recovery procedure

**Current limitation:** schema initialization and incremental `ALTER TABLE` operations are embedded in `apps/api/src/server.ts`; an independently versioned, ordered migration ledger and tested rollback plan have not yet been accepted. Do not infer migration completeness from matching table names.

Before any schema change:

1. Capture the candidate SHA and enumerate every source `CREATE TABLE`, `ALTER TABLE`, index, constraint, and data backfill operation.
2. Compare live `information_schema.columns`, constraints, indexes, and table definitions with the source expectation. Record every difference and whether it is intentional.
3. Produce an ordered, idempotent migration with explicit preconditions and postconditions. Separate additive changes from data backfills and destructive changes.
4. Test the migration on an isolated Neon branch copied from the current production branch. Verify both forward migration and the documented recovery path against representative data.
5. Record the before/after schema comparison, row-count/data-integrity checks, migration logs, and rollback test result.
6. Obtain explicit approval before applying to Production. Do not run destructive SQL or use a branch reset/restore against Production without explicit approval.
7. After application, rerun schema comparison and API health/integration smoke checks. If postconditions fail, stop and follow the approved recovery plan.

## 4. Expired-room cleanup trigger verification

- Expected trigger name: `Royal Club expired empty-room cleanup`
- Expected schedule: every minute (`* * * * *`)
- Expected function: `royalclubapi`
- Expected path: `/internal/cleanup-expired-empty-rooms`
- The endpoint rejects calls without Neon trigger invocation metadata.

Acceptance test for an approved non-production or controlled test window:

1. Create an empty waiting room with an expiry in the past using the normal test fixture.
2. Confirm the trigger invocation appears in Neon logs after the next schedule tick.
3. Confirm the endpoint removes only expired empty waiting rooms and associated notices; ensure active/occupied rooms and unrelated users' notifications remain unchanged.
4. Verify repeated invocations are idempotent and concurrent invocations do not corrupt room state.
5. Confirm the test room and notice are gone using read-only SQL.
6. Record invocation timestamps and row counts. Do not expose request secrets or production user data.
7. For Production, use a harmless controlled fixture only after approval. A generic function `invoke end` log line alone is not sufficient acceptance evidence.

## 5. Backup, retention, and restore

**Not complete:** the inspected Neon snapshot schedule was empty, and no successful restore test was evidenced. Do not mark WBS 7.5 complete.

Target requirements:
- Confirm provider backup/snapshot retention and recovery-point availability for the production branch.
- Preserve the product requirement for the latest three usable recovery points.
- The requested 23:59 Asia/Tehran owner backup/email-link process is not provided by the current Neon snapshot-schedule query; provider snapshots must not be represented as that email workflow.
- Before enabling any schedule, compare supported provider frequency/time-zone capabilities, expected cost, retention, and restore impact; obtain owner approval.
- Keep any emailed download/share link time-limited and recipient-restricted. Never email raw database credentials or unrestricted permanent URLs.
- Restore a selected recovery point to a **new isolated branch**, never over Production during the test. Verify schema, table counts, representative row integrity, and API compatibility; record recovery time and any data-loss window.
- Test restoring one of the latest three recovery points and document the exact procedure to promote/recover from it. Promotion or replacing a production branch requires separate explicit approval.

## 6. Monitoring, logs, alerts, and incident response

Minimum acceptance:
- API health and database connectivity are checked after every approved deployment.
- Review function logs for errors and unexpected warnings, but treat the current log backend's limited severity/route attributes as a monitoring gap.
- Keep logs free of passwords, JWTs, database URIs, SMS keys, OTP codes, private messages, and full phone numbers.
- Monitor cleanup trigger invocation cadence and distinguish invocation start/end from successful endpoint behavior.
- Review Neon compute start/suspend operations, long-running queries, locks, table/index growth, and database connectivity during release checks.
- Define alert owner, threshold, notification destination, escalation window, and recovery steps before calling alerting complete. Do not add recurring jobs or email automation without explicit approval.
- Record incident start/end, impact, relevant redacted evidence, recovery action, and follow-up issue.

## 7. Production security review

- Verify exact allowed CORS origins against deployed clients; do not use wildcard origins for authenticated API traffic.
- Review Neon IP allowlist against documented hosting egress before changing it. An empty allowlist is a review item, not proof that the correct network policy is configured.
- Confirm `JWT_SECRET` meets the deployment validation rule and is never emitted in logs.
- Confirm `OWNER_USER_ID` is the confirmed numeric owner account ID; do not infer privilege from username or email.
- Keep SMS provider activation disabled unless the owner separately approves it and the 32-byte encryption key is configured through the secure secret path.
- Keep delegated grants, agent execution/schedules, paid behavior, and external financial actions disabled until separately approved.
- Review least-privilege access to GitHub/Neon secrets and rotate credentials only through a planned, tested change.
- After a security/configuration change, verify health and authorization negative cases without displaying secrets.

## 8. Final acceptance checklist — WBS

- [ ] **7.1 CI:** exact candidate commit passes API build/unit/integration, Flutter analyze/tests, engine audit, and web preview.
- [ ] **7.2 Deployment:** owner-approved candidate deployed; active deployment and source provenance recorded; post-deployment health and smoke tests passed.
- [ ] **7.3 Database:** table, column, constraint, index, and migration-sequence parity documented; forward and recovery paths tested on an isolated branch.
- [ ] **7.4 Cleanup:** trigger cadence confirmed and controlled expired-room deletion verified while runtime can be idle.
- [ ] **7.5 Operations/backup:** redacted logging, monitoring/alerts, runbooks, latest-three recovery points, and isolated restore test accepted.
- [ ] **7.6 Security:** CORS, network controls, secrets, owner ID, SMS gates, and least privilege reviewed and accepted.
- [ ] **7.7 E2E:** two-device, network interruption/recovery, Android layout/accessibility/performance, and regression acceptance recorded.
- [ ] **7.8 Release:** release notes and rollback plan ready; APK build/test only after the owner's separate explicit instruction.
- [ ] **1.5 Data lifecycle/DR:** retention, backup/restore, and disaster-recovery requirements reviewed and approved.

No item above should be checked solely because a PR merged or a workflow was green. Attach exact evidence and an owner acceptance record where required.
