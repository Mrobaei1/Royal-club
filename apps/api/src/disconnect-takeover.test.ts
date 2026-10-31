import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTemporaryAiTurn } from './disconnect-takeover.js';
import { INITIAL_BACKGAMMON_BOARD } from './backgammon-rules.js';

function completeState(
  board: number[],
  bar = { host: 0, guest: 0 },
) {
  return {
    board,
    bar,
    off: {
      host: 15 - board.reduce((sum, count) => sum + Math.max(count, 0), 0) - bar.host,
      guest: 15 - board.reduce((sum, count) => sum + Math.max(-count, 0), 0) - bar.guest,
    },
  };
}

test('temporary AI selects a legal move sequence without mutating its input', () => {
  const state = completeState([...INITIAL_BACKGAMMON_BOARD]);
  const before = structuredClone(state);
  const turn = chooseTemporaryAiTurn(state, [3, 5], true);

  assert.ok(turn.moves.length > 0);
  assert.ok(turn.moves.length <= 2);
  assert.deepEqual(state, before);
  assert.equal(turn.remainingDice.length + turn.moves.length, 2);
});

test('temporary AI prioritizes entering a checker from the bar', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[10] = 1;
  const state = completeState(board, { host: 1, guest: 0 });
  const turn = chooseTemporaryAiTurn(state, [2, 4], true);

  assert.ok(turn.moves.length > 0);
  assert.equal(turn.moves[0].from, null);
  assert.equal(turn.state.bar.host, 0);
});

test('temporary AI skips a turn when every entry point is blocked', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[23] = -2;
  board[21] = -2;
  const state = completeState(board, { host: 1, guest: 0 });
  const turn = chooseTemporaryAiTurn(state, [1, 3], true);

  assert.deepEqual(turn.moves, []);
  assert.deepEqual(turn.remainingDice, [1, 3]);
  assert.deepEqual(turn.state, state);
});

test('temporary AI applies the standard higher-die rule when only one die can be played', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[5] = 1;
  board[4] = -2;
  const state = completeState(board);
  const turn = chooseTemporaryAiTurn(state, [1, 6], true);

  assert.equal(turn.moves.length, 1);
  assert.equal(turn.moves[0].die, 6);
});

test('temporary AI uses all four dice when doubles allow four legal moves', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[3] = 4;
  board[0] = 11;
  const state = completeState(board);
  const turn = chooseTemporaryAiTurn(state, [2, 2, 2, 2], true);

  assert.equal(turn.moves.length, 4);
  assert.deepEqual(turn.remainingDice, []);
});

test('temporary AI can legally bear off a checker from the home board', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[0] = 1;
  const state = completeState(board);
  const turn = chooseTemporaryAiTurn(state, [1, 4], true);

  assert.equal(turn.moves.length, 1);
  assert.deepEqual(turn.moves[0], { from: 0, to: null, die: 4 });
  assert.equal(turn.state.off.host, 15);
  assert.deepEqual(turn.remainingDice, [1]);
});


test('temporary AI selects a legal move in the guest direction', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[20] = -1;
  const state = completeState(board);
  const turn = chooseTemporaryAiTurn(state, [2], false);

  assert.deepEqual(turn.moves, [{ from: 20, to: 22, die: 2 }]);
  assert.equal(turn.state.board[20], 0);
  assert.equal(turn.state.board[22], -1);
});

test('temporary AI enters a guest checker from the bar at the correct point', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[10] = -1;
  const state = completeState(board, { host: 0, guest: 1 });
  const turn = chooseTemporaryAiTurn(state, [3], false);

  assert.deepEqual(turn.moves, [{ from: null, to: 2, die: 3 }]);
  assert.equal(turn.state.bar.guest, 0);
  assert.equal(turn.state.board[2], -1);
});

test('temporary AI hits an opposing blot when the guest move lands on it', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[20] = -1;
  board[22] = 1;
  const state = completeState(board);
  const turn = chooseTemporaryAiTurn(state, [2], false);

  assert.deepEqual(turn.moves, [{ from: 20, to: 22, die: 2 }]);
  assert.equal(turn.state.board[22], -1);
  assert.equal(turn.state.bar.host, 1);
});
