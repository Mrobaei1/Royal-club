import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyXpChange,
  awardCompletedMatch,
  levelForXp,
  penalizeMatchLeaver,
  totalXpForLevel,
  xpRequiredForNextLevel,
} from './hokm/progression.js';

test('Hokm progression uses the approved cumulative level curve through level 100', () => {
  assert.equal(xpRequiredForNextLevel(1), 300);
  assert.equal(totalXpForLevel(100), 79439);
  assert.equal(levelForXp(79438), 99);
  assert.equal(levelForXp(79439), 100);
});

test('completed online matches award 20 XP to winners and 5 XP to losers', () => {
  const players = [
    { userId: 'p1', seat: 0 },
    { userId: 'p2', seat: 1 },
    { userId: 'p3', seat: 2 },
    { userId: 'p4', seat: 3 },
  ];
  assert.deepEqual(awardCompletedMatch(players, 0), {
    p1: { xp: 20, level: 1 },
    p2: { xp: 5, level: 1 },
    p3: { xp: 20, level: 1 },
    p4: { xp: 5, level: 1 },
  });
});

test('leaving removes five XP but never reduces the permanent level', () => {
  assert.deepEqual(penalizeMatchLeaver({ p1: { xp: 300, level: 2 } }, 'p1'), {
    p1: { xp: 295, level: 2 },
  });
  assert.deepEqual(penalizeMatchLeaver({ p1: { xp: 2, level: 4 } }, 'p1'), {
    p1: { xp: 0, level: 4 },
  });
});

test('invalid XP changes and progression inputs fail closed', () => {
  assert.throws(() => xpRequiredForNextLevel(0), RangeError);
  assert.throws(() => levelForXp(-1), RangeError);
  assert.throws(() => applyXpChange({ xp: 0, level: 1 }, Number.NaN), TypeError);
  assert.throws(() => penalizeMatchLeaver({}, '  '), TypeError);
});
