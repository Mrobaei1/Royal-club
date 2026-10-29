export type ProgressionOutcome = 'win' | 'loss' | 'quit';

export const PROGRESSION_POINTS = {
  win: 20,
  loss: 5,
  quit: -5,
} as const;

/** XP cost to advance from the given level to the next level. */
export function pointsToNextLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError('Level must be a positive integer.');
  }
  const n = level - 1;
  return Math.round(300 + 5 * n + 0.08 * n * n);
}

/** Total cumulative XP threshold for a level; XP is never consumed on level-up. */
export function totalXpForLevel(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError('Level must be a positive integer.');
  }
  let total = 0;
  for (let current = 1; current < level; current += 1) {
    total += pointsToNextLevel(current);
  }
  return total;
}

/** Return the highest level supported by XP, with level 1 as the baseline. */
export function levelForXp(xp: number): number {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new RangeError('XP must be a non-negative safe integer.');
  }
  let level = 1;
  while (level < 100 && xp >= totalXpForLevel(level + 1)) level += 1;
  return level;
}

/** A level is permanent: losses can lower XP but never lower the stored level. */
export function nextProgressionState(
  currentXp: number,
  permanentLevel: number,
  outcome: ProgressionOutcome,
): { xp: number; level: number; delta: number } {
  if (!Number.isSafeInteger(currentXp) || currentXp < 0 ||
      !Number.isSafeInteger(permanentLevel) || permanentLevel < 1 || permanentLevel > 100) {
    throw new RangeError('Invalid progression state.');
  }
  const delta = PROGRESSION_POINTS[outcome];
  const xp = Math.max(0, currentXp + delta);
  return { xp, level: Math.max(permanentLevel, levelForXp(xp)), delta };
}
