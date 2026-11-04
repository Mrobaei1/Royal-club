# Hokm deadline scheduler operations

## What is durable

The room's authoritative JSON document stores:
- `turnDeadlineAt` for the current seven-second trump/card action.
- `players[].reconnectDeadline` for each disconnected player's grace period.
- `allDisconnectedDeadline` for the owner's twenty-second all-four-disconnected cancellation rule.

The PostgreSQL repository scans persisted room rows for elapsed deadlines. It does not rely on an in-memory timer queue, so a process restart does not erase deadline intent. The scheduler defaults to a 250ms poll interval and a batch size of 100 rooms.

## Startup sequence

1. Apply `migrations/001_hokm_rooms.sql` to the dedicated database.
2. Create the host application's node-postgres Pool.
3. Supply the host Fastify instance and its real authentication preHandler to `createHokmRuntime`.
4. Register the runtime during server bootstrap.
5. Start the runtime scheduler only after database connectivity and migrations are confirmed.
6. Stop the scheduler during graceful shutdown before closing the Pool.

The runtime intentionally does not start the scheduler as a module import side effect. The host server owns startup/shutdown ordering.

## Multi-worker behavior

Every worker may discover the same due room. Each service transition reloads the latest room version, then commits through PostgreSQL compare-and-swap. A stale worker cannot commit a second transition against an already advanced version. The scheduler catches per-room failures, reports them through `onSchedulerError`, and continues processing the remaining batch.

All-four-disconnected expiry is checked before individual reconnect takeover or the current turn timeout. This prevents bot play from continuing after the owner's twenty-second all-player grace has expired.

## Operational metrics and heartbeat

The scheduler exposes a read-only `scheduler.metrics` snapshot and accepts `onSchedulerPoll(snapshot)` in `createHokmRuntime`. The snapshot contains:
- `pollCount`, `failedPollCount`, and `skippedPollCount`.
- Cumulative `discoveredRooms`, `processedTransitions`, and `failedRooms`.
- `lastPollStartedAt`, `lastPollCompletedAt`, and `lastSuccessfulPollAt` timestamps.
- `lastErrorAt`, `lastPollDurationMs`, and `oldestOverdueMs`.
- `isRunning`, `isPolling`, `intervalMs`, and `batchSize`.

Snapshots are immutable. The host should forward them to its monitoring system and alert when the scheduler heartbeat is stale, the worker is not running, failed polls/rooms persist, oldest overdue age breaches the accepted latency budget, or database compare-and-swap conflicts rise. Callback failures are isolated and cannot stop deadline processing. A poll with any failed room is not marked as a fully successful poll.

## Monitoring required before production

Track:
- Poll duration and interval drift.
- Number of due rooms discovered, processed, and failed.
- Oldest overdue deadline age.
- PostgreSQL query latency and compare-and-swap conflicts.
- Scheduler heartbeat and last successful poll timestamp.
- Cancellation counts by reason and deadline type.

Alert on a stopped scheduler, repeated persistence failures, overdue deadlines beyond the accepted latency budget, and sustained CAS contention.

## Production gates

This document describes the isolated lab implementation, not a production deployment. Before production:
- Run migration and due-room query on a live PostgreSQL instance.
- Test two or more scheduler workers against the same database, including a process restart at each deadline type.
- Verify authenticated manager role mapping from the real Royal Club authorization layer.
- Test retries, transient DB outages, missed polls, graceful shutdown and clock synchronization.
- Define and verify the operational latency SLO; 250ms is a polling default, not a guarantee of end-to-end execution latency.
- Connect the metrics callback to host monitoring and verify heartbeat/alert delivery.

No voice/video calling, conferencing, live push-to-talk, WebRTC calling/signalling, TURN, or media relay is part of this runtime.
