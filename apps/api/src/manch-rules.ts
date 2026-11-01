export type ManchColour = 'red' | 'green' | 'yellow' | 'blue';
export type ThreeSixPenalty = 'none' | 'loseTurn';

export type ManchRuleProfile = {
  entryFaces: number[];
  extraRollOnSix: boolean;
  extraRollOnCapture: boolean;
  extraRollOnFinish: boolean;
  threeSixPenalty: ThreeSixPenalty;
  safeTrackIndices: number[];
  blockadesEnabled: boolean;
  blockadeBlocksOpponents: boolean;
  friendlyStackingEnabled: boolean;
  exactFinishRequired: boolean;
  maxConsecutiveSixes: number;
};

export type ManchPlayerState = {
  colour: ManchColour;
  tokens: number[];
};

export type ManchGameState = {
  version: 1;
  players: ManchPlayerState[];
  activePlayerIndex: number;
  profile: ManchRuleProfile;
  pendingDice: number | null;
  consecutiveSixes: number;
  turnNumber: number;
  winnerIndex: number | null;
};

export type ManchMove = {
  playerIndex: number;
  tokenIndex: number;
  fromProgress: number;
  toProgress: number;
  capturedPlayerIndex: number | null;
  capturedTokenIndex: number | null;
};

export const MANCH_TRACK_LENGTH = 52;
export const MANCH_FINISH = 57;
const COLOURS: ManchColour[] = ['red', 'green', 'yellow', 'blue'];
const STARTS: Record<ManchColour, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export function defaultManchRuleProfile(): ManchRuleProfile {
  return {
    entryFaces: [6],
    extraRollOnSix: true,
    extraRollOnCapture: false,
    extraRollOnFinish: false,
    threeSixPenalty: 'none',
    safeTrackIndices: [0, 13, 26, 39],
    blockadesEnabled: false,
    blockadeBlocksOpponents: true,
    friendlyStackingEnabled: true,
    exactFinishRequired: true,
    maxConsecutiveSixes: 3,
  };
}

export function createManchGame(
  colours: ManchColour[],
  profile: ManchRuleProfile = defaultManchRuleProfile(),
): ManchGameState {
  if (colours.length < 2 || colours.length > 4 ||
      new Set(colours).size !== colours.length ||
      colours.some((colour) => !COLOURS.includes(colour))) {
    throw new Error('Manch requires two to four players with unique valid colours.');
  }
  const state: ManchGameState = {
    version: 1,
    players: colours.map((colour) => ({ colour, tokens: [-1, -1, -1, -1] })),
    activePlayerIndex: 0,
    profile: cloneProfile(profile),
    pendingDice: null,
    consecutiveSixes: 0,
    turnNumber: 1,
    winnerIndex: null,
  };
  if (!isValidManchState(state)) throw new Error('Invalid Manch game profile.');
  return state;
}

export function isValidManchState(state: ManchGameState): boolean {
  if (!state || state.version !== 1 || !Array.isArray(state.players) ||
      state.players.length < 2 || state.players.length > 4) return false;
  if (!Number.isInteger(state.activePlayerIndex) ||
      state.activePlayerIndex < 0 || state.activePlayerIndex >= state.players.length) return false;
  if (state.pendingDice !== null &&
      (!Number.isInteger(state.pendingDice) || state.pendingDice < 1 || state.pendingDice > 6)) return false;
  if (!Number.isInteger(state.consecutiveSixes) || state.consecutiveSixes < 0 ||
      !Number.isInteger(state.turnNumber) || state.turnNumber < 1) return false;
  if (state.winnerIndex !== null &&
      (!Number.isInteger(state.winnerIndex) || state.winnerIndex < 0 ||
       state.winnerIndex >= state.players.length || state.winnerIndex !== state.activePlayerIndex)) return false;

  const colours = new Set<ManchColour>();
  for (const player of state.players) {
    if (!player || !COLOURS.includes(player.colour) || colours.has(player.colour) ||
        !Array.isArray(player.tokens) || player.tokens.length !== 4 ||
        !player.tokens.every((position) => Number.isInteger(position) && position >= -1 && position <= MANCH_FINISH)) {
      return false;
    }
    colours.add(player.colour);
  }
  if (state.winnerIndex !== null &&
      !state.players[state.winnerIndex].tokens.every((position) => position === MANCH_FINISH)) return false;
  if (state.winnerIndex === null &&
      state.players.some((player) => player.tokens.every((position) => position === MANCH_FINISH))) return false;

  const p = state.profile;
  if (!p || !Array.isArray(p.entryFaces) || p.entryFaces.length === 0 ||
      !p.entryFaces.every((face) => Number.isInteger(face) && face >= 1 && face <= 6) ||
      !Array.isArray(p.safeTrackIndices) ||
      !p.safeTrackIndices.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 52) ||
      !Number.isInteger(p.maxConsecutiveSixes) || p.maxConsecutiveSixes < 2 ||
      !['none', 'loseTurn'].includes(p.threeSixPenalty) ||
      typeof p.extraRollOnSix !== 'boolean' ||
      typeof p.extraRollOnCapture !== 'boolean' ||
      typeof p.extraRollOnFinish !== 'boolean' ||
      typeof p.blockadesEnabled !== 'boolean' ||
      typeof p.blockadeBlocksOpponents !== 'boolean' ||
      typeof p.friendlyStackingEnabled !== 'boolean' ||
      typeof p.exactFinishRequired !== 'boolean') return false;
  if (state.pendingDice === 6 && state.consecutiveSixes < 1) return false;
  if (state.pendingDice !== null && state.pendingDice !== 6 && state.consecutiveSixes !== 0) return false;
  return true;
}

export function rollManchDice(state: ManchGameState, dice: number):
  { state: ManchGameState } | { error: string } {
  if (!isValidManchState(state) || state.winnerIndex !== null) return { error: 'Invalid or finished game.' };
  if (state.pendingDice !== null) return { error: 'Resolve the pending dice first.' };
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return { error: 'Invalid dice value.' };
  const sixes = dice === 6 ? state.consecutiveSixes + 1 : 0;
  if (dice === 6 && sixes >= state.profile.maxConsecutiveSixes &&
      state.profile.threeSixPenalty === 'loseTurn') {
    return { state: advance({ ...state, consecutiveSixes: 0 }) };
  }
  return { state: { ...state, pendingDice: dice, consecutiveSixes: sixes } };
}

export function legalManchMoves(state: ManchGameState): ManchMove[] {
  if (!isValidManchState(state) || state.winnerIndex !== null || state.pendingDice === null) return [];
  const playerIndex = state.activePlayerIndex;
  const player = state.players[playerIndex];
  const dice = state.pendingDice;
  const moves: ManchMove[] = [];

  for (let tokenIndex = 0; tokenIndex < 4; tokenIndex++) {
    const fromProgress = player.tokens[tokenIndex];
    if (fromProgress === MANCH_FINISH) continue;
    if (fromProgress === -1) {
      if (!state.profile.entryFaces.includes(dice)) continue;
      const capture = captureAt(state, playerIndex, 0);
      const move: ManchMove = {
        playerIndex, tokenIndex, fromProgress, toProgress: 0,
        capturedPlayerIndex: capture?.[0] ?? null,
        capturedTokenIndex: capture?.[1] ?? null,
      };
      if (destinationAllowed(state, move)) moves.push(move);
      continue;
    }

    const rawTarget = fromProgress + dice;
    if (rawTarget > MANCH_FINISH && state.profile.exactFinishRequired) continue;
    const toProgress = Math.min(rawTarget, MANCH_FINISH);
    const capture = captureAt(state, playerIndex, toProgress);
    const move: ManchMove = {
      playerIndex, tokenIndex, fromProgress, toProgress,
      capturedPlayerIndex: capture?.[0] ?? null,
      capturedTokenIndex: capture?.[1] ?? null,
    };
    if (pathOpen(state, move) && destinationAllowed(state, move)) moves.push(move);
  }
  return moves;
}

export function applyManchMove(
  state: ManchGameState,
  tokenIndex: number,
): { state: ManchGameState; move: ManchMove } | { error: string } {
  if (!isValidManchState(state) || state.winnerIndex !== null) return { error: 'Invalid or finished game.' };
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3) return { error: 'Invalid token.' };
  const move = legalManchMoves(state).find((candidate) => candidate.tokenIndex === tokenIndex);
  if (!move) return { error: 'Illegal Manch move.' };

  const players = state.players.map((player) => ({ colour: player.colour, tokens: [...player.tokens] }));
  players[move.playerIndex].tokens[tokenIndex] = move.toProgress;
  if (move.capturedPlayerIndex !== null && move.capturedTokenIndex !== null) {
    players[move.capturedPlayerIndex].tokens[move.capturedTokenIndex] = -1;
  }
  if (players[move.playerIndex].tokens.every((position) => position === MANCH_FINISH)) {
    return {
      state: { ...state, players, pendingDice: null, winnerIndex: move.playerIndex },
      move,
    };
  }

  const extra = (state.pendingDice === 6 && state.profile.extraRollOnSix) ||
    (move.capturedPlayerIndex !== null && state.profile.extraRollOnCapture) ||
    (move.toProgress === MANCH_FINISH && state.profile.extraRollOnFinish);
  const next: ManchGameState = {
    ...state,
    players,
    pendingDice: null,
    consecutiveSixes: state.pendingDice === 6 ? state.consecutiveSixes : 0,
  };
  return { state: extra ? next : advance(next), move };
}

export function passManchTurn(state: ManchGameState): { state: ManchGameState } | { error: string } {
  if (!isValidManchState(state) || state.winnerIndex !== null || state.pendingDice === null) {
    return { error: 'No pending dice to pass.' };
  }
  if (legalManchMoves(state).length > 0) return { error: 'A legal move exists.' };
  const passed = { ...state, pendingDice: null };
  if (state.pendingDice === 6 && state.profile.extraRollOnSix) return { state: passed };
  return { state: advance(passed) };
}

function advance(state: ManchGameState): ManchGameState {
  return {
    ...state,
    activePlayerIndex: (state.activePlayerIndex + 1) % state.players.length,
    pendingDice: null,
    consecutiveSixes: 0,
    turnNumber: state.turnNumber + 1,
  };
}

function captureAt(state: ManchGameState, playerIndex: number, progress: number): [number, number] | null {
  if (progress < 0 || progress >= MANCH_TRACK_LENGTH) return null;
  const cell = globalCell(state.players[playerIndex].colour, progress);
  if (state.profile.safeTrackIndices.includes(cell)) return null;
  for (let p = 0; p < state.players.length; p++) {
    if (p === playerIndex) continue;
    const enemy = state.players[p];
    for (let t = 0; t < 4; t++) {
      const position = enemy.tokens[t];
      if (position >= 0 && position < MANCH_TRACK_LENGTH &&
          globalCell(enemy.colour, position) === cell) {
        const count = enemy.tokens.filter((candidate) =>
          candidate >= 0 && candidate < MANCH_TRACK_LENGTH &&
          globalCell(enemy.colour, candidate) === cell).length;
        if (count === 1) return [p, t];
      }
    }
  }
  return null;
}

function destinationAllowed(state: ManchGameState, move: ManchMove): boolean {
  if (move.toProgress >= MANCH_TRACK_LENGTH) return true;
  const colour = state.players[move.playerIndex].colour;
  const cell = globalCell(colour, move.toProgress);
  const friendly = state.players[move.playerIndex].tokens.filter((position) =>
    position >= 0 && position < MANCH_TRACK_LENGTH &&
    globalCell(colour, position) === cell).length;
  if (!state.profile.friendlyStackingEnabled && friendly > 0) return false;

  let enemyCount = 0;
  for (let p = 0; p < state.players.length; p++) {
    if (p === move.playerIndex) continue;
    for (const position of state.players[p].tokens) {
      if (position >= 0 && position < MANCH_TRACK_LENGTH &&
          globalCell(state.players[p].colour, position) === cell) enemyCount++;
    }
  }
  return !(enemyCount >= 2 && state.profile.blockadesEnabled &&
    state.profile.blockadeBlocksOpponents);
}

function pathOpen(state: ManchGameState, move: ManchMove): boolean {
  if (!state.profile.blockadesEnabled || !state.profile.blockadeBlocksOpponents ||
      move.fromProgress < 0 || move.fromProgress >= MANCH_TRACK_LENGTH) return true;
  const colour = state.players[move.playerIndex].colour;
  for (let step = 1; step <= move.toProgress - move.fromProgress; step++) {
    const progress = move.fromProgress + step;
    if (progress >= MANCH_TRACK_LENGTH) break;
    const cell = globalCell(colour, progress);
    let count = 0;
    for (let p = 0; p < state.players.length; p++) {
      if (p === move.playerIndex) continue;
      for (const token of state.players[p].tokens) {
        if (token >= 0 && token < MANCH_TRACK_LENGTH &&
            globalCell(state.players[p].colour, token) === cell) count++;
      }
    }
    if (count >= 2) return false;
  }
  return true;
}

function globalCell(colour: ManchColour, progress: number): number {
  return (STARTS[colour] + progress) % MANCH_TRACK_LENGTH;
}

function cloneProfile(profile: ManchRuleProfile): ManchRuleProfile {
  return {
    ...profile,
    entryFaces: [...profile.entryFaces],
    safeTrackIndices: [...profile.safeTrackIndices],
  };
}
