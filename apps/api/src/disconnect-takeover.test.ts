import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTemporaryAiTurn } from './disconnect-takeover.js';
import { INITIAL_BACKGAMMON_BOARD } from './backgammon-rules.js';

test('temporary AI selects a legal move sequence without mutating its input', () => {
  const state = {
    board: [...INITIAL_BACKGAMMON_BOARD],
    bar: { host: 0, guest: 0 },
    off: { host: 0, guest: 0 },
  };
  const before = structuredClone(state);
  const turn = chooseTemporaryAiTurn(state, [3, 5], true);

  assert.ok(turn.moves.length > 0);
  assert.ok(turn.moves.length <= 2);
  assert.deepEqual(state, before);
  assert.equal(turn.remainingDice.length + turn.moves.length, 2);
});

test('temporary AI prioritizes entering a checker from the bar', () => {
  const state = {
    board: Array.from({ length: 24 }, () => 0),
    bar: { host: 1, guest: 0 },
    off: { host: 0, guest: 0 },
  };
  state.board[10] = 1;
  const turn = chooseTemporaryAiTurn(state, [2, 4], true);

  assert.ok(turn.moves.length > 0);
  assert.equal(turn.moves[0].from, null);
  assert.equal(turn.state.bar.host, 0);
});

test('temporary AI skips a turn when every entry point is blocked', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[23] = -2;
  board[21] = -2;
  const state = {
    board,
    bar: { host: 1, guest: 0 },
    off: { host: 0, guest: 0 },
  };
  const turn = chooseTemporaryAiTurn(state, [1, 3], true);

  assert.deepEqual(turn.moves, []);
  assert.deepEqual(turn.remainingDice, [1, 3]);
  assert.deepEqual(turn.state, state);
});

test('temporary AI applies the standard higher-die rule when only one die can be played', () => {
  const board = Array.from({ length: 24 }, () => 0);
  board[5] = 1;
  board[4] = -2;
  const state = {
    board,
    bar: { host: 0, guest: 0 },
    off: { host: 14, guest: 0 },
  };
  const turn = chooseTemporaryAiTurn(state, [1, 6], true);

  assert.equal(turn.moves.length, 1);
  assert.equal(turn.moves[0].die, 6);
});
