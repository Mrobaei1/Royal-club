# Royal Club Analytics Instrumentation — Phase 5

Status: first-pass production code instrumentation on an isolated feature branch. This is not a claim that every product domain is instrumented.

## Sources and grain

### Authenticated activity
- Table: `analytics_user_activity_daily`
- Grain: one row per user and PostgreSQL `CURRENT_DATE`.
- Capture: successful requests passing `requireMatchAuth`; one upsert per authenticated request.
- Fields: first seen, last seen, request count.
- DAU: distinct users with an activity row for the current database calendar date.
- WAU: distinct users with an activity row in the current date plus previous six calendar dates.
- MAU: distinct users with an activity row in the current date plus previous 29 calendar dates.
- Repeat active users (30d): users with activity on more than one distinct date in the 30-day window. This is not a cohort-retention rate or churn rate.
- D7 activity retention cohorts use the first observed authenticated activity date as cohort start and count any activity on days 7–13. Cohorts without 13 days of follow-up are excluded. This is not signup-cohort retention.
- Activity capture is best-effort and cannot reject a valid authenticated request if analytics persistence fails.
- Activity dates and reporting windows are normalized to UTC.

### Game events
- Table: `analytics_game_events`
- Allowed game types: backgammon, chess, cards, UNO, Mafia.
- Initial capture: backgammon room creation and player join.
- Other game types are schema-ready only; no events are written for them until their real game flows are connected.
- Event counts are not equivalent to completed games or unique players.
- Backgammon room creation, player join, actual game start, and game finish (including a resignation) are captured. Lifecycle events are deduplicated per match and game number.
- Match IDs are not constrained by a foreign key because the table is designed to accept multiple game backends with distinct match stores; source metadata must be added before cross-game drill-down.

## Advanced queries and exports
- Owner-only advanced endpoint supports an ISO date range of up to 90 days, a game-type filter, and equal-length adjacent-period comparison.
- Date windows and event-day grouping are UTC.
- CSV and PDF exports are owner-only, bounded to 10,000 event aggregate rows, marked no-store, and written to `analytics_export_audit_log` with actor, filters, format, and aggregate row count.
- PDF export uses a basic built-in Helvetica report; non-ASCII characters are replaced with question marks. It is an English-safe operational export, not a Persian-localized document.

## Operational telemetry
- API p50/p95 and 5xx rate are calculated from a bounded in-memory sample of the current process over five minutes.
- The sample resets on process restart and is not a durable SLA measurement.
- Database connectivity and probe latency are measured during each overview request.
- Infrastructure provider cost and agent execution metrics remain unavailable because no authoritative sources/runtime are connected.
- The integration suite seeds 10,000 game events and checks aggregation plus CSV/PDF export coverage.

## Security and failure behavior
- Analytics overview remains owner-only and read-only.
- All SQL values are parameterized; date windows are fixed to bounded 30-day aggregates in the initial endpoint.
- Internal credits remain explicitly classified as non-transferable credits, never cash revenue.
- If an analytics query fails, the overview returns an unavailable response rather than substituting values.
- Activity capture errors are logged and do not interfere with user authentication.

## Explicit gaps
- Cohort retention requires an agreed cohort definition, longer historical data, and privacy thresholds.
- Chess/card/UNO/Mafia event capture requires connecting their real match/session lifecycle.
- API latency percentiles, infrastructure resource/billing telemetry, and agent execution cost/quality require authoritative runtime/provider sources.
- Advanced date/game filters, equal-length adjacent-period comparison, and CSV/PDF export have first-pass implementation. Drill-down, retention cohorts, game-specific lifecycle capture beyond backgammon, and load tests remain outstanding.
