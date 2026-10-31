# Royal Club Hokm — Work Breakdown Structure (WBS)

**Scope:** standalone implementation under `standalone/hokm-lab/` on `research/hokm-standalone`.
**Non-negotiable boundary:** no merge to `main`, production deployment, database migration, or APK build without the owner's explicit instruction.

## WBS and acceptance criteria

| WBS | Work package | Deliverables / acceptance criteria | Weight |
|---|---|---|---:|
| 1.0 | Rules and product specification | Confirm regional dealing, hakem rotation/selection, trick/hand scoring, match target, special cases and tie/forfeit rules; signed-off rule sheet | 8% |
| 2.0 | Rules engine | Valid 52-card deck, shuffle/deal, follow-suit, trump/lead resolution, deterministic state transitions | 12% |
| 3.0 | Round and match controller | Five-card hakem phase, remaining deal, 13-card hands, trick/hand scoring, 3/5/7 match target, next-round lifecycle | 10% |
| 4.0 | Room and invitation lifecycle | Four seats, private invite, ready/start, host transfer, empty-room cleanup, no occupied-room TTL | 8% |
| 5.0 | Authoritative online service | Fastify adapter, authenticated membership, atomic/versioned commands, persistence and event delivery | 12% |
| 6.0 | Reconnect and availability | Disconnect grace period, seat recovery, bot substitution policy, reconnect idempotency | 8% |
| 7.0 | AI players | Fixed hard-only policy; no user-selectable difficulty; public-information-only decisions; legal action validation; strategy simulation | 7% |
| 8.0 | Chat and voice | Room chat, abuse controls, mic permission/consent, mute/report and provider decision | 7% |
| 9.0 | Flutter game UI | Responsive RTL table, cards, hands, trick animation, score, invite/waiting room and accessibility | 12% |
| 10.0 | Manager controls | Authenticated manager-only target selector (3/5/7), room/connection policy and audit trail | 5% |
| 11.0 | Quality and security | Unit/property/integration/e2e tests, privacy leak checks, concurrency and recovery tests | 8% |
| 12.0 | Handoff readiness | API contract, setup/deployment guide, integration checklist and evidence-based completion report | 3% |

## Completion rules

- A package is 100% only when its acceptance criteria are implemented, reviewed, tested in CI or a reproducible environment, and documented.
- Overall progress is the weighted sum of package completion, not a subjective estimate.
- A green CI run proves only the tests included in that run; it does not certify production readiness.
- Unconfirmed regional rules remain explicit assumptions and block final rules sign-off.
- Integration into the main Royal Club application requires a separate explicit approval.

## Current baseline (2026-10-31)

| WBS | Evidence-based status | Estimate |
|---|---|---:|
| 1.0 | Initial assumptions documented; regional rule sign-off pending | 25% |
| 2.0 | Core engine, duplicate-deck validation, deterministic tests | 80% |
| 3.0 | Round/match transitions and full-hand regression tests implemented; final CI confirmation pending | 80% |
| 4.0 | In-memory lifecycle, readiness, host transfer, empty-only cleanup and match target tracking | 80% |
| 5.0 | No production Fastify/network/persistence adapter yet | 0% |
| 6.0 | Not implemented | 0% |
| 7.0 | Initial hard-only heuristic and legality/privacy tests implemented; strategic simulations and orchestration pending | 25% |
| 8.0 | Not implemented | 0% |
| 9.0 | Not implemented | 0% |
| 10.0 | Core accepts only 3/5/7 and architecture reserves source for trusted manager config; admin auth/UI/audit pending | 20% |
| 11.0 | Engine/room/round unit tests; full-match and malformed-deck regression checks added, CI confirmation pending | 30% |
| 12.0 | WBS, architecture contract and setup README documented; final handoff pending | 20% |

## Confirmed match scoring and progression rules (2026-10-31)

- End-of-match rewards only: +20 XP for each winning-team player; +5 XP for each losing-team player. No personal XP is granted at intermediate hand boundaries.
- Active-match leaver: −5 XP for that player only, with duplicate exit notifications protected against repeat deductions.
- Level curve: level 1 starts at 0 XP; advancement cost from level L is round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP is level 109. XP floors at zero and achieved level never decreases.
- In-memory calculation and unit tests are now in the isolated lab. Production persistence, atomic ledger transactions and server identity integration remain open.

These are planning estimates, not a claim of completed production functionality. Recalculate after each verified milestone.
