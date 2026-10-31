# Royal Club — Standalone Hokm Lab

**Isolation guarantee:** this folder exists only on branch `research/hokm-standalone`. Nothing here is merged into `main`, wired into the production app, or deployed. Do not merge without the owner's explicit instruction.

## Purpose
Build and verify an independent, Royal Club-compatible Hokm/Court Piece game module before any integration. The intended integration boundary is a pure game engine (TypeScript/JavaScript contract), an authoritative Fastify-compatible server adapter, and a Flutter UI adapter. The first milestone is only the rules-engine foundation; this is not yet a complete or production-ready game.

## Research references
- `aliostad/hokm` — MIT-licensed C# implementation with separate game/server/test projects; use as a rules and test-structure reference, not as code copied blindly.
- `shayanmohd/Turup-Chaal` — MIT-licensed Unity/C# project describing authoritative play and hidden-state redaction; use as an architecture/security reference.
- `matin-as/Online-hokm-game` — CC0-1.0 repository; candidate for feature-flow study, subject to checking third-party assets/dependencies.
- `SAY4s/peryGame` — no repository license detected in GitHub metadata; do not copy its code or assets unless licensing is clarified. Treat as behavior/UI reference only.

No source code or assets from these projects are copied into this lab. This implementation is an independent compatibility-oriented design based on game rules and the documented requirements.

## Requirements and planned modules
1. Rules engine: deck, dealing, legal follow-suit validation, trick resolution, team score, round/match state.
2. Deterministic tests: legal/illegal play, trump and led-suit comparison, tie handling, scoring, complete-hand invariants, randomized/property-style checks.
3. AI: easy/medium/hard bots; all moves still pass the same rules validator.
4. Online session: 4 seats, private invitations, ready/start flow, authoritative server state, reconnect, timeouts, stale-room cleanup.
5. Security: each client receives only its own hand and public state; never trust client-provided cards, score, seat, or turn; validate every command on server.
6. UX adapter: Flutter-friendly state/events, Persian/English labels, responsive table, chat and optional microphone feature gated by permissions.
7. QA: unit, integration, randomized, reconnect, concurrency and information-leak tests.

## Current status
- [x] Dedicated isolated branch created.
- [x] Initial independent rules-engine package and tests drafted.
- [ ] Tests executed in a real Node.js environment.
- [ ] Full dealing / hakem selection / 13-trick round state machine.
- [ ] AI, online room service, reconnection, chat/voice integration.
- [ ] Flutter UI and accessibility/localization.
- [ ] Security review and end-to-end tests.

Do not describe this module as bug-free or complete until all relevant tests have been run and the remaining checklist has been closed with evidence.

## Run tests
Requires Node.js 20+:
```sh
npm test
```

## Rule assumptions to confirm before production
This initial engine uses four seats in clockwise order, teams (0,2) and (1,3), rank order 2 through Ace, and the standard follow-suit rule. Regional rules for selecting the hakem, redeal/penalty cases, capot scoring, and match target must be confirmed before the round controller is finalized.
