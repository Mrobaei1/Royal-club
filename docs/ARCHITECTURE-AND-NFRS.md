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
