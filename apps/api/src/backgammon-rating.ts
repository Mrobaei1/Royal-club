export type EloRatingUpdate = {
  winnerRating: number;
  loserRating: number;
};

const DEFAULT_K_FACTOR = 32;

/** Calculate a zero-sum Elo update for one decisive backgammon result. */
export function calculateEloRatings(
  winnerRating: number,
  loserRating: number,
  kFactor = DEFAULT_K_FACTOR,
): EloRatingUpdate {
  if (!Number.isSafeInteger(winnerRating) || winnerRating < 0 ||
      !Number.isSafeInteger(loserRating) || loserRating < 0 ||
      !Number.isSafeInteger(kFactor) || kFactor <= 0) {
    throw new RangeError('Ratings and kFactor must be non-negative safe integers; kFactor must be positive.');
  }

  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  // Use one shared transfer amount for both players. Capping the transfer at
  // the loser's available rating preserves zero-sum accounting at the floor.
  const requestedTransfer = Math.round(kFactor * (1 - expectedWinner));
  const transfer = Math.min(loserRating, requestedTransfer);
  const nextWinnerRating = winnerRating + transfer;
  if (!Number.isSafeInteger(nextWinnerRating)) {
    throw new RangeError('Calculated rating exceeds the safe integer range.');
  }

  return {
    winnerRating: nextWinnerRating,
    loserRating: loserRating - transfer,
  };
}
