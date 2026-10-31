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
