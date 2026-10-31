export type EloResult = "white_win" | "black_win" | "draw";
export type EloPair = { white: number; black: number };

export function expectedScore(rating: number, opponent: number): number {
  if (!Number.isFinite(rating) || !Number.isFinite(opponent)) throw new RangeError("invalid_rating");
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}
export function calculateEloPair(current: EloPair, result: EloResult, kFactor = 32): EloPair {
  if (!Number.isInteger(current.white) || !Number.isInteger(current.black) ||
      current.white < 100 || current.black < 100 || !Number.isInteger(kFactor) || kFactor < 1) {
    throw new RangeError("invalid_elo_input");
  }
  const whiteScore = result === "white_win" ? 1 : result === "black_win" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;
  return {
    white: Math.max(100, current.white + Math.round(kFactor * (whiteScore - expectedScore(current.white, current.black)))),
    black: Math.max(100, current.black + Math.round(kFactor * (blackScore - expectedScore(current.black, current.white))))
  };
}
