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
- [ ] Enforce the 24-hour appeal deadline.
- [ ] Record and report actual games played per participant and rest allocation.
- [ ] Require an explicit manager decision for final-stage setup, based on the configured format.
- [ ] Record rescheduling decisions for double absence and technical interruptions.
- [ ] Integration-test authorization, concurrent entry, idempotency, audit history, and the no-wallet-debit guarantee.
- [ ] Manually accept the Persian and English manager UI before enabling a real league.

## Current implementation boundary

The integration candidate includes owner-controlled league CRUD, disabled-by-default/free-by-default entry, transactional subscription-day consumption with an entitlement ledger, manager-selected format and minimum participants, and persisted/audited policy fields. Actual tournament scheduling, rest allocation and game-count reporting, appeal enforcement, final-stage execution, and rescheduling workflows for double absence or technical incidents still require implementation and acceptance before the weekly league can be described as complete.
