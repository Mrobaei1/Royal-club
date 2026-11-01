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
- Activity capture is best-effort and cannot reject a valid authenticated request if analytics persistence fails.
- Current date semantics follow the PostgreSQL session timezone. Timezone selection and explicit UTC conversion remain follow-up work.

### Game events
- Table: `analytics_game_events`
- Allowed game types: backgammon, chess, cards, UNO, Mafia.
- Initial capture: backgammon room creation and player join.
- Other game types are schema-ready only; no events are written for them until their real game flows are connected.
- Event counts are not equivalent to completed games or unique players.
- Match IDs are not constrained by a foreign key because the table is designed to accept multiple game backends with distinct match stores; source metadata must be added before cross-game drill-down.

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
- Advanced date/game filters, period comparison, drill-down, CSV/PDF export, and load tests remain outstanding.
