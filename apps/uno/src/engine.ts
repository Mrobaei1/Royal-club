import { randomBytes, randomInt } from 'node:crypto';
import { UNO_COLORS, UnoError, type GameAction, type UnoCard, type UnoColor, type UnoGame } from './model.js';

const cardId = () => randomBytes(9).toString('base64url');
export function createDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  for (const color of UNO_COLORS) {
    deck.push({ id: cardId(), color, face: 0 });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: cardId(), color, face: n }, { id: cardId(), color, face: n });
    }
    for (const face of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ id: cardId(), color, face }, { id: cardId(), color, face });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: cardId(), color: 'wild', face: 'wild' }, { id: cardId(), color: 'wild', face: 'wild4' });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}
function nextIndex(index: number, direction: 1 | -1, length: number): number {
  return (index + direction + length) % length;
}
function refillDrawPile(game: UnoGame): void {
  if (game.drawPile.length || game.discardPile.length <= 1) return;
  const top = game.discardPile.pop()!;
  const rest = game.discardPile.splice(0);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  game.drawPile = rest;
  game.discardPile = [top];
}
function drawOne(game: UnoGame, playerIndex: number): UnoCard {
  refillDrawPile(game);
  const card = game.drawPile.pop();
  if (!card) throw new UnoError('DRAW_PILE_EMPTY', 'No cards remain to draw.');
  game.players[playerIndex]!.hand.push(card);
  return card;
}
function currentPlayer(game: UnoGame) { return game.players[game.currentPlayerIndex]!; }
function cardIsPlayable(card: UnoCard, game: UnoGame): boolean {
  const top = game.discardPile.at(-1)!;
  return card.color === 'wild' || card.color === game.activeColor || card.face === top.face;
}
function advance(game: UnoGame, steps = 1): void {
  game.currentPlayerIndex = nextIndex(game.currentPlayerIndex, game.direction, game.players.length);
  for (let i = 1; i < steps; i++) game.currentPlayerIndex = nextIndex(game.currentPlayerIndex, game.direction, game.players.length);
  game.drawnCardId = null;
  game.turnNumber++;
}
export function startUnoGame(players: Array<{ id: string; username: string }>): UnoGame {
  if (players.length < 2 || players.length > 6) throw new UnoError('INVALID_PLAYER_COUNT', 'UNO requires 2 to 6 players.');
  if (new Set(players.map(p => p.id)).size !== players.length) throw new UnoError('DUPLICATE_PLAYER', 'Players must be unique.');
  const deck = createDeck();
  const gamePlayers = players.map(p => ({ ...p, hand: deck.splice(0, 7) }));
  let first = deck.pop()!;
  while (first.color === 'wild' || typeof first.face !== 'number') {
    deck.unshift(first);
    first = deck.pop()!;
  }
  return {
    players: gamePlayers, drawPile: deck, discardPile: [first], currentPlayerIndex: 0,
    direction: 1, activeColor: first.color as UnoColor, drawnCardId: null,
    unoPendingPlayerId: null, pendingWild4: null, winnerId: null, turnNumber: 1,
  };
}
export function applyUnoAction(source: UnoGame, playerId: string, action: GameAction): UnoGame {
  const game: UnoGame = structuredClone(source);
  if (game.winnerId) throw new UnoError('GAME_FINISHED', 'This game has already finished.');
  const index = game.players.findIndex(p => p.id === playerId);
  if (index < 0) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
  const player = game.players[index]!;
  if (action.type === 'callUno') {
    if (player.hand.length !== 1 || game.unoPendingPlayerId !== playerId) {
      throw new UnoError('UNO_NOT_AVAILABLE', 'UNO can only be called after playing down to one card.');
    }
    game.unoPendingPlayerId = null;
    return game;
  }
  if (action.type === 'catchUno') {
    if (!game.unoPendingPlayerId || game.unoPendingPlayerId === playerId) {
      throw new UnoError('CATCH_NOT_AVAILABLE', 'There is no opponent to catch right now.');
    }
    const offender = game.players.find(p => p.id === game.unoPendingPlayerId);
    if (!offender || offender.hand.length !== 1) throw new UnoError('CATCH_NOT_AVAILABLE', 'The UNO call window has closed.');
    for (let i = 0; i < 2; i++) drawOne(game, game.players.findIndex(p => p.id === offender.id));
    game.unoPendingPlayerId = null;
    return game;
  }
  if (index !== game.currentPlayerIndex) throw new UnoError('NOT_YOUR_TURN', 'It is not your turn.');
  if (game.unoPendingPlayerId) game.unoPendingPlayerId = null;
  if (action.type === 'challengeWild4') {
    const pending = game.pendingWild4;
    if (!pending || pending.targetId !== playerId) throw new UnoError('CHALLENGE_NOT_AVAILABLE', 'There is no Wild Draw Four challenge available to you.');
    if (pending.offenderHadActiveColor) {
      const offenderIndex = game.players.findIndex(p => p.id === pending.offenderId);
      for (let i = 0; i < 4; i++) drawOne(game, offenderIndex);
      game.currentPlayerIndex = offenderIndex;
      game.drawnCardId = null;
      game.turnNumber++;
    } else {
      for (let i = 0; i < 6; i++) drawOne(game, index);
      game.pendingWild4 = null;
      advance(game);
    }
    game.pendingWild4 = null;
    return game;
  }
  if (action.type === 'draw') {
    if (game.pendingWild4?.targetId === playerId) {
      for (let i = 0; i < 4; i++) drawOne(game, index);
      game.pendingWild4 = null;
      advance(game);
      return game;
    }
    if (game.drawnCardId) throw new UnoError('ALREADY_DREW', 'You have already drawn this turn.');
    const card = drawOne(game, index);
    game.drawnCardId = card.id;
    return game;
  }
  if (game.pendingWild4?.targetId === playerId) {
    throw new UnoError('WILD4_RESPONSE_REQUIRED', 'Accept the four-card penalty or challenge the Wild Draw Four first.');
  }
  if (action.type === 'pass') {
    if (!game.drawnCardId) throw new UnoError('MUST_DRAW_OR_PLAY', 'Draw a card before passing.');
    advance(game);
    return game;
  }
  const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
  if (cardIndex < 0) throw new UnoError('CARD_NOT_IN_HAND', 'That card is not in your hand.');
  const card = player.hand[cardIndex]!;
  if (game.drawnCardId && card.id !== game.drawnCardId) throw new UnoError('MUST_PLAY_DRAWN_CARD', 'After drawing, you may only play the card you just drew.');
  if (!cardIsPlayable(card, game)) throw new UnoError('ILLEGAL_CARD', 'That card does not match the active color or top value.');
  if (card.color === 'wild' && (!action.chosenColor || !UNO_COLORS.includes(action.chosenColor))) {
    throw new UnoError('CHOOSE_COLOR', 'Choose one of the four valid colors for a wild card.');
  }
  const offenderHadActiveColor = card.face === 'wild4' && player.hand.some(c => c.id !== card.id && c.color === game.activeColor);
  player.hand.splice(cardIndex, 1);
  game.discardPile.push(card);
  if (card.color !== 'wild') game.activeColor = card.color;
  else game.activeColor = action.chosenColor!;
  let skip = 0;
  if (card.face === 'reverse') {
    game.direction = game.direction === 1 ? -1 : 1;
    if (game.players.length === 2) skip = 1;
  } else if (card.face === 'skip') skip = 1;
  else if (card.face === 'draw2') {
    const target = nextIndex(index, game.direction, game.players.length);
    for (let i = 0; i < 2; i++) drawOne(game, target);
    skip = 1;
  } else if (card.face === 'wild4') {
    const target = nextIndex(index, game.direction, game.players.length);
    game.pendingWild4 = { offenderId: playerId, targetId: game.players[target]!.id, offenderHadActiveColor };
  }
  if (player.hand.length === 0) {
    game.winnerId = player.id;
    game.unoPendingPlayerId = null;
    game.pendingWild4 = null;
    return game;
  }
  if (player.hand.length === 1) game.unoPendingPlayerId = player.id;
  if (card.face !== 'wild4') advance(game, 1 + skip);
  else {
    game.currentPlayerIndex = nextIndex(index, game.direction, game.players.length);
    game.drawnCardId = null;
    game.turnNumber++;
  }
  return game;
}
export function publicGameState(game: UnoGame) {
  const top = game.discardPile.at(-1);
  if (!top) throw new UnoError('INVALID_GAME', 'The discard pile is empty.');
  return {
    players: game.players.map(p => ({ id: p.id, username: p.username, cardCount: p.hand.length })),
    discardTop: top, currentPlayerId: currentPlayer(game).id, activeColor: game.activeColor,
    direction: game.direction, drawCount: game.drawPile.length, winnerId: game.winnerId,
    turnNumber: game.turnNumber, unoPendingPlayerId: game.unoPendingPlayerId, pendingWild4: game.pendingWild4 ? { offenderId: game.pendingWild4.offenderId, targetId: game.pendingWild4.targetId } : null,
  };
}
export function privateTurnState(game: UnoGame, playerId: string) {
  const index = game.players.findIndex(p => p.id === playerId);
  if (index < 0) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
  return { drawnCardId: index === game.currentPlayerIndex ? game.drawnCardId : null };
}
export function privateHand(game: UnoGame, playerId: string): UnoCard[] {
  const player = game.players.find(p => p.id === playerId);
  if (!player) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
  return structuredClone(player.hand);
}
