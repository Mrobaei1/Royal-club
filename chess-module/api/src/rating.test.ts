import test from "node:test";
import assert from "node:assert/strict";
import { calculateEloPair, expectedScore } from "./rating.js";

test("equal ratings have equal expected scores",()=>{
  assert.equal(expectedScore(1200,1200),0.5);
});
test("decisive result transfers rating points symmetrically",()=>{
  const pair=calculateEloPair({white:1200,black:1200},"white_win");
  assert.deepEqual(pair,{white:1216,black:1184});
});
test("draw between equal ratings leaves both unchanged",()=>{
  assert.deepEqual(calculateEloPair({white:1200,black:1200},"draw"),{white:1200,black:1200});
});
test("ratings do not fall below the minimum floor",()=>{
  assert.equal(calculateEloPair({white:100,black:2500},"black_win").white,100);
});

test("expected scores are complementary across rating gaps", () => {
  for (const [left, right] of [[800, 1200], [1200, 1600], [2400, 1800], [100, 2500]]) {
    assert.ok(Math.abs(expectedScore(left, right) + expectedScore(right, left) - 1) < 1e-12);
  }
});

test("Elo updates preserve the pair total when the minimum floor is not reached", () => {
  for (const result of ["white_win", "black_win", "draw"] as const) {
    const before = 3000;
    const after = calculateEloPair({white:1600,black:1400}, result);
    assert.equal(after.white + after.black, before);
  }
});

test("Elo rejects invalid ratings and K factors", () => {
  assert.throws(() => calculateEloPair({white:99,black:1200}, "draw"));
  assert.throws(() => calculateEloPair({white:1200,black:1200}, "draw", 0));
  assert.throws(() => calculateEloPair({white:Number.NaN,black:1200}, "draw"));
});
