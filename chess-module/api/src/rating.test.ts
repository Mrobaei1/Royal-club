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
