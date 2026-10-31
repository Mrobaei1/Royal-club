export function xpRequiredForNextLevel(level) {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be a positive integer");
  const n = level - 1;
  return Math.round(300 + 5 * n + 0.08 * n * n);
}
export function totalXpForLevel(level) {
  if (!Number.isInteger(level) || level < 1) throw new RangeError("level must be a positive integer");
  let total = 0;
  for (let current = 1; current < level; current += 1) total += xpRequiredForNextLevel(current);
  return total;
}
export function levelForXp(xp) {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError("xp must be non-negative");
  let level = 1;
  while (xp >= totalXpForLevel(level + 1)) level += 1;
  return level;
}
export function applyXpChange(progress = { xp: 0, level: 1 }, delta) {
  if (!Number.isFinite(delta)) throw new TypeError("XP delta must be finite");
  const xp = Math.max(0, (Number.isFinite(progress?.xp) ? progress.xp : 0) + delta);
  const oldLevel = Number.isInteger(progress?.level) && progress.level > 0 ? progress.level : 1;
  return { xp, level: Math.max(oldLevel, levelForXp(xp)) };
}
export function awardCompletedMatch(players, winningTeam, current = {}) {
  if (!Array.isArray(players) || players.length !== 4) throw new TypeError("Four players required");
  if (winningTeam !== 0 && winningTeam !== 1) throw new RangeError("Invalid winning team");
  const result = { ...current };
  for (const player of players) {
    const team = player.seat % 2 === 0 ? 0 : 1;
    result[player.userId] = applyXpChange(result[player.userId], team === winningTeam ? 20 : 5);
  }
  return result;
}
export function penalizeMatchLeaver(current, userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new TypeError("userId required");
  return { ...current, [userId]: applyXpChange(current[userId], -5) };
}
