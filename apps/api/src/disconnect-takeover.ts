import {
  applyBackgammonMove,
  mustPlayHigherDie,
  type BackgammonMove,
  type MutableGameState,
} from './backgammon-rules.js';

export type TemporaryAiTurn = {
  moves: BackgammonMove[];
  state: MutableGameState;
  remainingDice: number[];
};

function candidateMoves(
  state: MutableGameState,
  remainingDice: number[],
  hostTurn: boolean,
): BackgammonMove[] {
  const moves: BackgammonMove[] = [];
  const ownBar = hostTurn ? state.bar.host : state.bar.guest;
  const dice = [...new Set(remainingDice)];

  for (const die of dice) {
    if (ownBar > 0) {
      const move = { from: null, to: hostTurn ? 24 - die : die - 1, die };
      if (!('error' in applyBackgammonMove(state, move, hostTurn))) moves.push(move);
      continue;
    }

    for (let from = 0; from < 24; from += 1) {
      const sign = hostTurn ? 1 : -1;
      if (state.board[from] * sign <= 0) continue;
      const destination = hostTurn ? from - die : from + die;
      const move: BackgammonMove = {
        from,
        to: destination < 0 || destination > 23 ? null : destination,
        die,
      };
      if ('error' in applyBackgammonMove(state, move, hostTurn)) continue;
      moves.push(move);
    }
  }

  return moves;
}

/**
 * Selects a legal, maximum-dice sequence for the disconnected player's turn.
 * The function is pure: it never mutates the supplied board, bars, off counts or dice.
 * It intentionally uses the same authoritative rules as human move validation.
 */
export function chooseTemporaryAiTurn(
  initial: MutableGameState,
  availableDice: number[],
  hostTurn: boolean,
): TemporaryAiTurn {
  const search = (
    state: MutableGameState,
    remainingDice: number[],
  ): TemporaryAiTurn => {
    if (remainingDice.length === 0) {
      return { moves: [], state, remainingDice: [] };
    }

    let best: TemporaryAiTurn = {
      moves: [],
      state,
      remainingDice: [...remainingDice],
    };

    for (const move of candidateMoves(state, remainingDice, hostTurn)) {
      if (mustPlayHigherDie(state, remainingDice, move, hostTurn)) continue;
      const applied = applyBackgammonMove(state, move, hostTurn);
      if ('error' in applied) continue;

      const nextDice = [...remainingDice];
      nextDice.splice(nextDice.indexOf(move.die), 1);
      const tail = search(applied.state, nextDice);
      const candidate: TemporaryAiTurn = {
        moves: [move, ...tail.moves],
        state: tail.state,
        remainingDice: tail.remainingDice,
      };

      if (candidate.moves.length > best.moves.length) best = candidate;
      if (best.moves.length === remainingDice.length) break;
    }

    return best;
  };

  return search({
    board: [...initial.board],
    bar: { host: initial.bar.host, guest: initial.bar.guest },
    off: { host: initial.off.host, guest: initial.off.guest },
  }, [...availableDice]);
}
