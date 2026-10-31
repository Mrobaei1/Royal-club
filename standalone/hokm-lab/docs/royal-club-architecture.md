# Royal Club Hokm — Integration Contract (Design Only)

This document describes the intended adapter boundary. It does not wire anything into the production app.

## Match XP and level progression
- Personal XP is awarded only after the final match result: +20 XP for each winning-team player and +5 XP for each losing-team player. Intermediate hands do not award personal XP.
- A player leaving an active match receives −5 XP individually. The penalty operation is idempotent and does not penalize teammates.
- Level 1 starts at 0 XP. Advancement cost from level L to L+1 is round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP maps to level 109.
- XP is cumulative and non-spendable, floored at zero; achieved levels never decrease. Practice/offline games award no XP.
- The current lab implements the calculation in memory only. Production must persist a per-user, per-game XP ledger and commit final match status plus rewards atomically with a unique match-result key to prevent duplicate awards.

## Fixed bot policy
- Bot difficulty is fixed to **Hard** for every bot-controlled seat.
- There is no player-facing or room-facing difficulty selector, and no client/API command may override it.
- The server owns the bot policy; clients cannot submit strategy parameters or hidden information.
- Hard strategy may use only the bot's own hand and information legitimately visible to that seat.
- Every bot move passes through the same authoritative legal-move validator as a human move.

## Fixed hard bot policy — first implementation
- The isolated lab has a deterministic policy entry point in `src/bot.js` for hakem trump selection and legal card selection.
- It uses the bot's own hand, current public trick and publicly completed trick history only; its visible ledger counts unseen cards by suit and infers opponent void suits from public off-suit plays. It does not inspect opponents' hidden hands or the undealt deck.
- Every proposed play is selected from `legalCards`, and the normal `playCard`/room validator remains the authority.
- This is an improved heuristic milestone, not yet a strategically proven expert bot. Deterministic full-hand simulation is covered by CI; deeper trick-outcome search, robust partner strategy, seeded multi-deal benchmarking and room-level bot orchestration remain required.

## Authoritative server commands
Every command must be authenticated and scoped to a room: create/join/leave, ready/start, choose trump, play card, reconnect and chat.
The server derives seat from authenticated membership. Never accept client-supplied seat/team/score/hand as authoritative input. Match target (3, 5, or 7) comes from trusted manager configuration.

## Server-side validation
For each command, verify membership, room phase, turn, card ownership, follow-suit legality, atomic/versioned state transition and correct public/private event delivery. Reject stale commands using a monotonically increasing room version.

## Data separation
- Private server state: all hands, shuffled deck, hidden bot state.
- Public room state: seat occupancy, readiness, phase/current seat, trump, current and completed public plays, trick counts, public score and deadlines.
- Per-seat payload: public state plus only that seat's own cards.
- Never log full hidden hands in production telemetry.

## Room lifecycle
Use server time for invitation expiration and turn deadlines. Cleanup jobs must be idempotent. Transient disconnect and intentional departure are separate server-side events. A transient disconnect holds the original seat for a configurable grace period (20 seconds by default in the lab), with no XP penalty. If the grace deadline expires, the fixed-Hard bot temporarily controls that same seat; the original authenticated user may reclaim it, but already committed bot moves are never rolled back. A reconnect received after the deadline must first pass through the timeout transition, preventing a race that skips bot takeover. Intentional active-match departure is permanent: apply −5 XP once, mark the seat forfeited, hand control to the fixed-Hard bot and reject all later commands/reconnect attempts from that user. Bot-generated trump/card actions use the same server-side round validators as human actions. The lab exposes explicit version-checked transition functions; a production service must schedule deadlines using server time and enforce session ownership, atomic compare-and-swap/version checks and idempotent timeout jobs.

## Royal Club compatibility
Flutter/Dart UI, existing Fastify/TypeScript API and existing PostgreSQL infrastructure. No second account or wallet system. Voice requires explicit permission, consent, moderation and provider/cost review. No production routes, database schema, deployments or APKs are changed by this lab.
