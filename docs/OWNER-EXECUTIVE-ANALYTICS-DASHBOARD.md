# Royal Club — Owner Executive Analytics Dashboard

Status: approved product specification; implementation and live-data integration are not yet claimed.

## Purpose and access
Provide the Owner with two complementary modes:
1. **Live overview** for operational awareness and urgent decisions.
2. **Advanced analytics center** for historical analysis, comparisons, segmentation, and exports.

This is an owner-facing capability. Other roles may receive separately scoped reports only when explicitly authorized. Navigation visibility is not authorization: every data query and export must enforce server-side permissions. Financial, security, personal, and ownership-sensitive data are owner-only unless explicitly and narrowly delegated.

## Mode A — Live overview
- Executive KPI tiles: registered users, DAU/WAU/MAU, active games, completed/abandoned/cancelled games, active subscriptions, and service health.
- Live operational status: API availability, latency, error rate, database connectivity, queue/job health, backup freshness, and active incidents.
- Alerts and decisions: pending owner approvals, security events, failed critical jobs, suspicious financial activity, and degraded services.
- Recent activity feed: auditable high-impact changes and significant operational events.
- Each tile displays its metric definition, source, event-time/window, last successful refresh, freshness state, and whether it is live, delayed, unavailable, or estimated.
- Live refresh uses bounded polling or server push where supported; show connection state and last successful update. Never imply real-time freshness when the feed is stale or disconnected.

## Mode B — Advanced analytics
### User and engagement
- Registration and active-user trends (DAU/WAU/MAU), retention and cohort views, churn, reactivation, session/activity patterns.
- Segmentation by date range, game, platform/app version, acquisition source, and country only where lawful, available, and privacy-safe.

### Games and leagues
- Starts, completions, duration, abandonment, cancellation, disconnects, rematches, and error rates by game.
- Participation, registrations, completion, standings, and outcomes for leagues/tournaments.
- Distinguish unique players from total game sessions.

### Finance and subscriptions
- Credit-token ledger inflows/outflows, balances, subscription sales/renewals, recognized revenue, refunds, fees, and operating costs where reliable source data exists.
- Reconcile aggregates to immutable ledger entries; clearly distinguish internal non-transferable credits from cash revenue.
- Refunds and every outbound movement remain subject to explicit, request-specific Owner approval. Analytics must never trigger financial actions.

### Infrastructure and reliability
- API latency percentiles, availability, error rates, database health, resource utilization, queue delays, backup success/freshness, incident frequency and duration.
- Provider/service cost trends where billing data is actually connected.

### Departments and agents
- Task throughput, completion/failure, queue age, retries, approval wait time, resource/cost consumption, and quality indicators.
- Drill-down by department/agent only for authorized viewers; report provenance and evaluation methodology.

## Visualization catalogue
Use visualizations suited to the metric, not decorative chart variety:
- Time-series line/area charts for trends and moving windows.
- Grouped/stacked bars for category and period comparisons.
- Donut/pie charts only for meaningful part-to-whole distributions.
- KPI cards, gauges/bullet charts for targets and service-level thresholds.
- Heatmaps for hour/day activity patterns.
- Cohort/retention matrices and funnels for user journeys.
- Tables for exact values, auditability, sorting, and drill-down.
- Anomaly/threshold annotations with links to the underlying incident or event.
All charts need units, axes, date/timezone, definitions, and accessible tabular alternatives. Avoid misleading truncated axes and unsupported precision.

## Filters, drill-down, and exports
- Shared date range and timezone selector; game, platform, app version, department, and status filters as applicable.
- Compare periods (previous period/year) only when windows are equivalent.
- Drill from aggregate to authorized underlying records with pagination and audit logging.
- CSV and PDF export with selected filters, generation timestamp, timezone, metric definitions, source/freshness metadata, and permission checks.
- Exports must be bounded, rate-limited, and logged; sensitive fields are excluded or redacted by default.

## Data correctness and governance — mandatory
- No fabricated, demo, seeded, extrapolated, or stale values may be presented as actual live statistics.
- Every metric has a governed definition: owner, formula, grain, source tables/events, inclusion/exclusion rules, timezone, refresh SLA, and known limitations.
- Use event timestamps for business windows and ingestion timestamps to monitor pipeline lag.
- Show last successful refresh and freshness status on every data surface. Mark delayed/stale/unavailable explicitly; do not silently carry forward old values.
- Display "not yet instrumented" when the required event/source does not exist. Display "estimate" only for explicitly approved estimates, visually distinct from actuals.
- Reconcile financial reporting against the authoritative ledger; never infer cash revenue from token movement.
- Handle late, duplicated, out-of-order, and corrected events idempotently.
- Define privacy thresholds and aggregation rules to avoid exposing small cohorts or unnecessary personal data.
- Analytics is read-only. No chart, filter, report, or export may perform an operational or financial mutation.

## Technical architecture
- Define a metric catalogue and typed API contracts before building widgets.
- Prefer pre-aggregated/materialized reporting views for expensive historical queries; keep transactional workloads isolated.
- Use a dedicated analytics/read-only database role and bounded query timeouts/limits.
- Live operational health comes from health/telemetry endpoints; business metrics come from authoritative event/ledger sources. Do not conflate the two.
- Instrument missing product events before claiming coverage.
- Cache only with explicit TTL and visible freshness metadata; invalidate or mark stale on source/pipeline failure.
- Add observability for dashboard API latency, query cost, failed refreshes, and export jobs.

## Delivery phases and acceptance gates
1. Metric inventory and definitions; identify missing instrumentation and authoritative sources.
2. Secure read-only API and data-quality/freshness contracts.
3. Live overview with explicit stale/disconnected states.
4. Advanced analytics charts, filters, comparisons, drill-down, and exports.
5. Privacy/security review, reconciliation, load/performance testing, accessibility, and owner acceptance.

Acceptance requires verified source-to-metric lineage, reproducible calculations, permission tests (including direct API access), stale-data tests, financial reconciliation, export controls, and passing CI at the exact branch head. Until then this document is a specification, not a claim of a working dashboard or live feed.
