import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_BACKGAMMON_BOARD, applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';

const emptyBoard = () => Array<number>(24).fill(0);
const state = (
  board: number[],
  bar = { host: 0, guest: 0 },
  off?: { host: number; guest: number },
) => ({
  board,
  bar,
  off: off ?? {
    host: 15 - board.reduce((sum, count) => sum + Math.max(count, 0), 0) - bar.host,
    guest: 15 - board.reduce((sum, count) => sum + Math.max(-count, 0), 0) - bar.guest,
  },
});

test('detects a regular legal move for either player', () => {
  const board = emptyBoard();
  board[5] = 1;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), true);
  const guestBoard = emptyBoard();
  guestBoard[18] = -1;
  assert.equal(hasLegalMove(guestBoard, { host: 0, guest: 0 }, [1], false), true);
});

test('does not allow a checker to land on a point blocked by two opponents', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[4] = -2;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), false);
});

test('allows landing on a point occupied by a single opposing checker', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[4] = -1;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), true);
});

test('requires a checker on the bar to enter at an open point', () => {
  const board = emptyBoard();
  board[23] = -2;
  assert.equal(hasLegalMove(board, { host: 1, guest: 0 }, [1], true), false);
  board[23] = 0;
  assert.equal(hasLegalMove(board, { host: 1, guest: 0 }, [1], true), true);
});

test('detects bearing off only when all checkers are in the home board', () => {
  const board = emptyBoard();
  board[0] = 15;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), true);
  board[6] = 1;
  board[5] = -2;
  board[0] = 14;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), false);
  board[6] = 0;
  board[5] = 0;
  board[0] = 15;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [6], true), true);
});

test('rejects empty dice and malformed die values', () => {
  const board = emptyBoard();
  board[5] = 1;
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [], true), false);
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [0, 7], true), false);
});

test('applies a legal move without mutating the input state', () => {
  const board = emptyBoard();
  board[5] = 1;
  const original = state(board);
  const result = applyBackgammonMove(original, { from: 5, to: 4, die: 1 }, true);
  assert.ok('state' in result);
  if ('state' in result) {
    assert.equal(result.state.board[5], 0);
    assert.equal(result.state.board[4], 1);
    assert.equal(original.board[5], 1);
  }
});

test('batch-compatible move helper hits a single checker and puts it on the bar', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[4] = -1;
  const result = applyBackgammonMove(state(board), { from: 5, to: 4, die: 1 }, true);
  assert.ok('state' in result);
  if ('state' in result) {
    assert.equal(result.state.board[4], 1);
    assert.equal(result.state.bar.guest, 1);
  }
});

test('prevents moving another checker while one is on the bar', () => {
  const board = emptyBoard();
  board[5] = 1;
  const result = applyBackgammonMove(state(board, { host: 1, guest: 0 }), { from: 5, to: 4, die: 1 }, true);
  assert.ok('error' in result);
});

test('applies bear-off and increments the off counter', () => {
  const board = emptyBoard();
  board[0] = 1;
  const result = applyBackgammonMove(state(board), { from: 0, to: null, die: 1 }, true);
  assert.ok('state' in result);
  if ('state' in result) assert.equal(result.state.off.host, 15);
});

test('supports a two-die sequence by applying each move to the previous preview state', () => {
  const board = emptyBoard();
  board[5] = 1;
  const first = applyBackgammonMove(state(board), { from: 5, to: 3, die: 2 }, true);
  assert.ok('state' in first);
  if (!('state' in first)) return;
  const second = applyBackgammonMove(first.state, { from: 3, to: 0, die: 3 }, true);
  assert.ok('state' in second);
  if ('state' in second) {
    assert.equal(second.state.board[5], 0);
    assert.equal(second.state.board[3], 0);
    assert.equal(second.state.board[0], 1);
  }
});

test('rejects a blocked move without changing the source state', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[4] = -2;
  const original = state(board);
  const result = applyBackgammonMove(original, { from: 5, to: 4, die: 1 }, true);
  assert.ok('error' in result);
  assert.equal(original.board[5], 1);
  assert.equal(original.board[4], -2);
});


test('calculates the maximum usable dice across a turn', () => {
  const board = emptyBoard();
  board[5] = 1;
  assert.equal(maxPlayableDiceCount(state(board), [1, 2], true), 2);
  assert.equal(maxPlayableDiceCount(state(board), [], true), 0);
});

test('counts doubles as four playable dice when a checker can keep moving', () => {
  const board = emptyBoard();
  board[10] = 1;
  assert.equal(maxPlayableDiceCount(state(board), [2, 2, 2, 2], true), 4);
});

test('requires the higher die first when a lower move would make it unusable', () => {
  const board = emptyBoard();
  board[6] = 1;
  board[10] = 1;
  board[5] = -2;
  assert.equal(
    mustPlayHigherDie(state(board), [2, 5], { from: 6, to: 4, die: 2 }, true),
    true,
  );
});

test('does not report higher-die priority for an invalid selected move', () => {
  const board = emptyBoard();
  board[6] = 1;
  board[10] = 1;
  board[5] = -2;
  assert.equal(
    mustPlayHigherDie(state(board), [2, 5], { from: 6, to: 3, die: 2 }, true),
    false,
  );
});

test('does not force the higher die first when both dice can still be used', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[10] = 1;
  assert.equal(
    mustPlayHigherDie(state(board), [2, 5], { from: 10, to: 8, die: 2 }, true),
    false,
  );
});

test('does not apply higher-die priority to doubles', () => {
  const board = emptyBoard();
  board[5] = 1;
  assert.equal(
    mustPlayHigherDie(state(board), [3, 3], { from: 5, to: 2, die: 3 }, true),
    false,
  );
});

test('does not count an overshoot bear-off when another checker is outside the home board', () => {
  const board = emptyBoard();
  board[1] = 1;
  board[10] = 1;
  board[4] = -2;
  assert.equal(maxPlayableDiceCount(state(board), [6], true), 0);
});

test('does not count an overshoot bear-off when a higher checker can still be borne off', () => {
  const board = emptyBoard();
  board[1] = 1;
  board[3] = 1;
  assert.equal(maxPlayableDiceCount(state(board), [6], true), 1);
});

test('mirrors oversized bear-off priority correctly for host and guest', () => {
  const hostBoard = emptyBoard();
  hostBoard[1] = 1;
  hostBoard[3] = 1;
  const hostCanBearOffFarther = applyBackgammonMove(
    state(hostBoard), { from: 3, to: null, die: 6 }, true,
  );
  const hostCannotSkipFarther = applyBackgammonMove(
    state(hostBoard), { from: 1, to: null, die: 6 }, true,
  );
  assert.ok('state' in hostCanBearOffFarther);
  assert.ok('error' in hostCannotSkipFarther);

  const guestBoard = emptyBoard();
  guestBoard[20] = -1;
  guestBoard[22] = -1;
  const guestCanBearOffCloser = applyBackgammonMove(
    state(guestBoard), { from: 20, to: null, die: 6 }, false,
  );
  const guestCannotSkipFarther = applyBackgammonMove(
    state(guestBoard), { from: 22, to: null, die: 6 }, false,
  );
  assert.ok('state' in guestCanBearOffCloser);
  assert.ok('error' in guestCannotSkipFarther);
});

test('requires the higher die when only one of two individually legal dice can be played', () => {
  const board = emptyBoard();
  board[5] = 1;
  board[2] = -2;
  assert.equal(maxPlayableDiceCount(state(board), [1, 2], true), 1);
  assert.equal(
    mustPlayHigherDie(state(board), [1, 2], { from: 5, to: 4, die: 1 }, true),
    true,
  );
});


test('initial board has the correct orientation and allows both players to move', () => {
  assert.equal(INITIAL_BACKGAMMON_BOARD.length, 24);
  assert.equal(INITIAL_BACKGAMMON_BOARD[0], -2);
  assert.equal(INITIAL_BACKGAMMON_BOARD[5], 5);
  assert.equal(INITIAL_BACKGAMMON_BOARD[7], 3);
  assert.equal(INITIAL_BACKGAMMON_BOARD[11], -5);
  assert.equal(INITIAL_BACKGAMMON_BOARD[12], 5);
  assert.equal(INITIAL_BACKGAMMON_BOARD[16], -3);
  assert.equal(INITIAL_BACKGAMMON_BOARD[18], -5);
  assert.equal(INITIAL_BACKGAMMON_BOARD[23], 2);
  assert.equal(INITIAL_BACKGAMMON_BOARD.reduce((sum, count) => sum + Math.max(count, 0), 0), 15);
  assert.equal(INITIAL_BACKGAMMON_BOARD.reduce((sum, count) => sum + Math.max(-count, 0), 0), 15);
  assert.equal(hasLegalMove([...INITIAL_BACKGAMMON_BOARD], { host: 0, guest: 0 }, [1], true), true);
  assert.equal(hasLegalMove([...INITIAL_BACKGAMMON_BOARD], { host: 0, guest: 0 }, [1], false), true);
});


test('rejects malformed board counts without mutating the supplied state', () => {
  const board = emptyBoard();
  board[5] = 1.5;
  const original = state([...board]);
  const result = applyBackgammonMove(original, { from: 5, to: 4, die: 1 }, true);
  assert.ok('error' in result);
  assert.equal(original.board[5], 1.5);
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, [1], true), false);
  assert.equal(maxPlayableDiceCount(original, [1, 2], true), 0);
});

test('rejects invalid bar and borne-off counters instead of allowing corrupt state', () => {
  const board = emptyBoard();
  board[5] = 1;
  const negativeBar = state(board, { host: -1, guest: 0 });
  const fractionalOff = state(board, { host: 0, guest: 0 }, { host: 0.5, guest: 0 });

  assert.ok('error' in applyBackgammonMove(negativeBar, { from: 5, to: 4, die: 1 }, true));
  assert.ok('error' in applyBackgammonMove(fractionalOff, { from: 5, to: 4, die: 1 }, true));
  assert.equal(maxPlayableDiceCount(negativeBar, [1], true), 0);
  assert.equal(maxPlayableDiceCount(fractionalOff, [1], true), 0);
});

test('rejects a persisted position with missing checkers instead of silently accepting it', () => {
  const board = emptyBoard();
  board[5] = 14;
  const missingOne = { board, bar: { host: 0, guest: 0 }, off: { host: 0, guest: 0 } };
  assert.ok('error' in applyBackgammonMove(missingOne, { from: 5, to: 4, die: 1 }, true));
  assert.equal(maxPlayableDiceCount(missingOne, [1], true), 0);
  assert.equal(hasLegalMove(board, missingOne.bar, [1], true, missingOne.off), false);
});

test('valid states still preserve the normal move and bar-entry rules', () => {
  const board = emptyBoard();
  board[5] = 1;
  const move = applyBackgammonMove(state(board), { from: 5, to: 4, die: 1 }, true);
  assert.ok('state' in move);
  if ('state' in move) {
    assert.equal(move.state.board[5], 0);
    assert.equal(move.state.board[4], 1);
  }

  const barBoard = emptyBoard();
  barBoard[23] = -1;
  const entry = applyBackgammonMove(
    state(barBoard, { host: 1, guest: 0 }),
    { from: null, to: 23, die: 1 },
    true,
  );
  assert.ok('state' in entry);
  if ('state' in entry) {
    assert.equal(entry.state.bar.host, 0);
    assert.equal(entry.state.board[23], 1);
    assert.equal(entry.state.bar.guest, 1);
  }
});


test('fails closed for malformed dice collections and null higher-die moves', () => {
  const board = emptyBoard();
  board[5] = 1;
  const validState = state(board);
  const malformedDice = [1, 7] as unknown as number[];
  const missingDice = null as unknown as number[];

  assert.equal(hasLegalMove(board, validState.bar, malformedDice, true), false);
  assert.equal(hasLegalMove(board, validState.bar, missingDice, true), false);
  assert.equal(maxPlayableDiceCount(validState, malformedDice, true), 0);
  assert.equal(maxPlayableDiceCount(validState, missingDice, true), 0);
  assert.equal(
    mustPlayHigherDie(validState, [1, 2], null as unknown as { from: number; to: number; die: number }, true),
    false,
  );
});


test('rejects sparse board and dice arrays instead of skipping missing entries', () => {
  const sparseBoard = emptyBoard();
  delete sparseBoard[5];
  const sparseState = state(sparseBoard);
  const validBoard = emptyBoard();
  validBoard[5] = 1;
  const sparseDice = [1, 2];
  delete sparseDice[1];

  assert.ok('error' in applyBackgammonMove(sparseState, { from: 5, to: 4, die: 1 }, true));
  assert.equal(hasLegalMove(sparseBoard, { host: 0, guest: 0 }, [1], true), false);
  assert.equal(maxPlayableDiceCount(sparseState, [1], true), 0);
  assert.equal(hasLegalMove(validBoard, { host: 0, guest: 0 }, sparseDice, true), false);
  assert.equal(maxPlayableDiceCount(state(validBoard), sparseDice, true), 0);
});


test('rejects a player inventory above fifteen across board points', () => {
  const board = emptyBoard();
  board[5] = 8;
  board[4] = 8;
  const invalid = state(board);
  assert.ok('error' in applyBackgammonMove(invalid, { from: 5, to: 3, die: 2 }, true));
  assert.equal(hasLegalMove(board, invalid.bar, [1], true), false);
  assert.equal(maxPlayableDiceCount(invalid, [1, 2], true), 0);
});

test('includes bar and borne-off checkers in the fifteen-checker inventory', () => {
  const board = emptyBoard();
  board[5] = 15;
  const invalidBar = state(board, { host: 1, guest: 0 });
  const invalidOff = state(board, { host: 0, guest: 0 }, { host: 1, guest: 0 });
  assert.ok('error' in applyBackgammonMove(invalidBar, { from: 5, to: 4, die: 1 }, true));
  assert.ok('error' in applyBackgammonMove(invalidOff, { from: 5, to: 4, die: 1 }, true));
  assert.equal(maxPlayableDiceCount(invalidBar, [1], true), 0);
  assert.equal(maxPlayableDiceCount(invalidOff, [1], true), 0);
});

test('rejects impossible dice collection lengths and non-double triples', () => {
  const board = emptyBoard();
  board[10] = 1;
  const invalidFiveDice = [1, 1, 1, 1, 1];
  const invalidTriple = [1, 2, 3];
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, invalidFiveDice, true), false);
  assert.equal(hasLegalMove(board, { host: 0, guest: 0 }, invalidTriple, true), false);
  assert.equal(maxPlayableDiceCount(state(board), invalidFiveDice, true), 0);
  assert.equal(maxPlayableDiceCount(state(board), invalidTriple, true), 0);
  assert.equal(maxPlayableDiceCount(state(board), [2, 2, 2], true), 3);
});
