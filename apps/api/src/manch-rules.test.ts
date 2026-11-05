import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyManchMove,
  createManchGame,
  defaultManchRuleProfile,
  isValidManchState,
  legalManchMoves,
  passManchTurn,
  rollManchDice,
  type ManchGameState,
  type ManchPlayerState,
} from './manch-rules.js';

function withTokens(
  first: number[],
  second: number[],
  profile = defaultManchRuleProfile(),
): ManchGameState {
  const state = createManchGame(['red', 'green'], profile);
  return {
    ...state,
    players: [
      { colour: 'red', tokens: first },
      { colour: 'green', tokens: second },
    ],
  };
}

test('creates 2–4 player states with four tokens per player', () => {
  assert.equal(createManchGame(['red', 'yellow']).players.length, 2);
  assert.equal(createManchGame(['red', 'green', 'yellow']).players.length, 3);
  assert.equal(createManchGame(['red', 'green', 'yellow', 'blue']).players.length, 4);
  assert.throws(() => createManchGame(['red']));
  assert.throws(() => createManchGame(['red', 'red']));
});

test('requires a configured entry face and grants an extra roll after six', () => {
  const state = createManchGame(['red', 'yellow']);
  const five = rollManchDice(state, 5);
  assert.ok('state' in five);
  if (!('state' in five)) return;
  assert.deepEqual(legalManchMoves(five.state), []);
  const passed = passManchTurn(five.state);
  assert.ok('state' in passed);
  if ('state' in passed) assert.equal(passed.state.activePlayerIndex, 1);

  const six = rollManchDice(state, 6);
  assert.ok('state' in six);
  if (!('state' in six)) return;
  assert.equal(legalManchMoves(six.state).length, 4);
  const moved = applyManchMove(six.state, 0);
  assert.ok('state' in moved);
  if ('state' in moved) {
    assert.equal(moved.state.players[0].tokens[0], 0);
    assert.equal(moved.state.activePlayerIndex, 0);
    assert.equal(moved.state.pendingDice, null);
  }
});

test('captures a single opponent on an unsafe shared cell', () => {
  const state = withTokens([0, -1, -1, -1], [40, -1, -1, -1]);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const moves = legalManchMoves(rolled.state);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].capturedPlayerIndex, 1);
  const moved = applyManchMove(rolled.state, 0);
  assert.ok('state' in moved);
  if ('state' in moved) {
    assert.equal(moved.state.players[1].tokens[0], -1);
    assert.equal(moved.state.players[0].tokens[0], 1);
  }
});

test('does not capture on a configured safe cell', () => {
  const state = withTokens([12, -1, -1, -1], [0, -1, -1, -1]);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const move = legalManchMoves(rolled.state)[0];
  assert.equal(move.capturedPlayerIndex, null);
});

test('blockade blocks opponents when enabled', () => {
  const profile = { ...defaultManchRuleProfile(), blockadesEnabled: true };
  const state = withTokens([0, -1, -1, -1], [40, 40, -1, -1], profile);
  const rolled = rollManchDice(state, 2);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  assert.deepEqual(legalManchMoves(rolled.state), []);
});

test('blockade destination behavior respects the configurable opponent rule', () => {
  const profile = {
    ...defaultManchRuleProfile(),
    blockadesEnabled: true,
    blockadeBlocksOpponents: false,
  };
  const state = withTokens([-1, -1, -1, -1], [39, 39, -1, -1], profile);
  const rolled = rollManchDice(state, 6);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  assert.equal(legalManchMoves(rolled.state).length, 4);
});

test('requires exact finish and declares the winner', () => {
  const state = withTokens([56, 57, 57, 57], [-1, -1, -1, -1]);
  const overshoot = rollManchDice(state, 2);
  assert.ok('state' in overshoot);
  if (!('state' in overshoot)) return;
  assert.deepEqual(legalManchMoves(overshoot.state), []);

  const exact = rollManchDice(state, 1);
  assert.ok('state' in exact);
  if (!('state' in exact)) return;
  const won = applyManchMove(exact.state, 0);
  assert.ok('state' in won);
  if ('state' in won) {
    assert.equal(won.state.winnerIndex, 0);
    assert.equal(won.state.players[0].tokens.every((token) => token === 57), true);
  }
});

test('a six with no legal move preserves the same player for another roll', () => {
  const state = withTokens([56, 57, 57, 57], [-1, -1, -1, -1]);
  const rolled = rollManchDice(state, 6);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const passed = passManchTurn(rolled.state);
  assert.ok('state' in passed);
  if ('state' in passed) {
    assert.equal(passed.state.activePlayerIndex, 0);
    assert.equal(passed.state.consecutiveSixes, 1);
    assert.equal(passed.state.pendingDice, null);
  }
});

test('optional third consecutive six penalty loses the turn', () => {
  const profile = {
    ...defaultManchRuleProfile(),
    threeSixPenalty: 'loseTurn' as const,
  };
  const state = {
    ...createManchGame(['red', 'green'], profile),
    consecutiveSixes: 2,
  };
  const rolled = rollManchDice(state, 6);
  assert.ok('state' in rolled);
  if ('state' in rolled) {
    assert.equal(rolled.state.activePlayerIndex, 1);
    assert.equal(rolled.state.pendingDice, null);
    assert.equal(rolled.state.consecutiveSixes, 0);
  }
});

test('rejects malformed state and illegal moves without mutating the source', () => {
  const state = withTokens([56, -1, -1, -1], [-1, -1, -1, -1]);
  const rolled = rollManchDice(state, 2);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const original = structuredClone(rolled.state);
  const illegal = applyManchMove(rolled.state, 0);
  assert.ok('error' in illegal);
  assert.deepEqual(rolled.state, original);

  const malformed = {
    ...state,
    players: [
      { colour: 'red', tokens: [58, -1, -1, -1] },
      { colour: 'green', tokens: [-1, -1, -1, -1] },
    ] as ManchPlayerState[],
  };
  assert.deepEqual(legalManchMoves(malformed), []);
});

test('requires completed-token and winner/active-seat invariants to agree', () => {
  const base = createManchGame(['red', 'green']);
  const completedPlayer: ManchPlayerState = {
    colour: 'red',
    tokens: [57, 57, 57, 57],
  };
  const completedWithoutWinner: ManchGameState = {
    ...base,
    players: [completedPlayer, base.players[1]],
  };
  assert.equal(isValidManchState(completedWithoutWinner), false);

  const validWinner: ManchGameState = {
    ...completedWithoutWinner,
    winnerIndex: 0,
    activePlayerIndex: 0,
  };
  assert.equal(isValidManchState(validWinner), true);

  assert.equal(
    isValidManchState({ ...validWinner, activePlayerIndex: 1 }),
    false,
  );
});

test('round-trips the full versioned state through JSON', () => {
  const state = createManchGame(['red', 'yellow']);
  const restored = JSON.parse(JSON.stringify(state)) as ManchGameState;
  assert.deepEqual(restored, state);
});


test('a stacked pair is not captured as a single exposed token', () => {
  const state = withTokens([0, -1, -1, -1], [40, 40, -1, -1]);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const move = legalManchMoves(rolled.state).find((candidate) => candidate.tokenIndex === 0);
  assert.ok(move);
  assert.equal(move.capturedPlayerIndex, null);
  const moved = applyManchMove(rolled.state, 0);
  assert.ok('state' in moved);
  if ('state' in moved) assert.deepEqual(moved.state.players[1].tokens.slice(0, 2), [40, 40]);
});

test('capture grants another roll only when the selected profile enables it', () => {
  const profile = { ...defaultManchRuleProfile(), extraRollOnCapture: true };
  const state = withTokens([0, -1, -1, -1], [40, -1, -1, -1], profile);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const moved = applyManchMove(rolled.state, 0);
  assert.ok('state' in moved);
  if ('state' in moved) {
    assert.equal(moved.state.players[1].tokens[0], -1);
    assert.equal(moved.state.activePlayerIndex, 0);
    assert.equal(moved.state.turnNumber, state.turnNumber);
  }
});

test('friendly stacking can be disabled without blocking other legal moves', () => {
  const profile = { ...defaultManchRuleProfile(), friendlyStackingEnabled: false };
  const state = withTokens([1, 0, -1, -1], [-1, -1, -1, -1], profile);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const moves = legalManchMoves(rolled.state);
  assert.equal(moves.some((move) => move.tokenIndex === 1), false);
  assert.equal(moves.some((move) => move.tokenIndex === 0), true);
});

test('non-exact finish clamps an overshoot to the finish cell', () => {
  const profile = { ...defaultManchRuleProfile(), exactFinishRequired: false };
  const state = withTokens([56, 57, 57, 57], [-1, -1, -1, -1], profile);
  const rolled = rollManchDice(state, 6);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const moved = applyManchMove(rolled.state, 0);
  assert.ok('state' in moved);
  if ('state' in moved) {
    assert.equal(moved.state.winnerIndex, 0);
    assert.equal(moved.state.players[0].tokens.every((position) => position === 57), true);
  }
});

test('rejects invalid rule-profile faces, safe cells and six limits', () => {
  const base = createManchGame(['red', 'green']);
  assert.equal(isValidManchState({
    ...base,
    profile: { ...base.profile, entryFaces: [0] },
  }), false);
  assert.equal(isValidManchState({
    ...base,
    profile: { ...base.profile, safeTrackIndices: [52] },
  }), false);
  assert.equal(isValidManchState({
    ...base,
    profile: { ...base.profile, maxConsecutiveSixes: 1 },
  }), false);
});

test('seeded complete games preserve invariants for every supported player count', () => {
  const seats = {
    2: ['red', 'yellow'],
    3: ['red', 'green', 'yellow'],
    4: ['red', 'green', 'yellow', 'blue'],
  } as const;

  for (const playerCount of [2, 3, 4] as const) {
    for (const seed of [17, 73, 211]) {
      let state = createManchGame([...seats[playerCount]]);
      let randomState = (seed * 104729 + playerCount * 8191) >>> 0;
      let actions = 0;

      while (state.winnerIndex === null && actions < 30000) {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        const dice = (randomState % 6) + 1;
        const rolled = rollManchDice(state, dice);
        assert.ok('state' in rolled);
        if (!('state' in rolled)) break;
        state = rolled.state;
        actions++;

        const moves = legalManchMoves(state);
        if (moves.length === 0) {
          const passed = passManchTurn(state);
          assert.ok('state' in passed);
          if (!('state' in passed)) break;
          state = passed.state;
        } else {
          const selected = moves[(randomState >>> 8) % moves.length];
          const moved = applyManchMove(state, selected.tokenIndex);
          assert.ok('state' in moved);
          if (!('state' in moved)) break;
          state = moved.state;
        }

        assert.equal(
          isValidManchState(state),
          true,
          `Invalid state after action ${actions}: players=${playerCount}, seed=${seed}`,
        );
      }

      assert.notEqual(
        state.winnerIndex,
        null,
        `Game did not finish: players=${playerCount}, seed=${seed}, actions=${actions}`,
      );
      assert.equal(
        state.players[state.winnerIndex!].tokens.every((token) => token === 57),
        true,
      );
    }
  }
test('caps consecutive sixes and rejects impossible winner/pending-dice states', () => {
  const base = createManchGame(['red', 'green']);
  const rolled = rollManchDice({ ...base, consecutiveSixes: 3 }, 6);
  assert.ok('state' in rolled);
  if ('state' in rolled) {
    assert.equal(rolled.state.consecutiveSixes, 3);
    assert.equal(rolled.state.activePlayerIndex, 0);
    assert.equal(rolled.state.pendingDice, 6);
  }
  assert.equal(isValidManchState({ ...base, consecutiveSixes: 4 }), false);
  const finishedWithPendingDice: ManchGameState = {
    ...base,
    players: [
      { colour: 'red', tokens: [57, 57, 57, 57] },
      base.players[1],
    ],
    winnerIndex: 0,
    pendingDice: 6,
    consecutiveSixes: 1,
  };
  assert.equal(isValidManchState(finishedWithPendingDice), false);
});

test('rejects duplicate profile faces and duplicate safe cells', () => {
  const base = createManchGame(['red', 'green']);
  assert.equal(isValidManchState({
    ...base, profile: { ...base.profile, entryFaces: [6, 6] },
  }), false);
  assert.equal(isValidManchState({
    ...base, profile: { ...base.profile, safeTrackIndices: [0, 0] },
  }), false);
});

test('base profile preserves the third-six turn', () => {
  const base = createManchGame(['red', 'green']);
  const rolled = rollManchDice({ ...base, consecutiveSixes: 2 }, 6);
  assert.ok('state' in rolled);
  if ('state' in rolled) {
    assert.equal(rolled.state.activePlayerIndex, 0);
    assert.equal(rolled.state.consecutiveSixes, 3);
    assert.equal(rolled.state.pendingDice, 6);
  }
});

test('entry on a configured face captures one exposed token on an unsafe entry cell', () => {
  const profile = { ...defaultManchRuleProfile(), safeTrackIndices: [13, 26, 39] };
  const state = withTokens([-1, -1, -1, -1], [39, -1, -1, -1], profile);
  const rolled = rollManchDice(state, 6);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const move = legalManchMoves(rolled.state)[0];
  assert.equal(move.capturedPlayerIndex, 1);
  assert.equal(move.capturedTokenIndex, 0);
  const applied = applyManchMove(rolled.state, move.tokenIndex);
  assert.ok('state' in applied);
  if ('state' in applied) {
    assert.equal(applied.state.players[1].tokens[0], -1);
    assert.equal(applied.state.players[0].tokens[0], 0);
  }
});

test('finish bonus is independent from six bonus', () => {
  const profile = { ...defaultManchRuleProfile(), extraRollOnSix: false, extraRollOnFinish: true };
  const state = withTokens([56, 54, 57, 57], [-1, -1, -1, -1], profile);
  const rolled = rollManchDice(state, 1);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  const applied = applyManchMove(rolled.state, 0);
  assert.ok('state' in applied);
  if ('state' in applied) {
    assert.equal(applied.state.players[0].tokens[0], 57);
    assert.equal(applied.state.activePlayerIndex, 0);
    assert.equal(applied.state.pendingDice, null);
  }
});

test('rejects invalid dice, repeated rolls, and passing while a legal move exists', () => {
  const base = createManchGame(['red', 'green']);
  assert.ok('error' in rollManchDice(base, 0));
  const rolled = rollManchDice(base, 6);
  assert.ok('state' in rolled);
  if (!('state' in rolled)) return;
  assert.ok('error' in rollManchDice(rolled.state, 2));
  assert.ok('error' in passManchTurn(rolled.state));
});

test('finished games reject every subsequent turn action', () => {
  const base = createManchGame(['red', 'green']);
  const finished: ManchGameState = {
    ...base,
    players: [
      { colour: 'red', tokens: [57, 57, 57, 57] },
      base.players[1],
    ],
    winnerIndex: 0,
  };
  assert.deepEqual(legalManchMoves(finished), []);
  assert.ok('error' in rollManchDice(finished, 1));
  assert.ok('error' in passManchTurn(finished));
  assert.ok('error' in applyManchMove(finished, 0));
});

test('seeded complete games preserve invariants for every player count and fixed seed', () => {
  const seats = {
    2: ['red', 'yellow'],
    3: ['red', 'green', 'yellow'],
    4: ['red', 'green', 'yellow', 'blue'],
  } as const;
  for (const playerCount of [2, 3, 4] as const) {
    for (const seed of [17, 73, 211, 997, 2027]) {
      let state = createManchGame([...seats[playerCount]]);
      let randomState = (seed * 104729 + playerCount * 8191) >>> 0;
      let actions = 0;
      while (state.winnerIndex === null && actions < 30000) {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        const rolled = rollManchDice(state, (randomState % 6) + 1);
        assert.ok('state' in rolled);
        if (!('state' in rolled)) break;
        state = rolled.state;
        const moves = legalManchMoves(state);
        if (moves.length === 0) {
          const passed = passManchTurn(state);
          assert.ok('state' in passed);
          if (!('state' in passed)) break;
          state = passed.state;
        } else {
          const move = moves[(randomState >>> 8) % moves.length];
          const applied = applyManchMove(state, move.tokenIndex);
          assert.ok('state' in applied);
          if (!('state' in applied)) break;
          state = applied.state;
        }
        actions++;
        assert.equal(isValidManchState(state), true,
          `Invalid state for ${playerCount} players, seed ${seed}, action ${actions}`);
      }
      assert.notEqual(state.winnerIndex, null,
        `Game did not finish for ${playerCount} players, seed ${seed}`);
    }
  }
});
