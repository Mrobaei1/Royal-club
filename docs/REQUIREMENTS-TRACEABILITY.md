# Royal Club — requirements and decision traceability

**Reviewed:** 2026-11-08  
**Baseline:** WBS v1.1 · 53 leaf packages · 1,000 points  
**Purpose:** Keep approved product constraints linked to implementation surfaces and acceptance evidence without treating code presence as acceptance.

| Requirement / owner decision | WBS | Implementation surface | Verification / evidence | Remaining gate |
|---|---|---|---|---|
| Android-first, Iran + international | 1.1 | apps/mobile, apps/api | Product baseline and repository README | Device/network acceptance |
| Persian + English only | 1.1, 2.4, 2.5 | Flutter localization resources and locale/direction tests | docs/PHASE-1-LOCALIZATION-AUDIT.md; Flutter tests | Manual screen-size RTL/LTR acceptance |
| Backgammon priority; chess/cards retained | 1.6, 3.8 | Home/navigation and game modules | docs/EXECUTION-ROADMAP-v1.md; current-main game integrations and open integration PRs | Complete exact-head integration checks and real-device acceptance |
| Free-by-default core games/social | 1.3, 5.5, 5.6 | API wallet/subscription/league authorization and admin controls | docs/PHASE-1-3-READINESS.md; API integration tests | Re-audit all monetization entry points; no paid activation |
| Login independent of IP/VPN | 1.3, 2.7 | JWT/session auth and request identity | PR #162 merge e0b3fc3dbf2aaf4cef51f564c63c625078b5d4a0; actual socket-address regression tests | Physical Android VPN OFF/ON/OFF |
| Username-only public identity | 1.3, 2.3, 4.5 | Public profile/friend/chat/leaderboard/match/spectator projections | docs/PHASE-1-3-READINESS.md; API payload privacy assertions | Legacy/empty profile and full UI audit |
| Private account fields | 1.3, 2.3 | Self-profile/auth routes | API integration assertions | Manual account/public-surface review |
| No live voice/video calls or TURN | 1.3, 4.2, 7.6 | Scope exclusions; no runtime dependency in approved baseline | WBS v1.1 and readiness/checkpoint docs | Regression audit of current dependency/deployment inventory |
| Future voice messages OFF | 1.3, 6.1, 6.3 | Dormant manager-only flag/config; no user send action | WBS v1.1; owner permission design | Do not activate without explicit approval |
| GM final authority; assistants scoped | 1.3, 6.2–6.5 | Owner identity, delegated permission checks, audit and kill switch | docs/PHASE-1-SECURITY-REVIEW.md; PR #179/#183/#189 and API tests | Complete owner-approved permission matrix and secure production identity acceptance |
| Wallet credits non-transferable; manager-set prices | 1.3, 5.1–5.2 | API wallet ledger and owner/admin plan APIs | Readiness checklist; PR #192 | Full transactional activation/expiry and manager UI acceptance |
| No APK absent explicit authorization | 1.4, 7.8 | Manual-only workflow guard | README deployment safety and execution roadmap | Continue requiring separate approval |

## Decision log (confirmed decisions only)

| Decision | Authority / date | Status | Implementation consequence |
|---|---|---|---|
| Android-first; Iran and international users | Owner-approved WBS v1.1, 2026-11-02 | Confirmed | Android is primary acceptance platform; do not exclude international access |
| Persian and English only | Owner-approved WBS v1.1 | Confirmed | Do not add other locales without scope revision |
| Backgammon first; chess/card games remain | Owner-approved WBS v1.1 | Confirmed | Preserve entry points; order work by dependency and correctness |
| Free-by-default launch | Owner-approved WBS v1.1 | Confirmed | No paid activation or automatic charging |
| No IP/VPN-bound identity | Owner-approved WBS v1.1 | Confirmed | Session identity comes from verified credentials, not client network address |
| Username-only public identity | Owner-approved WBS v1.1 | Confirmed | Private fields remain self-only/authorized |
| No live calling / TURN; voice notes future optional OFF | Owner-approved WBS v1.1 | Confirmed | Do not add calling infrastructure; no voice-message send action |
| GM is final authority; privileged actions require explicit approval | Owner instructions / security charter | Confirmed | Deny-by-default grants; no financial, production or agent action without approval |
| No APK build without separate explicit instruction | Owner instructions / README | Confirmed | APK workflows remain manual and gated |

## Unresolved decisions (must not be guessed)

- Numeric latency, concurrency, availability, RPO/RTO and infrastructure-cost targets.
- Whether to configure a Neon network/IP allowlist given the actual serverless egress topology.
- Final complete manager/assistant/agent permission matrix and exact operational scopes.
- Production API migration/deployment timing and approval.
- Real SMS provider activation, payment activation, and any future paid feature launch.
- Whether to add or remove product scope beyond the approved WBS.

## Audit rule

A row moves to accepted only with evidence at the correct layer: source review for architecture, automated tests for deterministic behavior, staging/device evidence for runtime UX/network behavior, and owner approval for privileged/production decisions. This table is a traceability aid, not a substitute for the WBS scoring matrix.


## Owner decision — automatic PR merge after CI and technical review (2026-11-11)

| Decision | Authority / date | Status | Implementation consequence |
|---|---|---|---|
| Automatically merge only after exact-HEAD CI succeeds and a documented technical review has no blocking findings | Owner instruction, 2026-11-11 | Blocked by GitHub repository rules | `allow_auto_merge=true` is confirmed, but GitHub rejects enablement with `Pull request is in clean status`. Accessible rulesets list is empty; classic branch-protection read is denied to the current connection. Owner must verify/configure the `main` branch rule and required checks/review. Manual merge is not an allowed bypass. |

## Owner decision — Agent implementation starts immediately (2026-11-11)

| Decision | Authority / date | Status | Implementation consequence |
|---|---|---|---|
| Implement the Royal Club Agent platform from the current stage through full development | Owner instruction, 2026-11-11 | Confirmed | Agent Center, task/proposal lifecycle, scoped permissions, audit, kill switch, observability and non-operational simulation are active workstreams. |
| Keep runtime and live privileges disabled until separate approval | Owner instruction and governance boundary, 2026-11-11 | Confirmed | Build code/tests and non-operational simulations only; no live identity/grant, schedule, external message/provider, financial action or production execution without separate explicit approval. |
