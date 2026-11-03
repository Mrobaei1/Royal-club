# UNO distributed-room architecture decision record

Status: proposed; implementation is not enabled  
Date: 2026-11-03  
Scope: future multi-instance UNO service

## Current safety boundary

The service stores authoritative room state in process memory and periodically persists a whole-room snapshot to PostgreSQL. Until every room mutation is serialized against shared durable state, only one service instance may run. The session-level PostgreSQL advisory lock in `src/server.ts` is a fail-fast safety guard. Do not remove it as a deployment shortcut.

## Required invariants

1. A room mutation is atomic: either the complete action and its resulting snapshot commit, or neither does.
2. At most one command mutates a given room at a time, including commands arriving through different service instances.
3. The authenticated user identity is derived from the verified Royal Club token and database profile, never from client payload fields.
4. A player receives only their own hand and private turn metadata. Public room/game events contain no hands or drawn-card identifiers.
5. Reconnect, disconnect, host transfer, room cleanup and match scoring use the same serialization boundary as game actions.
6. A committed action is broadcast only after its database transaction commits.
7. Duplicate/retried client commands must not apply twice; use a client-generated command id with a durable uniqueness constraint and return the stored result for a replay.
8. Expired rooms may be removed only under a locked transaction and only when the existing lifecycle policy says they are eligible.

## Target persistence model

Replace the single mutable whole-service snapshot with normalized durable records:

- `uno_rooms`: room id/code, host, status, match target, counters, timestamps, revision.
- `uno_room_players`: room/player membership, username snapshot, ready/connected state, seat order.
- `uno_games`: current game state per room, serialized with a versioned schema and revision.
- `uno_commands`: room id, command id, actor id, resulting revision, response payload, created timestamp; unique(room_id, command_id).
- Optional `uno_room_events`: append-only audit/event stream for recovery and operational diagnosis.

Keep card hands in the protected game-state record. Never expose raw persisted state to public socket rooms.

## Mutation protocol

For every state-changing command:

1. Verify the Royal Club token and resolve the current public profile.
2. Begin a PostgreSQL transaction.
3. Acquire a per-room transaction lock (for example, `SELECT ... FOR UPDATE` on `uno_rooms`; advisory transaction locks are an alternative where room rows do not yet exist).
4. Check command idempotency. If already committed, return its saved response without reapplying.
5. Load the latest room/game/player rows and validate the expected revision.
6. Apply the existing pure UNO rules engine to a cloned state.
7. Persist the complete new state and increment the room revision.
8. Insert the command result and commit.
9. Only after commit, publish public state and per-player private hands to the shared Socket.IO room.

Do not hold a database transaction open while waiting for a socket acknowledgement or a remote service.

## Socket.IO requirements

Use a PostgreSQL-compatible shared Socket.IO adapter (or another explicitly approved shared adapter) so room broadcasts reach sockets connected to every replica. Keep user-to-socket membership and per-user chat rate limits in a shared store or enforce them at a trusted gateway. Local Maps are not sufficient across replicas.

## Migration and rollout sequence

1. Add versioned schema and repository interfaces without changing the current single-instance runtime.
2. Add transaction/locking/idempotency tests against PostgreSQL using two independent database clients.
3. Add a two-server integration test proving that simultaneous commands against one room produce one linear history and no lost update.
4. Add cross-replica private-hand and room-broadcast tests.
5. Add crash/restart tests around commit-before-broadcast and broadcast-after-commit.
6. Run a shadow/read-only comparison against the existing engine snapshots; do not dual-write authoritative state.
7. Enable the shared adapter and transactional repository behind an explicit configuration gate.
8. Only after all acceptance tests pass, replace the single-instance guard with a deployment-mode guard that requires the shared adapter and transactional persistence.
9. Load-test 2, 6 and many concurrent rooms, reconnect storms, chat rate limits and database contention.
10. Obtain owner approval before production migration, multi-instance deployment or any release build.

## Acceptance criteria

- Two or more service instances can process different rooms concurrently.
- Two simultaneous commands for the same room are serialized; the final revision increments once per accepted command.
- Replaying a command id does not mutate state twice.
- A process crash after commit but before broadcast is recoverable by reconnect/state fetch.
- A process crash before commit leaves no partial mutation.
- Private hands and private turn state never leak across users or replicas.
- Reconnect, host transfer, cleanup and match scoring remain correct under concurrent load.
- Existing engine, room-manager, socket, PostgreSQL and Flutter suites remain green.
- The single-instance guard remains enabled until every criterion above is proven.

## Explicit non-goals

This design does not authorize production schema changes, deployment, additional paid services, live voice/video, WebRTC/TURN, root-app integration, PR merge or APK generation. Those remain separate owner-approval gates.
