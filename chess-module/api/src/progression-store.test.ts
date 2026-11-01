import test from "node:test";
import assert from "node:assert/strict";
import { chessAwardDeltas } from "./progression.js";

test("terminal event award shape is deterministic for transactional persistence",()=>{
  assert.deepEqual([...chessAwardDeltas({outcome:"draw",winnerId:null,loserId:null},"11","12")],[["11",5],["12",5]]);
  assert.deepEqual([...chessAwardDeltas({outcome:"resignation",winnerId:"12",loserId:"11"},"11","12")],[["12",20],["11",-5]]);
});
