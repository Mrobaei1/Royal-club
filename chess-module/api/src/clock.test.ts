import test from "node:test";
import assert from "node:assert/strict";
import { defaultTimeControls, settleClock, snapshotClock, startClock } from "./clock.js";

test("approved time controls are 90 seconds, 5 minutes and 15 minutes", () => {
  assert.deepEqual(defaultTimeControls().map(x=>x.baseMs), [90_000,300_000,900_000]);
});
test("clock only decrements the active player's time and adds increment after a move", () => {
  const c = {...defaultTimeControls()[1]!, incrementMs:2_000};
  const initial = snapshotClock(c,1000);
  const running = startClock(initial,"white",1000);
  const after = settleClock(running,c,6000,true);
  assert.equal(after.whiteMs,297_000);
  assert.equal(after.blackMs,300_000);
  assert.equal(after.active,"black");
});
test("clock flags timeout and rejects backwards time", () => {
  const c=defaultTimeControls()[0]!;
  const running=startClock(snapshotClock(c,0),"black",0);
  assert.equal(settleClock(running,c,90_000,true).finished,true);
  assert.throws(()=>settleClock(running,c,-1,true),/clock_not_running/);
});


test("rejects malformed, unbounded or non-finite time controls", () => {
  const valid = defaultTimeControls()[1]!;
  for (const control of [
    {...valid, id: "rapid;DROP"},
    {...valid, baseMs: 0},
    {...valid, baseMs: 86_400_001},
    {...valid, baseMs: Number.POSITIVE_INFINITY},
    {...valid, incrementMs: -1},
    {...valid, incrementMs: 60_001},
    {...valid, enabled: "true" as unknown as boolean},
  ]) assert.throws(() => snapshotClock(control, 100), /invalid_time_control/);
});

test("rejects corrupt clock snapshots and unsafe timestamps", () => {
  const valid = snapshotClock(defaultTimeControls()[0]!, 100);
  assert.throws(() => startClock({...valid, whiteMs: -1}, "white", 100), /invalid_clock_snapshot/);
  assert.throws(() => startClock({...valid, blackMs: Number.NaN}, "white", 100), /invalid_clock_snapshot/);
  assert.throws(() => startClock({...valid, active: "white", lastStartedAt: null}, "black", 100), /invalid_clock_snapshot/);
  assert.throws(() => startClock(valid, "white", Number.POSITIVE_INFINITY), /clock_cannot_start/);
  assert.throws(() => snapshotClock(defaultTimeControls()[0]!, -1), /invalid_timestamp/);
});

test("clock settlement is deterministic at boundaries and cannot revive a finished clock", () => {
  const control = {...defaultTimeControls()[0]!, incrementMs: 500};
  const running = startClock(snapshotClock(control, 1_000), "white", 1_000);
  const justBefore = settleClock(running, control, 90_999, false);
  assert.equal(justBefore.whiteMs, 1);
  const timeout = settleClock(running, control, 91_000, true);
  assert.equal(timeout.whiteMs, 0);
  assert.equal(timeout.finished, true);
  assert.equal(timeout.active, null);
  assert.throws(() => settleClock(timeout, control, 91_001, true), /clock_not_running/);
  assert.throws(() => settleClock(running, control, 999, true), /clock_not_running/);
});

test("move increment is awarded once and only to the player who completed the move", () => {
  const control = {...defaultTimeControls()[0]!, incrementMs: 2_000};
  const running = startClock(snapshotClock(control, 10_000), "black", 10_000);
  const afterMove = settleClock(running, control, 12_500, true);
  assert.equal(afterMove.blackMs, 89_500);
  assert.equal(afterMove.whiteMs, 90_000);
  assert.equal(afterMove.active, "white");
  assert.equal(afterMove.lastStartedAt, 12_500);
});
