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
      !Number.isFinite(kFactor) || kFactor <= 0) {
    throw new RangeError('Ratings must be non-negative integers and kFactor must be positive.');
  }

  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;
  return {
    winnerRating: Math.max(0, Math.round(winnerRating + kFactor * (1 - expectedWinner))),
    loserRating: Math.max(0, Math.round(loserRating + kFactor * (0 - expectedLoser))),
  };
}
