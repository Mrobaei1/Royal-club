# Read-only repeat restore verification — 2026-11-08

## Scope

This audit compares two isolated restores made from the same Neon manual snapshot with the current Production branch. It uses metadata inspection and read-only aggregate row counts only. No SQL writes, migrations, cleanup operations, role changes, deployments or branch deletions were performed.

## Snapshot and branches

- Source snapshot: `snap-spring-truth-ba9rbrg1` (created 2026-10-31).
- Production project: `Royal-Club-API` / `crimson-moon-58282245`.
- Current Production branch: `production` / `br-misty-flower-bavs47dm`.
- Restore A: `phase5-restore-test-20261031` / `br-crimson-rice-baahb4f3`; Neon reports `restore_status=restored`.
- Restore B: `restore-rehearsal-2026-11-04` / `br-plain-voice-balyjaip`; Neon reports `restore_status=finalized`.

Both restore branches identify the same source snapshot. A fresh Neon snapshot-list query returned only this one manual snapshot; no recurring/scheduled snapshot was listed.

## Structural parity

Read-only Neon metadata inspection found identical object sets across Production, Restore A and Restore B:

| Object type | Production | Restore A | Restore B |
| --- | ---: | ---: | ---: |
| Public tables | 33 | 33 | 33 |
| Indexes | 78 | 78 | 78 |
| Sequences | 27 | 27 | 27 |

No missing or extra table, index or sequence names were found between Production and either restore.

## Repeated restore data parity

An exact `COUNT(*)` query was run for every one of the 33 public tables on Restore A and Restore B. All **33/33 table row counts matched** between the two restores. No row values or personal data were selected.

Selected matching counts in both restore branches:

| Table | Rows in both restores |
| --- | ---: |
| `users` | 3 |
| `backgammon_matches` | 4 |
| `backgammon_match_invites` | 4 |
| `backgammon_player_stats` | 2 |
| `friendships` | 2 |
| `notifications` | 5 |
| `private_messages` | 10 |
| `wallet_accounts` | 2 |
| `wallet_transactions` | 0 |

## Expected point-in-time divergence from current Production

Production has continued to receive writes after the 2026-10-31 snapshot. Its current counts therefore differ from the point-in-time restore in several tables; this is expected and is not evidence of a failed restore.

| Table | Current Production | Restored snapshot |
| --- | ---: | ---: |
| `backgammon_matches` | 6 | 4 |
| `backgammon_match_invites` | 6 | 4 |
| `backgammon_player_stats` | 3 | 2 |
| `backgammon_progression_events` | 2 | 0 |
| `backgammon_match_presence` | 2 | 0 |
| `notifications` | 12 | 5 |
| `private_messages` | 13 | 10 |
| `wallet_accounts` | 3 | 2 |
| `users` | 3 | 3 |

## What this proves

- Two independent restore branches can be created from the same manual snapshot.
- Both restores have the same 33-table / 78-index / 27-sequence structure as current Production.
- All 33 table row counts match between the two restores, supporting repeatability of the point-in-time restore.

## What remains unverified

- No recurring backup schedule is active; Neon previously rejected scheduled snapshot creation for this project. No backup schedule or billing plan was changed in this audit.
- RPO and RTO have not been measured from a declared incident time through a complete recovery procedure. Branch metadata timestamps alone are not a valid RTO measurement.
- No application-level registration/login/game/wallet/chat smoke test was run against either restore.
- No full row-by-row checksum, attachment/media/object-storage restore, external encrypted backup, or 23:59 Asia/Tehran email-link delivery was verified.
- The restore branches remain isolated; no restore was promoted to or substituted for Production.

**WBS 1.5-B remains Pending.** This audit adds repeatable point-in-time restore evidence but does not satisfy the recurring backup, measured RPO/RTO and application-level recovery acceptance criteria.
