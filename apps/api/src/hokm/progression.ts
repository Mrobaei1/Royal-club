export type PlayerProgress = { xp: number; level: number };
export type PlayerProgressMap = Record<string, PlayerProgress | undefined>;
export type ProgressPlayer = { seat: number; userId: string };

export function xpRequiredForNextLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be a positive integer");
  const n = level - 1;
  return Math.round(300 + 5 * n + 0.08 * n * n);
}

export function totalXpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be a positive integer");
  let total = 0;
  for (let current = 1; current < level; current += 1) total += xpRequiredForNextLevel(current);
  return total;
}

export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError("xp must be non-negative");

  // Accumulate each level threshold once. Recomputing totalXpForLevel(level + 1)
  // inside the loop made large XP values quadratic in the resulting level.
  let level = 1;
  let threshold = 0;
  while (true) {
    const nextThreshold = threshold + xpRequiredForNextLevel(level);
    if (xp < nextThreshold) return level;
    threshold = nextThreshold;
    level += 1;
  }
}

export function applyXpChange(
  progress: Partial<PlayerProgress> | null | undefined = { xp: 0, level: 1 },
  delta: number,
): PlayerProgress {
  if (!Number.isFinite(delta)) throw new TypeError("XP delta must be finite");
  const currentXp = Number.isFinite(progress?.xp) ? progress.xp! : 0;
  const xp = Math.max(0, currentXp + delta);
  const candidateLevel = progress?.level;
  const oldLevel = Number.isInteger(candidateLevel) && candidateLevel! > 0 ? candidateLevel! : 1;
  return { xp, level: Math.max(oldLevel, levelForXp(xp)) };
}

export function awardCompletedMatch(
  players: readonly ProgressPlayer[],
  winningTeam: 0 | 1,
  current: PlayerProgressMap = {},
): PlayerProgressMap {
  if (!Array.isArray(players) || players.length !== 4) throw new TypeError("Four players required");
  if (winningTeam !== 0 && winningTeam !== 1) throw new RangeError("Invalid winning team");
  const result: PlayerProgressMap = { ...current };
  for (const player of players) {
    const team = player.seat % 2 === 0 ? 0 : 1;
    result[player.userId] = applyXpChange(result[player.userId], team === winningTeam ? 20 : 5);
  }
  return result;
}

export function penalizeMatchLeaver(
  current: PlayerProgressMap,
  userId: string,
): PlayerProgressMap {
  if (typeof userId !== "string" || !userId.trim()) throw new TypeError("userId required");
  return { ...current, [userId]: applyXpChange(current[userId], -5) };
}
