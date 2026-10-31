import test from "node:test";
import assert from "node:assert/strict";
import { chessAwardDeltas, levelUpCost, nextProgression } from "./progression.js";

test("level cost curve matches approved thresholds", () => {
  assert.deepEqual([1,2,3,4,5].map(levelUpCost), [300,305,310,316,321]);
});
test("XP is cumulative and level advances without spending XP", () => {
  assert.deepEqual(nextProgression({level:1,xp:295}, 20), {level:2,xp:315});
});
test("XP loss clamps at zero and never lowers stored level", () => {
  assert.deepEqual(nextProgression({level:4,xp:2}, -5), {level:4,xp:0});
});
test("ordinary win awards +20 and +5", () => {
  assert.deepEqual([...chessAwardDeltas({outcome:"win",winnerId:"w",loserId:"b"}, "w","b")], [["w",20],["b",5]]);
});
test("draw awards +5 to both players", () => {
  assert.deepEqual([...chessAwardDeltas({outcome:"draw",winnerId:null,loserId:null}, "w","b")], [["w",5],["b",5]]);
});
test("resignation awards opponent +20 and resigning player -5", () => {
  assert.deepEqual([...chessAwardDeltas({outcome:"resignation",winnerId:"b",loserId:"w"}, "w","b")], [["b",20],["w",-5]]);
});
test("rejects invalid participant/result combinations", () => {
  assert.throws(() => chessAwardDeltas({outcome:"win",winnerId:"outsider",loserId:"b"}, "w","b"));
  assert.throws(() => levelUpCost(0));
});
