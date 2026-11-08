# Royal Club — Architecture and non-functional requirements

**Status:** Architecture baseline / NFR proposal; owner-controlled decisions remain explicit  
**Reviewed:** 2026-11-08  
**Governing scope:** WBS v1.1 (docs/PROJECT-WBS-BASELINE.md)

## Product constraints

- Android-first, serving users in Iran and internationally.
- Persian (fa) and English (en) are the only supported locales.
- Backgammon is the current implementation priority; chess and card games remain product scope.
- Core games and social features launch free by default. Paid behavior, real SMS, production changes, and APK builds remain separately approval-gated.
- Identity must not depend on IP address or VPN exit IP. Public identity is username-only; private account fields are visible only to the account owner and authorized server-side workflows.
- No live audio/video calling, WebRTC calling, or TURN. Future recorded voice messages remain optional, disabled, and outside current user-facing functionality.
- Owner/GM is the final authority. Delegation is deny-by-default and cannot supersede owner approval.

## System context and trust boundaries

    Android Flutter client
      | HTTPS / authenticated API requests
      v
    Fastify / TypeScript API ---- PostgreSQL (Neon)
      |                               |
      | server-authoritative          | durable state, ledgers,
      | identity, game rules,          | audit records, migrations
      | economy and authorization     |
      v
    Dedicated game services (where separately deployed)
      | signed/versioned service discovery
      v
    UNO service (Railway target; currently not production-deployed)

    Owner/admin UI -> authenticated API -> owner/permission checks -> audited writes

The mobile client is an untrusted presentation/input layer. It must not decide account identity, game legality, XP/rating settlement, wallet balance, subscription entitlement, league outcomes, or administrative authorization. The API is the authority for those decisions. PostgreSQL is the durable source for transactional account/economy/game state. A game service may own its bounded game runtime, but it must bind identity to verified Royal Club credentials and use explicitly provisioned least-privilege database access.

## Component boundaries

| Component | Owns | Must not own |
|---|---|---|
| Flutter mobile (apps/mobile) | UI, locale/theme, input validation for usability, secure token storage, API transport | authoritative identity, wallet/game settlement, owner privilege, secrets |
| Fastify API (apps/api) | authentication/session validation, authorization, domain rules, transactions, public projections, admin gates | client-trusted outcomes or embedded provider secrets |
| PostgreSQL / Neon | durable records, constraints, transactions, ledgers, audit history | client-facing policy decisions without API authorization |
| Dedicated game service | isolated game session lifecycle and game-specific state under verified identity | independent accounts, unverified identity, broad API/owner DB credentials |
| Deployment providers | runtime/container hosting, health/telemetry, environment injection | product policy or authority to enable paid/privileged features |

## Non-functional requirements and verification contract

The table defines the measurement required for acceptance. Numeric service-level targets are intentionally marked owner decision required rather than invented as approved commitments.

| ID | Requirement | Measurement / acceptance evidence | Target status |
|---|---|---|---|
| NFR-01 | Security by default | Negative tests for unauthenticated, non-owner, expired/revoked session, cross-account and malformed input paths; no secrets in source/logs | Required; code tests exist in part |
| NFR-02 | Privacy | Public API contract tests assert no full name, phone, email, token, private hand or private chat leakage | Required; source tests exist in part |
| NFR-03 | Network independence | Same account/session survives client IP/VPN route change; test actual socket peer changes and Android VPN OFF/ON/OFF | API regression evidenced; device acceptance open |
| NFR-04 | Game integrity | Server validates legal actions; duplicate/racing commands are idempotent; concurrent state writes use transaction/CAS | Required per game; coverage varies |
| NFR-05 | Economy integrity | Server-side ledger, atomic balance changes, idempotency and owner-only adjustments; client cannot set prices/balances | Required; coverage varies |
| NFR-06 | Availability/recovery | API and DB health checks, bounded retry behavior, documented restore procedure, measured RPO/RTO | Production and recovery acceptance open |
| NFR-07 | Performance | Measure API p50/p95/p99, error rate, DB pool saturation, game-action latency and Android frame/jank on agreed load profile | Numeric thresholds require owner approval |
| NFR-08 | Scalability | Load test with stated concurrent users/rooms, replicas and DB pool; record throughput, p95/p99 and recovery | Load profile/thresholds require owner approval |
| NFR-09 | Localization/accessibility | Persian RTL and English LTR, dynamic text, screen readers, text scaling, supported Android sizes | Automated coverage partial; device acceptance open |
| NFR-10 | Operability | Every release has exact Git SHA, migration manifest, health/smoke results, rollback/recovery plan and redacted logs | Deployment provenance/production acceptance open |
| NFR-11 | Cost control | Provider/region, database compute, egress, storage and service replicas have an explicit owner-reviewed budget before scale-up | Budget ceiling requires owner approval |
| NFR-12 | Extensibility | New games reuse identity/navigation/transport contracts and isolate game rules/state; no duplicate account or wallet authority | Architecture baseline; per-game integration acceptance required |

## Deployment and portability rules

- API production release is manual-only and requires explicit owner approval; merge or push is not a production deployment.
- Mobile API origin and dedicated game-service origins must be environment-specific, validated, versioned where supported, and must fail closed on invalid configuration.
- Never assume a provider migration is portable merely because the code uses PostgreSQL. Verify connection semantics, TLS, pooling, migrations, scheduled work, secrets, backups, observability and region/network constraints.
- UNO service remains one replica until shared state/coordination is designed and tested. Its Railway service is currently offline and unprovisioned for runtime variables/domain/source.
- No production database migration, secret change, SMS/payment activation, agent runtime activation, network policy change, or APK build is authorized by this document.

## Architecture acceptance checklist

- [x] Android-first Flutter / Fastify API / PostgreSQL component split is identified in the repository.
- [x] Server-authoritative trust boundary is documented.
- [x] Owner approval and dormant privileged-action boundaries are documented.
- [ ] Verify provider portability against a second provider or isolated deployment rehearsal.
- [ ] Prove all game/economy trust boundaries with negative tests on the current exact mainline head.
- [ ] Approve numeric performance, capacity, availability, RPO/RTO and cost targets.
- [ ] Complete production deployment provenance and recovery acceptance.

## Change history

- 2026-11-08: initial consolidated architecture/NFR baseline prepared against live repository documentation and source entry points. This is not a production security certification or owner approval of numeric SLOs.


## Proposed measurable service targets — not yet owner-approved

These values are an engineering proposal to make acceptance measurable. They are not production SLAs, capacity promises, or permission to scale/deploy. The owner must approve or revise them before they become binding.

| Area | Proposed acceptance target | Measurement |
|---|---|---|
| API latency | p95 ≤ 500 ms and p99 ≤ 1,500 ms for ordinary authenticated reads at the agreed 1,000-concurrent-user profile | 15-minute steady-state load, report per-route p50/p95/p99 |
| Game command latency | p95 ≤ 300 ms server processing time, excluding client/network RTT | Instrument authoritative command receipt to committed response |
| API availability | 99.5% monthly for the API once production monitoring is in place | Provider-independent synthetic health probes; exclude announced maintenance only if policy approved |
| Server error rate | < 1% 5xx over a rolling 15-minute window under the agreed load profile | Count 5xx / total API requests; report route and dependency breakdown |
| Recovery | Proposed RPO ≤ 15 minutes; RTO ≤ 4 hours for core account/game data | Isolated restore drill, measure data-loss window and time to verified service |
| Security | 100% of authorization-negative test cases reject; zero known critical/high findings at release | Exact-head automated negative tests plus independent review for release |
| Localization | 100% of visible core navigation/game/auth strings localized in fa/en; no clipped text at supported font scale | Automated localization coverage plus Android device matrix |
| Accessibility | All primary controls have accessible labels/actions; no critical TalkBack blockers | Manual TalkBack walkthrough and widget-level semantics tests |
| Cost | Monthly infrastructure spend stays within a GM-approved budget; alert at 70% and 90% | Provider billing exports and monthly cost report |
| Extensibility | New game integration reuses shared auth, service discovery, telemetry and navigation contracts; no duplicate account/wallet authority | Architecture checklist and contract tests per game |

### Proposed load profile

- 1,000 concurrent authenticated users, including a representative mix of lobby reads, active game commands, chat/notification polling and profile reads.
- Ramp up over 10 minutes, hold for 15 minutes, then ramp down; repeat at least three times.
- Record request throughput, p50/p95/p99 latency, 4xx/5xx rates, DB pool saturation, CPU/memory, reconnect success and queue/deadline lag.
- Run first in isolated staging with synthetic accounts and data. Do not run against Production without a separate explicit approval.
- A successful load test must include evidence of no duplicate settlement, lost committed game actions, cross-user data leakage or unbounded resource growth.

### Decision status

All values above remain **Proposed / Approval required**. In particular, monthly availability, RPO/RTO, infrastructure budget, the 1,000-user profile and latency/error thresholds must be confirmed by the GM before WBS 1.1-B can be marked Passed.
