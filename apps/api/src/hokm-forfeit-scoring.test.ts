import test from "node:test";
import assert from "node:assert/strict";
import { awardCompletedMatch, penalizeMatchLeaver } from "./hokm/progression.js";

const four = [
  { userId: "p0", seat: 0 },
  { userId: "p1", seat: 1 },
  { userId: "p2", seat: 2 },
  { userId: "p3", seat: 3 },
];

test("a voluntary forfeit guarantees +20 XP to the opposing partnership and -5 to the leaver", () => {
  const initial = Object.fromEntries(four.map(player => [player.userId, { xp: 100, level: 1 }]));
  const awarded = awardCompletedMatch(four, 0, initial, ["p0"]);
  const final = penalizeMatchLeaver(awarded, "p0");
  assert.deepEqual(final, {
    p0: { xp: 95, level: 1 },
    p1: { xp: 120, level: 1 },
    p2: { xp: 120, level: 1 },
    p3: { xp: 120, level: 1 },
  });
});

test("an unrecovered disconnect gets only -5 XP while the opposing partnership is guaranteed +20", () => {
  const players = four.map(player => player.userId === "p0"
    ? { ...player, temporaryBot: true }
    : player);
  const initial = Object.fromEntries(four.map(player => [player.userId, { xp: 100, level: 1 }]));
  const awarded = awardCompletedMatch(players, 1, initial, ["p0"]);
  const final = penalizeMatchLeaver(awarded, "p0");
  assert.deepEqual(final, {
    p0: { xp: 95, level: 1 },
    p1: { xp: 120, level: 1 },
    p2: { xp: 105, level: 1 },
    p3: { xp: 120, level: 1 },
  });
});

test("the guaranteed forfeit award replaces rather than stacks on the ordinary +20 win award", () => {
  const initial = Object.fromEntries(four.map(player => [player.userId, { xp: 100, level: 1 }]));
  const result = awardCompletedMatch(four, 1, initial, ["p0"]);
  assert.equal(result.p1?.xp, 120);
  assert.equal(result.p3?.xp, 120);
});

test("invalid forfeit user IDs are rejected", () => {
  assert.throws(() => awardCompletedMatch(four, 0, {}, [" "]), /valid user IDs/);
});
