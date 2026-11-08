# Royal Club — phase dependency map and parallel execution plan

**Reviewed:** 2026-11-08  
**Baseline:** WBS v1.1; this map changes sequencing only, not scope or weight.

## Dependency map

    P0 — product scope, architecture and governance (WBS 1.0)
      | approved requirements, boundaries, decisions, WBS control
      +----------------------+----------------------+
      v                      v                      v
    P1 — accounts/security   P2 — wallet/economy     P3 — games/social
      |                      |                      |
      +----------------------+----------------------+
                             v
                   P4 — administration/permissions
                             |
                             v
                   P5 — production operations/recovery
                             |
                             v
                   P6 — device acceptance/release

This is a dependency map, not a strict serial schedule. Independent engineering packages may proceed in parallel once their shared contracts and security prerequisites are stable. Production and release gates remain separate from implementation completion.

## Critical dependencies

| Workstream | Must have first | Can proceed in parallel with | Hard gate |
|---|---|---|---|
| Account/security | Identity and privacy contract | Localization, isolated UI work | Owner-approved production/provider activation |
| Wallet/subscriptions | Server-authoritative identity and ledger model | Game rules, admin UI drafts | No paid activation without owner approval |
| Games | Shared auth, room/state contract, server authority | Independent game modules within WIP limit | Exact-head CI; device/multi-instance acceptance |
| Social | Identity/privacy and participant authorization | Game module implementation | Cross-account and real-device acceptance |
| Admin/permissions | Immutable owner identity and deny-by-default policy | Non-privileged dashboard presentation | Secure owner verification and approved permission matrix |
| Production operations | Reviewed schema/migration plan, provenance, backups | Read-only audits and isolated tests | Explicit production approval |
| Release | All mandatory WBS gates | Release notes/checklist drafting only | Explicit APK/release authorization |

## Parallel work policy

- Parallelize independent, non-conflicting code and documentation work; keep no more than two active implementation PRs, as required by the execution roadmap.
- Documentation/evidence-only work may run alongside implementation when it does not change product behavior or conflict with the same files.
- Do not parallelize changes to the same migration, schema contract, auth boundary, shared API DTO, or WBS scoring file without a single integration owner.
- A downstream task may be prepared while blocked, but cannot be marked complete until its dependency and acceptance evidence pass.
- Production deployment, migration, secrets, network policy, payment/SMS activation, agent execution, and APK creation are not ordinary parallel tasks; each retains its explicit owner gate.

## Current critical path — 2026-11-08

1. Keep WBS v1.1 and decision traceability authoritative.
2. Finish exact-head validation and safe integration of current-main game PRs; do not merge stale duplicate branches.
3. Close API source/schema drift with reviewed versioned migrations, isolated validation, restore/rollback evidence, and explicit owner approval before Production.
4. Resolve UNO service bootstrap dependencies and Railway source-link/deployment gates without enabling it prematurely.
5. Complete device acceptance for auth/VPN, game reconnect, localization, accessibility and performance.
6. Complete security/owner configuration review and operational recovery acceptance.
7. Release only after all mandatory WBS criteria pass and explicit owner release/APK approval is recorded.

## Parallelization exclusions

- Do not run production migration and production deploy as independent concurrent tasks.
- Do not enable SMS, payment, subscription charging, delegated grants, agent runtime, scheduled external actions, or money movement while testing unrelated code.
- Do not build an APK as part of CI or routine verification.
- Do not create a scheduled automation or background monitoring task from this roadmap.

## Change history

- 2026-11-08: first dependency/parallelism map derived from WBS v1.1, current execution roadmap and observed release blockers.
