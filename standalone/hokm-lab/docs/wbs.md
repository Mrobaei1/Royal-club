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
| 7.0 | AI players | Easy/medium/hard decision policies; all actions pass the same authoritative validator | 7% |
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
| 2.0 | Core engine and deterministic tests exist; malformed-deck guard being strengthened | 75% |
| 3.0 | Round and match state machines exist; full-hand and match-target regression tests being added | 65% |
| 4.0 | In-memory room lifecycle, readiness, host transfer and empty-only cleanup exist | 75% |
| 5.0 | No production Fastify/network/persistence adapter yet | 0% |
| 6.0 | Not implemented | 0% |
| 7.0 | Not implemented | 0% |
| 8.0 | Not implemented | 0% |
| 9.0 | Not implemented | 0% |
| 10.0 | Pure-core target validation exists; authenticated admin UI/API and audit trail pending | 20% |
| 11.0 | Unit tests and CI exist; integration/security/property/e2e coverage pending | 20% |
| 12.0 | Initial architecture/readme exist; final handoff pending | 15% |

These are planning estimates, not a claim of completed production functionality. Recalculate after each verified milestone.
