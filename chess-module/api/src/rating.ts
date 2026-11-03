export type EloResult = "white_win" | "black_win" | "draw";
export type EloPair = { white: number; black: number };

const MIN_RATING = 100;
const MAX_RATING = 2_147_483_647;

export function expectedScore(rating: number, opponent: number): number {
  if (!Number.isFinite(rating) || !Number.isFinite(opponent)) throw new RangeError("invalid_rating");
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}
export function calculateEloPair(current: EloPair, result: EloResult, kFactor = 32): EloPair {
  if (!Number.isSafeInteger(current.white) || !Number.isSafeInteger(current.black) ||
      current.white < MIN_RATING || current.black < MIN_RATING ||
      current.white > MAX_RATING || current.black > MAX_RATING ||
      !Number.isSafeInteger(kFactor) || kFactor < 1) {
    throw new RangeError("invalid_elo_input");
  }
  const whiteScore = result === "white_win" ? 1 : result === "black_win" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;
  return {
    white: Math.min(MAX_RATING, Math.max(MIN_RATING, current.white + Math.round(kFactor * (whiteScore - expectedScore(current.white, current.black))))),
    black: Math.min(MAX_RATING, Math.max(MIN_RATING, current.black + Math.round(kFactor * (blackScore - expectedScore(current.black, current.white)))))
  };
}
