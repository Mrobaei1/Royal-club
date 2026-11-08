import test from "node:test";
import assert from "node:assert/strict";
import { HokmDeadlineScheduler } from "./hokm/deadline-scheduler.js";

test("expected multi-worker CAS contention is counted as skipped, not as an operational failure", async () => {
  const errors: unknown[] = [];
  const scheduler = new HokmDeadlineScheduler({
    repository: { async listDueRooms() { return [{ roomId: "shared-room", turnDeadlineAt: 900 }]; } },
    service: { async processDueDeadlines() { throw new Error("Concurrent room update; retry with the latest version"); } },
    now: () => 1_000,
    onError(error) { errors.push(error); },
  });
  const result = await scheduler.pollOnce();
  assert.deepEqual(result, { skipped: false, discovered: 1, processed: 0, failed: 0 });
  assert.equal(scheduler.metrics.skippedPollCount, 1);
  assert.equal(scheduler.metrics.failedRooms, 0);
  assert.equal(errors.length, 0);
});

test("unexpected deadline processing failures remain visible to monitoring", async () => {
  const errors = [];
  const scheduler = new HokmDeadlineScheduler({
    repository: { async listDueRooms() { return [{ roomId: "broken-room", turnDeadlineAt: 900 }]; } },
    service: { async processDueDeadlines() { throw new Error("database unavailable"); } },
    now: () => 1_000,
    onError(error, context) { errors.push({ message: error.message, context }); },
  });
  const result = await scheduler.pollOnce();
  assert.deepEqual(result, { skipped: false, discovered: 1, processed: 0, failed: 1 });
  assert.equal(scheduler.metrics.failedRooms, 1);
  assert.deepEqual(errors, [{ message: "database unavailable", context: { roomId: "broken-room" } }]);
});
