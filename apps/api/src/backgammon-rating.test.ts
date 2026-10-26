import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEloRatings } from './backgammon-rating.js';

test('equal ratings change by 16 points after a decisive result', () => {
  assert.deepEqual(calculateEloRatings(1000, 1000), {
    winnerRating: 1016,
    loserRating: 984,
  });
});

test('an underdog gains more rating points for an upset win', () => {
  const upset = calculateEloRatings(1000, 1400);
  const favoriteWin = calculateEloRatings(1400, 1000);
  assert.ok(upset.winnerRating - 1000 > favoriteWin.winnerRating - 1400);
  assert.ok(1400 - upset.loserRating > 1000 - favoriteWin.loserRating);
});

test('rejects invalid ratings and k-factors', () => {
  assert.throws(() => calculateEloRatings(-1, 1000), RangeError);
  assert.throws(() => calculateEloRatings(1000, 1000, 0), RangeError);
});
