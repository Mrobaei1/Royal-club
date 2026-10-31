export type ChessOutcome = "win" | "loss" | "draw" | "resignation";
export type ChessResult = {
  winnerId: string | null;
  loserId: string | null;
  outcome: "win" | "draw" | "resignation";
};
export type Progression = { level: number; xp: number };

export function levelUpCost(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be a positive integer");
  return Math.round(300 + 5 * (level - 1) + 0.08 * (level - 1) ** 2);
}

export function nextProgression(current: Progression, delta: number): Progression {
  if (!Number.isInteger(current.level) || current.level < 1 || !Number.isInteger(current.xp) || current.xp < 0 || !Number.isInteger(delta)) {
    throw new RangeError("invalid progression values");
  }
  const xp = Math.max(0, current.xp + delta);
  let level = 1;
  let cumulativeThreshold = 0;
  while (xp >= cumulativeThreshold + levelUpCost(level)) {
    cumulativeThreshold += levelUpCost(level);
    level += 1;
  }
  // XP is a lifetime total: thresholds accumulate and are never deducted.
  // Stored level is permanent even if a later penalty reduces XP.
  return { level: Math.max(current.level, level), xp };
}

export function chessAwardDeltas(result: ChessResult, whiteId: string, blackId: string): Map<string, number> {
  if (!whiteId || !blackId || whiteId === blackId) throw new Error("two distinct player IDs are required");
  if (result.outcome === "draw") {
    if (result.winnerId !== null || result.loserId !== null) throw new Error("draw cannot have winner or loser");
    return new Map([[whiteId, 5], [blackId, 5]]);
  }
  if (!result.winnerId || !result.loserId || result.winnerId === result.loserId) throw new Error("decisive result requires distinct winner and loser");
  if (![whiteId, blackId].includes(result.winnerId) || ![whiteId, blackId].includes(result.loserId)) throw new Error("result players do not match game participants");
  if (result.outcome === "resignation") return new Map([[result.winnerId, 20], [result.loserId, -5]]);
  return new Map([[result.winnerId, 20], [result.loserId, 5]]);
}
