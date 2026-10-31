# Royal Club Hokm — Integration Contract (Design Only)

This document describes the intended adapter boundary. It does not wire anything into the production app.

## Authoritative server commands
Every command must be authenticated and scoped to a room:
- `create_room`
- `join_room`
- `leave_room`
- `set_ready`
- `start_game`
- `choose_trump`
- `play_card`
- `request_reconnect`
- `send_chat_message`

The server derives the seat from the authenticated room membership. It must never accept a client-supplied seat/team/score/hand as authoritative input. The match target (3, 5, or 7) is loaded from trusted manager-controlled configuration after role authorization; never accept this setting from a player or public room-create payload.

## Server-side validation
For each command, verify:
1. authenticated user is a member of this room;
2. room is in a phase that accepts the command;
3. caller's seat is the current seat;
4. the submitted card is present in that seat's server-held hand;
5. the move obeys follow-suit and all phase rules;
6. state transition is atomic and versioned;
7. all clients receive a public event, while each player receives only their own private hand update.

Reject stale commands using a monotonically increasing room version. Use idempotency keys for reconnect/retry-sensitive actions.

## Data separation
- Private server state: all four hands, shuffled deck, RNG seed if persisted, hidden bot state.
- Public room state: seat occupancy, ready flags, current phase/seat, trump after declaration, public plays, trick counts, public score, timer deadline.
- Per-seat payload: public state plus only that seat's own cards.
- Logs: never log full hidden hands in production telemetry.

## Room lifecycle
Use server time for invitation expiration and turn deadlines. Cleanup jobs must be idempotent. Reconnection restores a seat only after verifying the authenticated user is the original seat owner. A disconnected player may be replaced by a bot only according to a manager-configured policy and after a defined grace period.

## Royal Club compatibility
- UI adapter: Flutter/Dart.
- API adapter: existing Fastify/TypeScript API.
- Persistent records: existing PostgreSQL infrastructure; do not create a second account or wallet system.
- Social links/chat should call existing Royal Club services after their contracts are inspected.
- Voice/microphone requires explicit permission, room consent, moderation/abuse controls, and a documented provider/cost decision before implementation.
- No changes to production routes, app navigation, database schema, deployments, or APKs are part of this isolated lab.
