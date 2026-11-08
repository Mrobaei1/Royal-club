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
  // Calculate one transfer and apply its exact inverse. Independently rounding
  // both players can create or destroy one Elo point at half-point boundaries.
  // Constrain the transfer so both ratings remain valid PostgreSQL integers.
  const requestedDelta = Math.round(kFactor * (whiteScore - expectedScore(current.white, current.black)));
  const minimumDelta = Math.max(MIN_RATING - current.white, current.black - MAX_RATING);
  const maximumDelta = Math.min(MAX_RATING - current.white, current.black - MIN_RATING);
  const delta = Math.min(maximumDelta, Math.max(minimumDelta, requestedDelta));
  return { white: current.white + delta, black: current.black - delta };
}
