import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_BACKGAMMON_BOARD, applyBackgammonMove, hasLegalMove, maxPlayableDiceCount, mustPlayHigherDie } from './backgammon-rules.js';

const emptyBoard = () => Array<number>(24).fill(0);
const state = (board: number[], bar = { host: 0, guest: 0 }, off = { host: 0, guest: 0 }) => ({ board, bar, off });

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
  if ('state' in result) assert.equal(result.state.off.host, 1);
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
