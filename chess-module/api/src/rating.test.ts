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

test("half-point Elo boundaries preserve exact zero-sum transfers", () => {
  const pair = calculateEloPair({white:1200,black:1200}, "white_win", 1);
  assert.deepEqual(pair, {white:1201,black:1199});
  assert.equal(pair.white + pair.black, 2400);
});

test("rating transfers remain zero-sum across outcomes and rating gaps", () => {
  for (const current of [
    {white:800,black:1200},
    {white:1200,black:800},
    {white:2400,black:1800},
    {white:1800,black:2400},
    {white:100,black:2500},
    {white:2500,black:100},
  ]) {
    for (const result of ["white_win","black_win","draw"] as const) {
      const pair = calculateEloPair(current,result);
      assert.equal(pair.white + pair.black,current.white + current.black,
        `rating total changed for ${JSON.stringify(current)} / ${result}`);
    }
  }
});
test("ratings do not fall below the minimum floor",()=>{
  assert.equal(calculateEloPair({white:100,black:2500},"black_win").white,100);
});

test("expected scores are complementary across rating gaps", () => {
  for (const [left, right] of [[800, 1200], [1200, 1600], [2400, 1800], [100, 2500]] as const) {
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

test("ratings remain inside the PostgreSQL integer range",()=>{
  const maximum = 2_147_483_647;
  assert.equal(calculateEloPair({white:maximum,black:1200},"white_win").white,maximum);
  assert.throws(() => calculateEloPair({white:maximum+1,black:1200},"draw"));
  assert.throws(() => calculateEloPair({white:Number.MAX_SAFE_INTEGER+1,black:1200},"draw"));
});

test("Elo transfers are exactly zero-sum at half-point rounding boundaries", () => {
  const pair = calculateEloPair({ white: 1200, black: 1200 }, "white_win", 1);
  assert.deepEqual(pair, { white: 1201, black: 1199 });
  assert.equal(pair.white + pair.black, 2400);
});

test("Elo transfers preserve total rating at both integer boundaries", () => {
  const maximum = 2_147_483_647;
  for (const result of ["white_win", "black_win", "draw"] as const) {
    const pair = calculateEloPair({ white: 100, black: maximum }, result);
    assert.equal(pair.white + pair.black, 100 + maximum);
    assert.ok(pair.white >= 100 && pair.white <= maximum);
    assert.ok(pair.black >= 100 && pair.black <= maximum);
  }
});
