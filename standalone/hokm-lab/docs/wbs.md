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
| 7.0 | Hard-only AI strategy | Fixed Hard policy with deterministic public-information sampling, void-suit constraints, partner-aware two-trick lookahead; 300-deal benchmarks and hidden-hand / legality tests | 7% |
| 8.0 | Chat and voice | Room chat, abuse controls, mic permission/consent, mute/report and provider decision | 7% |
| 9.0 | Flutter game UI | Responsive RTL table, cards, hands, trick animation, score, invite/waiting room and accessibility | 12% |
| 10.0 | Manager controls | Authenticated manager-only target selector (3/5/7), room/connection policy and audit trail | 5% |
| 11.0 | QA and security | Engine/room/round/progression tests, seeded property tests, full-match simulations, AI benchmarks, privacy and reconnect checks; production integration/concurrency/security suites still pending | 8% |
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
| 2.0 | Core engine, duplicate-deck validation, deterministic tests, public completed-trick history and 2,000 seeded deal / 5,000 seeded trick property checks; CI green | 88% |
| 3.0 | Round/match transitions, public trick-history views and full-hand regression tests; CI green | 85% |
| 4.0 | In-memory lifecycle, readiness, host transfer, empty-only cleanup and match target tracking | 80% |
| 5.0 | No production Fastify/network/persistence adapter yet | 0% |
| 6.0 | In-memory transient disconnect grace (20s default/configurable), version-checked timeout takeover, safe reclaim without rollback, permanent forfeit distinction, and consecutive multi-seat Hard bot takeover through complete-hand test; production scheduler/session binding and distributed race handling remain open | 60% |
| 7.0 | Fixed hard-only policy uses deterministic public-information determinization; 24 seeded allocations respect public void-suit evidence and remaining-card counts; candidate evaluation includes partner-aware play and a validated two-trick lookahead; 300-deal benchmarks: 86.67% wins vs legal-random and 55.67% vs deterministic greedy, with 70.87% and 54.47% trick share; determinism, hidden-hand invariance and legal-action tests pass; three-trick experiment was benchmarked and rejected because its 87.00% random win rate came with a lower 54.33% greedy win rate; expert baselines and broader match-level strategy evaluation remain pending | 84% |
| 8.0 | Not implemented | 0% |
| 9.0 | Not implemented | 0% |
| 10.0 | Core accepts only 3/5/7 and architecture reserves source for trusted manager config; admin auth/UI/audit pending | 20% |
| 11.0 | Engine/room/round/progression tests plus 2,000 seeded deal, 5,000 seeded trick, 3,000 scoring and 52 malformed-deck property cases; 24 seeded bot deals, 100 seeded full matches, 300-deal random and greedy benchmarks with two-trick search, deterministic mid-trick decision checks, hidden-hand invariance, public card-count validation, partnership edge cases, public-history privacy, forfeit takeover, disconnect/reclaim, stale-version checks and multi-seat disconnect takeover regression; production integration/concurrency/security suites pending | 67% |
| 12.0 | WBS, architecture contract and setup README documented; final handoff pending | 20% |

## Confirmed match scoring and progression rules (2026-10-31)

- End-of-match rewards only: +20 XP for each winning-team player; +5 XP for each losing-team player. No personal XP is granted at intermediate hand boundaries.
- Active-match leaver: −5 XP for that player only, with duplicate exit notifications protected against repeat deductions. The same seat is immediately taken over by the fixed Hard bot and the match continues.
- Level curve: level 1 starts at 0 XP; advancement cost from level L is round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP is level 109. XP floors at zero and achieved level never decreases.
- In-memory calculation and unit tests are now in the isolated lab. Production persistence, atomic ledger transactions and server identity integration remain open.

**Weighted overall progress: 44.90%** (sum of each WBS weight multiplied by its current estimate). This is a planning estimate only; packages with no implementation remain at 0%, and the standalone lab is not production-ready.

These are planning estimates, not a claim of completed production functionality. On 2026-10-31 the bot public-card ledger, void-suit inference, full-hand simulation, round-history tests, in-memory disconnect/reclaim lifecycle, seeded engine property suite, 300-deal Hard-vs-random benchmark, 300-deal Hard-vs-greedy benchmark, focused partnership edge-case tests and deterministic public-information sampled trick search were added. With 24 samples and two-trick lookahead, latest validated benchmark results: 260/300 wins (86.67%) vs random and 167/300 wins (55.67%) vs greedy; trick shares were 70.87% and 54.47%. CI run 41233863640 passed with 63/63 tests. A 16-sample comparison was also green but scored lower (85.33% vs random and 54.67% vs greedy), so the 24-sample budget was retained. Production integration and deeper multi-trick search remain open. On the latest validation pass, the sampler now rejects inconsistent public card counts before attempting hidden-hand allocation; three seeded mid-trick positions verify legal, repeatable second/third-seat decisions. CI run 41234651631 passed 64/64 tests; run 41234647639 passed the bot source validation and 63/63 tests. Earlier CI runs 41232745980 and 41232884938 (benchmarks), and 41232886320 (partnership edge cases) also passed. Production integration and stronger AI search remain open.


Three-trick search experiment review (2026-10-31): CI runs 41249664663, 41249711339 and 41249740986 completed successfully. The 300-deal three-trick run measured 261/300 wins (87.00%; 71.61% trick share) vs legal-random and 163/300 wins (54.33%; 54.33% trick share) vs deterministic greedy. The validated two-trick baseline measured 260/300 (86.67%; 70.87%) vs random and 167/300 (55.67%; 54.47%) vs greedy. The tiny random-baseline gain did not compensate for the greedy-baseline regression, so the experimental three-trick extension was reverted and two-trick search retained. This is a benchmark-based rejection, not a claim that deeper search is inherently worse.
