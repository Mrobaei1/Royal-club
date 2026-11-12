# Royal Club — project governance and execution control

**Reviewed:** 2026-11-08  
**Governing baseline:** WBS v1.1 (docs/PROJECT-WBS-BASELINE.md)  
**Project owner:** GM / owner (final authority)

## Authority and approval boundaries

1. The GM/owner is the final decision-maker for product scope, WBS changes, production changes, migrations, secrets, network policy, money movement, monetization, SMS activation, delegated permissions, agent runtime, and APK builds.
2. Delegated managers may act only inside an explicitly approved, server-enforced scope. Delegation never grants authority to override the GM.
3. A proposal, draft PR, code merge, CI success, preview deployment, or automated agent recommendation is not an owner approval.
4. Any approval must be traceable to an explicit owner decision and its bounded scope. Silence, prior unrelated approval, or a general request to continue engineering is not authorization for production/financial actions.

## Work intake and delivery lifecycle

1. Map every task to a WBS leaf and acceptance criterion before implementation.
2. Inspect live main, open PRs, exact head SHAs, dependencies and CI before changing code.
3. Prefer parallel work only for independent, non-conflicting packages; never exceed two active implementation PRs, excluding documentation/evidence-only work.
4. Use a dedicated branch and focused PR. Include purpose, WBS IDs, changed surfaces, tests, security/data risks, rollback plan and owner gates.
5. Require exact-head CI for applicable API build/unit/integration, Flutter analyze/tests, game-engine audit and web preview.
6. Review the diff for scope, privacy, authorization, migration safety and duplicate/stale branch risk.
7. Merge only when exact-head checks are green, required acceptance is met and no approval gate is crossed. After merge, verify the merge SHA and refresh the WBS evidence.
8. Keep production deployment, DB mutation, secret updates, SMS/payment, money movement, agent runtime/schedules, and APK builds outside ordinary code merge authority.

## WBS scoring and reporting

- The WBS v1.1 scope and 1,000-point weights are frozen.
- Each criterion in docs/WBS-CRITERION-SCORING-MATRIX-2026-11-03.md is worth exactly five points. Award only when the stated acceptance outcome is evidenced.
- No double-counting: one CI result may support only the criteria it actually tests.
- A criterion remains Pending if its evidence is stale, not exact-head, only source-level where runtime proof is required, or missing owner/manual acceptance.
- Every report includes audit date, earned points/1,000, percentage, each workstream, package statuses, evidence links, blockers, next actions and owner-approved exceptions.
- Status categories are mutually exclusive: Not started, In progress, Blocked, Approval gated, Complete. A blocker does not create earned points.
- Do not silently reweight the baseline or turn unknowns into assumptions.

## Change control

- Product/WBS scope or weight changes require a dated owner-approved revision and impact calculation before implementation.
- Roadmap order may change for security, data integrity or critical correctness, but the baseline remains unchanged.
- Material owner decisions are recorded in docs/REQUIREMENTS-TRACEABILITY.md; implementation evidence is recorded in the WBS matrix and rolling ledger.
- Superseded branches/PRs are not merged just to recover historical work; rebase/port only after current-main diff review and exact-head CI.

## Risk escalation

| Risk | Escalation |
|---|---|
| Data loss, schema drift, secret exposure, unauthorized access | Stop the affected production path; isolate and prepare a reviewed remediation |
| Incorrect game/economy state or duplicate settlement | Block release of affected capability; add deterministic regression tests |
| Missing device/owner acceptance | Keep criterion open; continue independent work |
| Provider outage or deployment drift | Preserve rollback; do not switch provider or alter DNS/config without approval |
| Missing budget/SLO target | Measure and present evidence; obtain owner decision before promising service levels |

## Current high-risk blockers

- Production source/schema parity and migration/recovery approval remain open; do not apply Production migrations or deploy.
- UNO Railway runtime is offline, lacks a connected source/domain/runtime configuration, and its DB prerequisite users.token_version is absent in the inspected production schema. Do not enable UNO.
- Chess/Hokm integration PR #196 is open; exact-head full CI and owner/product acceptance gates remain.
- API production provenance and secure configuration/network acceptance remain open.
- Real Android two-device, VPN continuity, accessibility, layout and performance acceptance remains open.
- Backup retention and end-to-end recovery evidence remain incomplete.
- APK generation remains prohibited absent explicit owner authorization.

## Operating review cadence

- Refresh the project snapshot before each work batch and after every merged milestone.
- Publish a milestone report after a criterion/package closes; do not promise unattended background work.
- This cadence is event-driven and does not create a scheduled automation or background job.

## Change history

- 2026-11-08: consolidated governance, WBS scoring rules, risk escalation and owner approval boundaries from the approved baseline and current repository evidence.


## Automatic PR merge — current behavior (2026-11-12)

- Owner instruction: merge PRs automatically only after exact-HEAD CI and documented technical review pass.
- Repository metadata reports `allow_auto_merge=true`.
- GitHub documentation says the auto-merge option is available only while a PR cannot yet be merged immediately, such as when required reviews or status checks remain outstanding. Once the PR reaches `CLEAN`, GitHub refuses the auto-merge mutation because there is nothing left to wait for.
- Attempts on PRs #244, #246, #247, #248 and #249 were made after their checks had already completed and returned `Pull request is in clean status`. This is not proof that the repository auto-merge setting is disabled.
- The accessible repository rulesets endpoint returned an empty list. Reading classic branch protection for `main` returned HTTP 403 to the current GitHub connection, so the effective branch requirements cannot be confirmed.
- The CI workflows now expose unique canonical job names for branch protection. Configure these required checks on `main`:
  - `API build and tests (full validation)`
  - `API integration tests`
  - `Flutter analyze and tests (full validation)`
  - `Backgammon engine and AI tests`
  - `Web Preview build`
- Do not require the intentionally skipped `deploy` job or the duplicate PR-validation jobs. GitHub warns that duplicate check names across workflows can make required checks ambiguous.
- Before enabling auto-merge for a PR, complete and record the technical review comment. Then enable auto-merge while at least one required check is still pending; GitHub will merge once all configured required checks pass. An independent approval can also be required if another reviewer is available.
- Do not manually merge as a workaround. Existing clean PRs cannot be armed through this mutation; they remain open until the owner chooses an authorized merge path or a required gate is made pending again.
