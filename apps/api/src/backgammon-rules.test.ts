import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLegalMove } from './backgammon-rules.js';

const emptyBoard = () => Array<number>(24).fill(0);

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
