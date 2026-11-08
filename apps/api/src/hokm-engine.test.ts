import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeck,
  dealCards,
  legalCards,
  playerPrivateView,
  publicGameView,
  resolveTrick,
  scoreTricks,
  shuffleDeck,
} from './hokm/engine.js';

test('Hokm deck contains 52 unique cards and deterministic shuffle is reproducible', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => `${card.rank}_of_${card.suit}`)).size, 52);
  const first = shuffleDeck(deck, () => 0.5);
  const second = shuffleDeck(deck, () => 0.5);
  assert.deepEqual(first, second);
});

test('deal distributes thirteen cards to each seat without duplicates', () => {
  const hands = dealCards(createDeck(), 2);
  assert.deepEqual(hands.map((hand) => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map((card) => `${card.rank}_of_${card.suit}`)).size, 52);
});

test('legal card selection enforces following the led suit when possible', () => {
  const hand = [
    { suit: 'hearts' as const, rank: '2' as const },
    { suit: 'spades' as const, rank: 'A' as const },
  ];
  const trick = [{ seat: 0 as const, card: { suit: 'hearts' as const, rank: 'K' as const } }];
  assert.deepEqual(legalCards(hand, trick), [hand[0]]);
  assert.deepEqual(legalCards([hand[1]], trick), [hand[1]]);
});

test('trick resolution gives trump priority over a higher off-trump card', () => {
  const result = resolveTrick([
    { seat: 0, card: { suit: 'hearts', rank: 'K' } },
    { seat: 1, card: { suit: 'hearts', rank: 'A' } },
    { seat: 2, card: { suit: 'spades', rank: '2' } },
    { seat: 3, card: { suit: 'hearts', rank: 'Q' } },
  ], 'spades');
  assert.equal(result.winnerSeat, 2);
  assert.equal(result.winningTeam, 0);
});

test('seven tricks decide the hand and the client projection contains only its own hand', () => {
  assert.deepEqual(scoreTricks([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0]), {
    tricks: [7, 6],
    winnerTeam: 0,
  });
  const publicView = publicGameView({ phase: 'playing', currentSeat: 1, trumpSuit: 'clubs' });
  const privateView = playerPrivateView(publicView, 1, [{ suit: 'clubs', rank: 'A' }]);
  assert.deepEqual(privateView.hand, [{ suit: 'clubs', rank: 'A' }]);
  assert.equal('hands' in privateView, false);
  assert.equal('undealtDeck' in privateView, false);
});

test('invalid card, seat, and trick inputs are rejected', () => {
  assert.throws(() => dealCards(createDeck().slice(1)), TypeError);
  assert.throws(() => publicGameView({ phase: 'playing', currentSeat: 4 }), RangeError);
  assert.throws(() => resolveTrick([], 'spades'), RangeError);
});
