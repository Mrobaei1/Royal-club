import test from "node:test";
import assert from "node:assert/strict";
import { xpRequiredForNextLevel, totalXpForLevel, levelForXp, applyXpChange, awardCompletedMatch, penalizeMatchLeaver } from "../src/progression.js";

test("95,000 XP is level 109 under the approved progression curve", () => {
  assert.equal(xpRequiredForNextLevel(1), 300);
  assert.equal(xpRequiredForNextLevel(2), 305);
  assert.equal(totalXpForLevel(100), 79439);
  assert.equal(levelForXp(79439), 100);
  assert.equal(levelForXp(94417), 109);
  assert.equal(levelForXp(95000), 109);
  assert.equal(levelForXp(96190), 110);
});

test("XP never falls below zero and level never decreases", () => {
  assert.deepEqual(applyXpChange({xp:2,level:1},-5),{xp:0,level:1});
  assert.deepEqual(applyXpChange({xp:95000,level:109},-5),{xp:94995,level:109});
});

test("completed match awards +20 to winners and +5 to losing players", () => {
  const players=[{userId:"u0",seat:0},{userId:"u1",seat:1},{userId:"u2",seat:2},{userId:"u3",seat:3}];
  assert.deepEqual(awardCompletedMatch(players,0,{}),{
    u0:{xp:20,level:1},u1:{xp:5,level:1},u2:{xp:20,level:1},u3:{xp:5,level:1}
  });
});

test("only the player who leaves receives the -5 XP penalty", () => {
  const current={u0:{xp:100,level:1},u1:{xp:100,level:1}};
  assert.deepEqual(penalizeMatchLeaver(current,"u0"),{
    u0:{xp:95,level:1},u1:{xp:100,level:1}
  });
});

test("large XP level lookup remains linear and respects exact level boundaries", () => {
  const threshold = totalXpForLevel(200000);
  assert.equal(levelForXp(threshold - 1), 199999);
  assert.equal(levelForXp(threshold), 200000);
  assert.equal(levelForXp(threshold + xpRequiredForNextLevel(200000) - 1), 200000);
  assert.equal(levelForXp(threshold + xpRequiredForNextLevel(200000)), 200001);
});

test("level lookup rejects negative and non-finite XP", () => {
  assert.throws(() => levelForXp(-1), RangeError);
  assert.throws(() => levelForXp(Number.NaN), RangeError);
  assert.throws(() => levelForXp(Number.POSITIVE_INFINITY), RangeError);
});
