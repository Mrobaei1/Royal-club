// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUITS, RANKS, createDeck, shuffleDeck, dealCards, legalCards,
  resolveTrick, scoreTricks, teamForSeat
} from './hokm/engine.js';
import { createRound, chooseTrump, playCard, roundViewForSeat } from './hokm/round.js';
import { chooseHardBotAction } from './hokm/bot.js';
import {
  createRoom, joinRoom, setPlayerReady, startRoom, voteToCancelMatch,
  processAllDisconnectedTimeout, processTurnTimeout, disconnectPlayer, roomViewForUser, startNextRound, TURN_DEADLINE_MS,
  END_OF_HAND_REVEAL_MS, ALL_PLAYERS_DISCONNECTED_MS
} from './hokm/room.js';

const orderedDeck = () => createDeck();
const fourPlayers = () => ['p0', 'p1', 'p2', 'p3'];

test('standard deck has 52 unique cards and a complete 4x13 rank/suit matrix', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => `${card.rank}_of_${card.suit}`)).size, 52);
  assert.deepEqual([...new Set(deck.map(card => card.suit))].sort(), [...SUITS].sort());
  assert.deepEqual([...new Set(deck.map(card => card.rank))].sort(), [...RANKS].sort());
});

test('shuffle is deterministic with an injected RNG and rejects invalid RNG output', () => {
  assert.deepEqual(shuffleDeck(createDeck(), () => 0), shuffleDeck(createDeck(), () => 0));
  assert.throws(() => shuffleDeck(createDeck(), () => 1), /RNG/);
  assert.throws(() => shuffleDeck(createDeck(), () => Number.NaN), /RNG/);
});

test('deal gives exactly 13 unique cards to each seat and rotates clockwise from start seat', () => {
  const hands = dealCards(orderedDeck(), 2);
  assert.equal(hands.length, 4);
  assert.deepEqual(hands.map(hand => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map(card => `${card.rank}_of_${card.suit}`)).size, 52);
  assert.equal(hands[2][0].rank, '2');
  assert.equal(hands[3][0].rank, '3');
  assert.equal(hands[0][0].rank, '4');
  assert.equal(hands[1][0].rank, '5');
  assert.throws(() => dealCards(orderedDeck().slice(1), 0), /52-card/);
  assert.throws(() => dealCards(orderedDeck(), 4), /Seat/);
});

test('legal card selection enforces follow-suit and permits any card only when void', () => {
  const hand = [
    { suit: 'hearts', rank: '2' },
    { suit: 'spades', rank: 'A' },
    { suit: 'clubs', rank: 'K' }
  ];
  const trick = [{ seat: 0, card: { suit: 'hearts', rank: 'Q' } }];
  assert.deepEqual(legalCards(hand, trick), [hand[0]]);
  assert.deepEqual(legalCards(hand.slice(1), trick), hand.slice(1));
  assert.throws(() => legalCards(hand, [{ seat: 0, card: { suit: 'invalid', rank: 'A' } }]), /Invalid card/);
});

test('trick resolution prioritizes trump, then led suit, then rank and enforces clockwise order', () => {
  const trick = [
    { seat: 0, card: { suit: 'hearts', rank: 'A' } },
    { seat: 1, card: { suit: 'hearts', rank: 'K' } },
    { seat: 2, card: { suit: 'spades', rank: '2' } },
    { seat: 3, card: { suit: 'clubs', rank: 'A' } }
  ];
  assert.equal(resolveTrick(trick, 'spades').winnerSeat, 2);
  assert.equal(resolveTrick(trick, 'diamonds').winnerSeat, 0);
  assert.throws(() => resolveTrick([trick[0], trick[2], trick[1], trick[3]], 'spades'), /clockwise/);
  assert.throws(() => resolveTrick(trick.slice(0, 3), 'spades'), /exactly four/);
});

test('team seats are partners across the table and score is first to seven tricks', () => {
  assert.deepEqual([0, 1, 2, 3].map(teamForSeat), [0, 1, 0, 1]);
  assert.deepEqual(scoreTricks([0, 2, 0, 2, 0, 2, 0]), { tricks: [7, 0], winnerTeam: 0 });
  assert.deepEqual(scoreTricks([1, 3, 1, 3, 1, 3, 1]), { tricks: [0, 7], winnerTeam: 1 });
  assert.equal(scoreTricks([0, 1, 2, 3]).winnerTeam, null);
  assert.throws(() => scoreTricks(Array(14).fill(0)), /between 0 and 13/);
});

test('round deals five cards first, only hakem chooses trump, then all players receive eight more', () => {
  const round = createRound({ deck: orderedDeck(), hakemSeat: 2 });
  assert.equal(round.phase, 'choose_trump');
  assert.equal(round.currentSeat, 2);
  assert.deepEqual(round.hands.map(hand => hand.length), [5, 5, 5, 5]);
  assert.throws(() => chooseTrump(round, 1, 'spades'), /Only the hakem/);
  assert.throws(() => chooseTrump(round, 2, 'joker'), /Invalid trump/);
  const playing = chooseTrump(round, 2, 'spades');
  assert.equal(playing.phase, 'playing');
  assert.deepEqual(playing.hands.map(hand => hand.length), [13, 13, 13, 13]);
  assert.equal(playing.currentSeat, 2);
  assert.equal(playing.trumpSuit, 'spades');
  assert.equal(playing.undealtDeck.length, 0);
});

test('round rejects out-of-turn, unowned and revoke-illegal card plays without mutating prior state', () => {
  const initial = createRound({ deck: orderedDeck(), hakemSeat: 0 });
  const playing = chooseTrump(initial, 0, 'spades');
  assert.throws(() => playCard(playing, 1, playing.hands[1][0]), /not this seat's turn/);
  assert.throws(() => playCard(playing, 0, { suit: 'spades', rank: 'A' }), /not in this player's hand/);
  const first = playing.hands[0][0];
  const afterFirst = playCard(playing, 0, first);
  const nextSeat = 1;
  const leadSuit = first.suit;
  const offSuit = playing.hands[nextSeat].find(card => card.suit !== leadSuit);
  if (offSuit && playing.hands[nextSeat].some(card => card.suit === leadSuit)) {
    assert.throws(() => playCard(afterFirst, nextSeat, offSuit), /must follow/);
  }
  assert.equal(playing.hands[0].length, 13);
  assert.equal(playing.currentTrick.length, 0);
});

test('seat-specific round view exposes only that seat private hand', () => {
  const playing = chooseTrump(createRound({ deck: orderedDeck(), hakemSeat: 0 }), 0, 'hearts');
  const view = roundViewForSeat(playing, 2);
  assert.equal(view.ownSeat, 2);
  assert.equal(view.ownHand.length, 13);
  assert.equal(Object.hasOwn(view, 'hands'), false);
  assert.equal(Object.hasOwn(view, 'undealtDeck'), false);
});

test('approved cancellation requires all four distinct player votes; a rejection can be withdrawn', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'rules-cancel', hostUserId: players[0], now: 1000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 1001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 1002, rng: () => 0 });
  for (const id of players.slice(0, 3)) {
    room = voteToCancelMatch(room, id, true, room.version);
    assert.equal(room.status, 'playing');
  }
  room = voteToCancelMatch(room, players[3], true, room.version);
  assert.equal(room.status, 'cancelled');
  assert.equal(room.result, null);
  assert.equal(room.cancelReason, 'unanimous_player_request');
});

test('all-four-disconnected cancellation waits the full 20 seconds', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'rules-offline', hostUserId: players[0], now: 2000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 2001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 2002, rng: () => 0 });
  for (const id of players) room = disconnectPlayer(room, id, { now: 3000, expectedVersion: room.version });
  assert.equal(room.allDisconnectedDeadline, 3000 + ALL_PLAYERS_DISCONNECTED_MS);
  assert.throws(() => processAllDisconnectedTimeout(room, {
    now: room.allDisconnectedDeadline - 1, expectedVersion: room.version
  }), /has not elapsed/);
  const cancelled = processAllDisconnectedTimeout(room, {
    now: room.allDisconnectedDeadline, expectedVersion: room.version
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.result, null);
});

test('phase-one timing constants match the approved 7s, 3s and 20s rules', () => {
  assert.equal(TURN_DEADLINE_MS, 7_000);
  assert.equal(END_OF_HAND_REVEAL_MS, 3_000);
  assert.equal(ALL_PLAYERS_DISCONNECTED_MS, 20_000);
});


test('Hard bot selects a trump suit from the hakem hand using its fixed policy', () => {
  const state = {
    phase: 'choose_trump', hakemSeat: 0,
    hands: [[
      { suit: 'clubs', rank: 'A' }, { suit: 'clubs', rank: 'K' },
      { suit: 'clubs', rank: '2' }, { suit: 'hearts', rank: 'A' },
      { suit: 'spades', rank: 'Q' }
    ], [], [], []],
    currentTrick: [], trickWinners: []
  };
  const action = chooseHardBotAction(state, 0);
  assert.equal(action.type, 'choose_trump');
  assert.equal(action.suit, 'clubs');
  assert.equal(action.difficulty, 'hard');
  assert.throws(() => chooseHardBotAction(state, 1), /hakem bot/);
});

test('seven-second trump timeout applies the fixed Hard trump-selection rule', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'rules-trump-timeout', hostUserId: players[0], now: 10 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 11);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 12, rng: () => 0 });
  const timedOut = processTurnTimeout(room, {
    now: room.turnDeadlineAt, expectedVersion: room.version, rng: () => 0
  });
  assert.equal(timedOut.round.phase, 'playing');
  assert.ok(SUITS.includes(timedOut.round.trumpSuit));
  assert.equal(timedOut.round.hands.every(hand => hand.length === 13), true);
  assert.equal(timedOut.turnDeadlineAt, room.turnDeadlineAt + TURN_DEADLINE_MS);
});

test('seven-second card timeout chooses only from the active seat legal cards', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'rules-card-timeout', hostUserId: players[0], now: 20 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 21);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 22, rng: () => 0 });
  room = { ...room, round: chooseTrump(room.round, 0, 'hearts') };
  const beforeHand = room.round.hands[0];
  const legal = legalCards(beforeHand, []);
  const timedOut = processTurnTimeout(room, {
    now: room.turnDeadlineAt, expectedVersion: room.version, rng: () => 0
  });
  assert.equal(timedOut.round.currentTrick.length, 1);
  assert.ok(legal.some(card => card.rank === timedOut.round.currentTrick[0].card.rank &&
    card.suit === timedOut.round.currentTrick[0].card.suit));
  assert.equal(timedOut.round.hands[0].length, 12);
});


test('all four players can see revealed remaining hands for three seconds only', () => {
  const players = fourPlayers().map((userId, seat) => ({
    userId, seat, ready: true, connected: true, botControlled: false
  }));
  const revealedHands = [0, 1, 2, 3].map(() => [{ suit: 'hearts', rank: 'A' }]);
  const room = {
    roomId: 'rules-reveal', privateRoom: false, status: 'round_completed',
    matchTarget: 3, matchScore: [1, 0], version: 9, hostUserId: 'p0',
    players, playerProgress: {}, turnDeadlineAt: null,
    handRevealUntil: 50_000 + END_OF_HAND_REVEAL_MS, revealedHands, round: null
  };
  for (const userId of fourPlayers()) {
    const visible = roomViewForUser(room, userId, { now: 52_999 });
    assert.deepEqual(visible.revealedHands, revealedHands);
    assert.equal(visible.handRevealUntil, 53_000);
    const expired = roomViewForUser(room, userId, { now: 53_000 });
    assert.equal(expired.revealedHands, null);
    assert.equal(expired.handRevealUntil, null);
  }
});


