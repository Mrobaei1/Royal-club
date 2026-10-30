# Royal Club weekly league rules

This document records the product decisions approved for the weekly league. It is a specification and acceptance checklist; it does not claim that every rule is already enforced by the running service.

## Confirmed policy

- **Minimum participants:** chosen by the manager for each league. The chosen value and each change must be audit-logged.
- **Rest / bye allocation:** maximize fairness and balance. The final report must show each participant's actual number of games, including any rest rounds.
- **Final stage:** determined by the selected league format and an explicit manager decision. It must not be silently inferred or activated by default.
- **Appeals:** a 24-hour appeal window.
- **Both players absent:** arrange a replacement time where possible; record the decision and outcome.
- **Technical interruption:** arrange a replacement time where possible; record the decision and outcome.
- **Language scope:** Persian and English only.
- **Entry cost:** free by default. If the owner explicitly configures subscription-day entry, consume subscription entitlement days through the dedicated ledger. Never debit wallet credits for league entry.
- **Activation:** no league or paid behavior is enabled automatically. Owner/manager changes must be authenticated and auditable.

## Required league configuration

Each league should store its format, manager-selected minimum participant count, start/end schedule, entry mode, and subscription-day cost (when selected). The policy fields for appeal deadline, rest balancing, final-stage approval, double absence, and technical interruptions must be visible to authorized managers.

## Acceptance checklist

- [ ] Reject enabling a league until the manager sets a valid minimum participant count.
- [ ] Audit-log creation and every change to format, minimum participants, schedule, entry mode, and rule decisions.
- [x] Enforce the 24-hour appeal deadline in the API.
- [x] Record round-robin fixtures/byes and report actual completed games and rest rounds per participant.
- [x] Dedicated integration test verifies a five-player round robin creates all 10 unique pairings, gives every player exactly one bye, and reports four completed games per player after results are recorded.
- [x] Require explicit manager approval and a compatible format for final-stage round creation.
- [x] Record double-absence/technical-issue decisions and allow managers to set a replacement time.
- [x] Existing integration tests cover authorization, concurrent entry, idempotency, audit history, and the no-wallet-debit guarantee. New scheduling/appeal flows still need dedicated integration tests.
- [x] Provide manager UI for creating manual Swiss/knockout/group-format rounds and require explicit approval before a compatible final stage.
- [ ] Manually accept the Persian and English manager UI before enabling a real league.

## Current implementation boundary

The API now includes round-robin schedule generation, manager-created rounds, approved final-stage setup for compatible formats, participant game/rest reports, match-result and incident recording, replacement-time scheduling, 24-hour appeals, manager appeal decisions, and audit history. The mobile manager report exposes match results, incident/reschedule actions, and appeal decisions. Automatic schedule generation is intentionally limited to round-robin. Swiss, knockout, and groups-then-knockout require manager-created rounds; unsupported automatic generation is rejected before any round is written. The mobile UI now labels this boundary and exposes the automatic schedule action only for round-robin. Remaining acceptance includes the manager UI for manually creating Swiss/knockout/group rounds, real-device Persian/English review, and production security/deployment acceptance. API integration coverage includes the five-player round-robin bye-balance scenario and verifies that unsupported automatic formats leave no partial schedule.
