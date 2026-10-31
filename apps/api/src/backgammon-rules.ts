export type PlayerBar = { host: number; guest: number };
export type PlayerOff = { host: number; guest: number };
export type BackgammonMove = { from: number | null; to: number | null; die: number };
export type MutableGameState = { board: number[]; bar: PlayerBar; off: PlayerOff };

// Host checkers move toward point 0; guest checkers move toward point 23.
export const INITIAL_BACKGAMMON_BOARD: number[] = [-2,0,0,0,0,5,0,3,0,0,0,-5,5,0,0,0,-3,0,-5,0,0,0,0,2];
export type MoveResult = { state: MutableGameState } | { error: string };

/**
 * Reject malformed state before doing any arithmetic. Game state normally comes
 * from the database, but defensive checks keep corrupted/stale state from
 * producing legal-looking moves or negative bar/off counts.
 */
function isValidGameState(state: MutableGameState): boolean {
  if (!state || !Array.isArray(state.board) || state.board.length !== 24) return false;
  for (let point = 0; point < state.board.length; point++) {
    const count = state.board[point];
    if (!Number.isInteger(count) || Math.abs(count) > 15) return false;
  }
  if (!state.bar || !state.off) return false;
  if (![state.bar.host, state.bar.guest, state.off.host, state.off.guest]
    .every((count) => Number.isInteger(count) && count >= 0 && count <= 15)) return false;

  // Validate each player's complete checker inventory, not just individual
  // points. A legal game can never contain more than 15 checkers per player.
  const hostOnBoard = state.board.reduce((sum, count) => sum + Math.max(count, 0), 0);
  const guestOnBoard = state.board.reduce((sum, count) => sum + Math.max(-count, 0), 0);
  // Every game always owns exactly fifteen checkers per player. Missing
  // checkers are just as corrupt as duplicated ones.
  return hostOnBoard + state.bar.host + state.off.host === 15 &&
    guestOnBoard + state.bar.guest + state.off.guest === 15;
}

function isValidRemainingDice(remainingDice: number[]): boolean {
  if (!Array.isArray(remainingDice) || remainingDice.length === 0 || remainingDice.length > 4) return false;
  for (let index = 0; index < remainingDice.length; index++) {
    const die = remainingDice[index];
    if (!Number.isInteger(die) || die < 1 || die > 6) return false;
  }
  // Three or four remaining dice can only be the remainder of a doubles roll.
  if (remainingDice.length > 2 && !remainingDice.every((die) => die === remainingDice[0])) return false;
  return true;
}

export function applyBackgammonMove(
  current: MutableGameState,
  move: BackgammonMove,
  hostTurn: boolean,
): MoveResult {
  if (!isValidGameState(current)) return { error: 'Invalid board state.' };
  if (!move || typeof move !== 'object') return { error: 'Invalid move format.' };
  const { from, to, die } = move;
  if (!Number.isInteger(die) || die < 1 || die > 6 ||
      (from !== null && (!Number.isInteger(from) || from < 0 || from > 23)) ||
      (to !== null && (!Number.isInteger(to) || to < 0 || to > 23)) ||
      (from === null && to === null)) return { error: 'Invalid move format.' };

  const board = [...current.board];
  const bar = { host: current.bar.host, guest: current.bar.guest };
  const off = { host: current.off.host, guest: current.off.guest };
  const sign = hostTurn ? 1 : -1;
  const own = hostTurn ? 'host' : 'guest';
  const other = hostTurn ? 'guest' : 'host';
  let target = -1;

  if (bar[own] > 0) {
    if (from !== null || to === null) return { error: 'A checker on the bar must enter before other checkers can move.' };
    target = hostTurn ? 24 - die : die - 1;
    if (to !== target) return { error: 'Invalid bar-entry point for that die.' };
    if (board[target] * sign <= -2) return { error: 'That entry point is blocked by the opponent.' };
    bar[own] -= 1;
    if (board[target] * sign < 0) {
      board[target] = 0;
      bar[other] += 1;
    }
    board[target] += sign;
    return { state: { board, bar, off } };
  }

  if (from === null) return { error: 'No checker is available on the bar.' };
  if (board[from] * sign <= 0) return { error: 'Select one of your own checkers.' };

  const rawTarget = hostTurn ? from - die : from + die;
  if (to === null) {
    const inHome = hostTurn ? from <= 5 : from >= 18;
    const allHome = board.every((count, point) => hostTurn
      ? point <= 5 || count <= 0
      : point >= 18 || count >= 0);
    const overshootClear = hostTurn
      ? !board.some((count, point) => point > from && point <= 5 && count > 0)
      : !board.some((count, point) => point < from && point >= 18 && count < 0);
    const distanceToOff = hostTurn ? from + 1 : 24 - from;
    if (!inHome || !allHome || die < distanceToOff ||
        (die > distanceToOff && !overshootClear)) {
      return { error: 'That checker cannot bear off with this die.' };
    }
    board[from] -= sign;
    off[own] += 1;
    return { state: { board, bar, off } };
  }

  if (rawTarget < 0 || rawTarget > 23 || to !== rawTarget) {
    return { error: 'Move distance does not match the selected die.' };
  }
  target = rawTarget;
  if (board[target] * sign <= -2) return { error: 'That point is blocked by the opponent.' };
  board[from] -= sign;
  if (board[target] * sign < 0) {
    board[target] = 0;
    bar[other] += 1;
  }
  board[target] += sign;
  return { state: { board, bar, off } };
}

export function hasLegalMove(
  board: number[],
  bar: PlayerBar,
  remainingDice: number[],
  hostTurn: boolean,
  off?: PlayerOff,
): boolean {
  if (!Array.isArray(board) || board.length !== 24 || !bar ||
      !board.every((count) => Number.isInteger(count) && Math.abs(count) <= 15) ||
      ![bar.host, bar.guest].every((count) => Number.isInteger(count) && count >= 0 && count <= 15) ||
      !isValidRemainingDice(remainingDice)) return false;
  const inferredOff = off ?? {
    host: 15 - board.reduce((sum, count) => sum + Math.max(count, 0), 0) - bar.host,
    guest: 15 - board.reduce((sum, count) => sum + Math.max(-count, 0), 0) - bar.guest,
  };
  if (!isValidGameState({ board, bar, off: inferredOff })) return false;
  const sign = hostTurn ? 1 : -1;
  const ownBar = hostTurn ? bar.host : bar.guest;
  const allHome = board.every((count, point) =>
    hostTurn ? point <= 5 || count <= 0 : point >= 18 || count >= 0,
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

      if (overshoots && inHome && allHome && die >= distanceToOff && (!overshootsDie || overshootClear)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * If a lower die would consume the only route that lets the higher die be played,
 * the higher die must be played first under the standard two-dice rule.
 */
export function mustPlayHigherDie(
  state: MutableGameState,
  remainingDice: number[],
  selectedMove: BackgammonMove,
  hostTurn: boolean,
): boolean {
  if (!isValidGameState(state) || !isValidRemainingDice(remainingDice) ||
      remainingDice.length !== 2 || !selectedMove || typeof selectedMove !== 'object' ||
      remainingDice[0] === remainingDice[1]) return false;
  const higher = Math.max(...remainingDice);
  const lower = Math.min(...remainingDice);
  if (selectedMove.die !== lower) return false;
  if (!hasLegalMove(state.board, state.bar, [higher], hostTurn, state.off)) return false;
  if (maxPlayableDiceCount(state, remainingDice, hostTurn) === 1) return true;
  const afterLower = applyBackgammonMove(state, selectedMove, hostTurn);
  if ('error' in afterLower) return false;
  return !hasLegalMove(afterLower.state.board, afterLower.state.bar, [higher], hostTurn);
}

/** Returns the greatest number of remaining dice that can legally be played. */
export function maxPlayableDiceCount(
  state: MutableGameState,
  remainingDice: number[],
  hostTurn: boolean,
): number {
  if (!isValidGameState(state) || !isValidRemainingDice(remainingDice)) return 0;
  const sign = hostTurn ? 1 : -1;
  const ownBar = hostTurn ? 'host' : 'guest';
  const candidates: BackgammonMove[] = [];

  for (let dieIndex = 0; dieIndex < remainingDice.length; dieIndex++) {
    const die = remainingDice[dieIndex];
    if (!Number.isInteger(die) || die < 1 || die > 6) continue;
    if (state.bar[ownBar] > 0) {
      const to = hostTurn ? 24 - die : die - 1;
      if (state.board[to] * sign > -2) candidates.push({ from: null, to, die });
      continue;
    }

    for (let from = 0; from < 24; from++) {
      if (state.board[from] * sign <= 0) continue;
      const rawTo = hostTurn ? from - die : from + die;
      if (rawTo >= 0 && rawTo < 24 && state.board[rawTo] * sign > -2) {
        candidates.push({ from, to: rawTo, die });
      } else if (rawTo < 0 || rawTo >= 24) {
        candidates.push({ from, to: null, die });
      }
    }
  }

  let best = 0;
  for (const move of candidates) {
    const applied = applyBackgammonMove(state, move, hostTurn);
    if ('error' in applied) continue;
    const remaining = [...remainingDice];
    const usedIndex = remaining.indexOf(move.die);
    if (usedIndex < 0) continue;
    remaining.splice(usedIndex, 1);
    best = Math.max(best, 1 + maxPlayableDiceCount(applied.state, remaining, hostTurn));
    if (best === remainingDice.length) return best;
  }
  return best;
}
