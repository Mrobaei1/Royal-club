export type PlayerBar = { host: number; guest: number };

export function hasLegalMove(
  board: number[],
  bar: PlayerBar,
  remainingDice: number[],
  hostTurn: boolean,
): boolean {
  if (board.length !== 24 || remainingDice.length === 0) return false;
  const sign = hostTurn ? 1 : -1;
  const ownBar = hostTurn ? Number(bar.host ?? 0) : Number(bar.guest ?? 0);
  const allHome = board.every((count, point) =>
    hostTurn ? point > 5 || count <= 0 : point < 18 || count >= 0,
  );

  return remainingDice.some((die) => {
    if (!Number.isInteger(die) || die < 1 || die > 6) return false;
    if (ownBar > 0) {
      const target = hostTurn ? 24 - die : die - 1;
      return board[target] * sign > -2;
    }

    for (let from = 0; from < 24; from++) {
      if (board[from] * sign <= 0) continue;
      const target = hostTurn ? from - die : from + die;
      if (target >= 0 && target <= 23 && board[target] * sign > -2) return true;

      const overshoots = hostTurn ? target < 0 : target > 23;
      const inHome = hostTurn ? from <= 5 : from >= 18;
      const distanceToOff = hostTurn ? from + 1 : 24 - from;
      const overshootsDie = die > distanceToOff;
      const overshootClear = hostTurn
        ? !board.some((count, point) => point > from && point <= 5 && count > 0)
        : !board.some((count, point) => point < from && point >= 18 && count < 0);

      if (
        overshoots &&
        inHome &&
        allHome &&
        die >= distanceToOff &&
        (!overshootsDie || overshootClear)
      ) {
        return true;
      }
    }
    return false;
  });
}
