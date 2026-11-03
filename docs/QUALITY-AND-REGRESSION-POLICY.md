# Quality and Regression Prevention Policy

This policy applies to every Royal Club feature and every future release. A reported defect is not considered fixed merely because a code change was committed.

## Definition of done for a defect

A defect may be marked **fixed** only when all applicable gates are satisfied:

1. **Reproduce and scope:** record the observed behaviour, expected behaviour, affected flows and relevant version/commit. If reproduction is unavailable, state that explicitly.
2. **Root cause:** identify the underlying cause in code or the contract. Do not ship a symptom-only workaround as a complete fix.
3. **All affected paths:** inspect every entry point and asynchronous path that shares the same state, API contract or lifecycle. Apply one consistent implementation where practical.
4. **Regression protection:** add a focused automated test that fails for the old behaviour and passes for the corrected behaviour. Add API integration or widget/E2E coverage when the defect crosses those boundaries.
5. **Adjacent regression checks:** run the directly affected tests and relevant shared-module/game regression suites. A fix must not silently break another game or platform.
6. **Exact-commit verification:** report test commands, results and the exact commit SHA. Results from an earlier commit do not validate a later commit.
7. **Durable documentation:** update the relevant contract/WBS and note any invariant future contributors must preserve.
8. **Release gate:** do not claim production completion until required CI, integration acceptance and owner sign-off are complete.

## Async and server-authoritative state

- The server is authoritative for online game state.
- Every state-changing response and snapshot must carry a non-negative integer `stateVersion`.
- Clients must never invent a version when a server response omits or malforms it.
- A response with a lower version must never overwrite a newer client snapshot.
- State mutations must send the expected version; stale mutations must be rejected by the server and trigger a fresh snapshot.
- Keep parser/ordering logic shared and covered by unit tests; test API monotonicity and persisted snapshot parity at integration level.
- When adding a new asynchronous action, include it in the same version-ordering review. Do not protect polling while forgetting action responses.

## Royal Club repository safeguards

- Keep game modules and their API schemas isolated; do not reuse another game's tables, routes or state model without explicit architecture approval.
- Do not weaken or delete a regression test to make a change pass without an explained, reviewed contract change.
- Preserve the owner's explicit controls: no merge to `main`, deployment or APK build without the owner's authorization.
- WBS percentages must reflect committed implementation and evidence, not effort or intention.
- If a test cannot be run in the available environment, mark it **not executed**; never report it as passed.

## Manch online version-ordering invariant

For Manch online, `GET` snapshots, roll, move and forfeit responses all use the same strict version parser and stale-response guard. Missing, fractional, non-finite or negative versions are invalid. The Flutter unit tests cover parsing and ordering; the API integration test checks that forfeit increments the version and that the persisted GET snapshot returns that same version.

Any future Manch online action that applies server state must use this shared guard and extend the regression tests before it is considered complete.
