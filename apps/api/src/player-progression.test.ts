import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levelForXp,
  nextProgressionState,
  pointsToNextLevel,
  totalXpForLevel,
} from './player-progression.js';

test('all players start at level 1 and level-up XP is cumulative, not consumed', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(pointsToNextLevel(1), 300);
  assert.equal(totalXpForLevel(2), 300);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
});

test('the configured curve stays bounded through level 100', () => {
  assert.equal(totalXpForLevel(100), 79439);
  assert.equal(levelForXp(79438), 99);
  assert.equal(levelForXp(79439), 100);
});

test('online win and loss award 20 and 5 XP respectively', () => {
  assert.deepEqual(nextProgressionState(100, 1, 'win'), { xp: 120, level: 1, delta: 20 });
  assert.deepEqual(nextProgressionState(100, 1, 'loss'), { xp: 105, level: 1, delta: 5 });
});

test('quitting removes 5 XP but clamps XP at zero and never reduces permanent level', () => {
  assert.deepEqual(nextProgressionState(2, 1, 'quit'), { xp: 0, level: 1, delta: -5 });
  assert.deepEqual(nextProgressionState(300, 2, 'quit'), { xp: 295, level: 2, delta: -5 });
});

test('invalid progression values are rejected', () => {
  assert.throws(() => levelForXp(-1), RangeError);
  assert.throws(() => pointsToNextLevel(0), RangeError);
});
