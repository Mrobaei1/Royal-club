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
test('rating changes are zero-sum across representative rating gaps', () => {
  const cases = [
    [1000, 1000], [1000, 1400], [1400, 1000],
    [2200, 800], [800, 2200], [999, 1001], [2500, 2500],
  ] as const;

  for (const [winnerBefore, loserBefore] of cases) {
    const result = calculateEloRatings(winnerBefore, loserBefore);
    assert.equal(result.winnerRating + result.loserRating, winnerBefore + loserBefore,
      `Expected zero-sum rating transfer for ${winnerBefore} vs ${loserBefore}`);
    assert.ok(result.winnerRating >= winnerBefore, 'Winner rating must not decrease.');
    assert.ok(result.loserRating <= loserBefore, 'Loser rating must not increase.');
    assert.ok(result.loserRating >= 0, 'Ratings must not become negative.');
  }
});

test('rating update is symmetric when player order and result are reversed', () => {
  const firstWins = calculateEloRatings(1100, 1300);
  const secondWins = calculateEloRatings(1300, 1100);
  assert.equal(firstWins.winnerRating - 1100, 1300 - secondWins.loserRating);
  assert.equal(1300 - firstWins.loserRating, secondWins.winnerRating - 1100);
});
