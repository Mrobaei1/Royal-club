# Royal Club — Standalone Hokm Lab

**Isolation guarantee:** this folder exists only on branch `research/hokm-standalone`. Nothing here is merged into `main`, wired into the production app, or deployed. Do not merge without the owner's explicit instruction.

## Purpose
Build and verify an independent, Royal Club-compatible Hokm/Court Piece game module before any integration. This is not yet a complete or production-ready game.

## Fixed product decisions
- Bot difficulty is permanently **Hard**; no player or room selector may change it. The bot may use only its own hand and public information and must use the normal legal-move validator.
- Personal XP is awarded only after the entire match ends: each winning-team player receives +20 XP; each losing-team player receives +5 XP. Intermediate hands change only the team match score.
- A player leaving during an active match receives −5 XP. The penalty is for that player only and is idempotent. The seat remains reserved until match/AI takeover rules are implemented.
- Level 1 starts at 0 XP. Advancement from level L to L+1 costs round(300 + 5(L−1) + 0.08(L−1)^2). Level 100 starts at 79,439 XP; 95,000 XP is level 109. XP is non-spendable, cannot fall below zero, and achieved level never decreases.
- Offline/practice games do not award XP.

## Requirements and planned modules
1. Rules engine and round/match controller.
2. Deterministic, randomized and regression tests.
3. Fixed hard-only AI.
4. Four-seat authoritative online service, invitations, reconnect and timeout handling.
5. Private hands and server-side command validation.
6. Flutter UI, localization, chat and optional microphone feature.
7. Security, concurrency, recovery and end-to-end QA.

## Current status
- [x] Isolated branch and independent engine/round/room foundation.
- [x] Match XP calculation and level progression module.
- [x] Active-match leaver penalty helper with duplicate-event protection.
- [ ] Persistent per-user XP ledger and atomic match-result transaction.
- [x] Fixed-hard bot with legal-card selection, public unseen-card counting, void-suit inference and deterministic full-hand simulation tests.
- [ ] Deeper trick-outcome search, multi-deal benchmarking, automated bot-seat orchestration and full-match simulations.
- [x] Public completed-trick history retained in round state and sanitized per-seat views.
- [ ] Online service, reconnect, chat/voice.
- [ ] Flutter UI, manager controls and end-to-end/security testing.

## Run tests
Requires Node.js 20+: `npm test`

Do not describe this module as complete until the remaining acceptance criteria are implemented and verified.
