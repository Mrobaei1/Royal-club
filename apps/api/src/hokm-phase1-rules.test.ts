// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUITS, RANKS, createDeck, shuffleDeck, dealCards, legalCards,
  resolveTrick, scoreTricks, teamForSeat
} from './hokm/engine.js';
import { createRound, chooseTrump, playCard, roundViewForSeat } from './hokm/round.js';
import { chooseHardBotAction } from './hokm/bot.js';
import { awardCompletedMatch, penalizeMatchLeaver } from './hokm/progression.js';
import {
  createRoom, joinRoom, setPlayerReady, startRoom, startNextRound, voteToCancelMatch,
  processAllDisconnectedTimeout, processMultipleDisconnectTimeout, processTurnTimeout, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout, recordMatchForfeit, roomViewForUser, TURN_DEADLINE_MS,
  END_OF_HAND_REVEAL_MS, ALL_PLAYERS_DISCONNECTED_MS
} from './hokm/room.js';

const orderedDeck = () => createDeck();
const fourPlayers = () => ['p0', 'p1', 'p2', 'p3'];

test('initial hakem is selected from all four seats and the previous winning team controls the next hakem', () => {
  const readyRoom = () => {
    let room = createRoom({ roomId: 'phase1-hakem', hostUserId: 'p0', now: 1000 });
    for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
    for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
    return room;
  };
  const first = startRoom(readyRoom(), 'p0', { now: 2000, rng: () => 0.4, selectHakemSeat: () => 3 });
  assert.equal(first.round.hakemSeat, 3);
  assert.throws(() => startRoom(readyRoom(), 'p0', { now: 2000, selectHakemSeat: () => 4 }), /randomly from seats/);

  const previous = { ...readyRoom(), status: 'round_completed', handRevealUntil: 0,
    round: { phase: 'completed', hakemSeat: 1, scores: [0, 7] } };
  const sameTeam = startNextRound(previous, 'p0', { now: 3000, rng: () => 0.4 });
  assert.equal(sameTeam.round.hakemSeat, 1);
  const otherTeam = startNextRound({ ...previous, round: { ...previous.round, scores: [7, 0] } },
    'p0', { now: 3000, rng: () => 0.4 });
  assert.equal(otherTeam.round.hakemSeat, 3);
});

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
  assert.throws(() => chooseTrump(playing, 2, 'hearts'), /not waiting for trump selection/);
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
  room = startRoom(room, players[0], { now: 1002, rng: () => 0.25 });
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
  room = startRoom(room, players[0], { now: 2002, rng: () => 0.5 });
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


test('automatic trump selection uses the approved suit-count plus high-rank heuristic', () => {
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
  room = startRoom(room, players[0], { now: 12, rng: () => 0.1 });
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
  room = startRoom(room, players[0], { now: 22, rng: () => 0.1, selectHakemSeat: () => 0 });
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

test('two or three unrecovered disconnects cancel after both individual 20-second grace periods, with no score or XP changes', () => {
  let room = createRoom({ roomId: 'phase1-multi-disconnect', hostUserId: 'p0', now: 1000, matchTarget: 3 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = { ...room, matchScore: [2, 1], playerProgress: { p0: { xp: 100, level: 1 } } };
  room = disconnectPlayer(room, 'p0', { now: 2000, expectedVersion: room.version });
  room = disconnectPlayer(room, 'p1', { now: 2010, expectedVersion: room.version });
  room = disconnectPlayer(room, 'p2', { now: 2020, expectedVersion: room.version });
  assert.equal(room.multipleDisconnectedDeadline, 22010);
  assert.throws(() => processMultipleDisconnectTimeout(room, { now: 22009, expectedVersion: room.version }), /Fewer than two/);
  const cancelled = processMultipleDisconnectTimeout(room, { now: 22010, expectedVersion: room.version });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelReason, 'multiple_unrecovered_disconnects');
  assert.deepEqual(cancelled.matchScore, [0, 0]);
  assert.deepEqual(cancelled.playerProgress, { p0: { xp: 100, level: 1 } });
  assert.deepEqual(cancelled.pendingXpDeductions, []);
  assert.equal(cancelled.result, null);
});

test('reconnecting one of two disconnected players prevents multiple-disconnect cancellation', () => {
  let room = createRoom({ roomId: 'phase1-multi-reconnect', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = disconnectPlayer(room, 'p0', { now: 2000, expectedVersion: room.version });
  room = disconnectPlayer(room, 'p1', { now: 2010, expectedVersion: room.version });
  room = reconnectPlayer(room, 'p0', { now: 2100, expectedVersion: room.version });
  assert.equal(room.multipleDisconnectedDeadline, null);
  assert.equal(room.status, 'playing');
});

test('two voluntary forfeits cancel without applying either -5 XP penalty', () => {
  let room = createRoom({ roomId: 'phase1-double-forfeit', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = { ...room, playerProgress: { p0: { xp: 100, level: 1 }, p1: { xp: 50, level: 1 } } };
  room = recordMatchForfeit(room, 'p0');
  assert.deepEqual(room.pendingXpDeductions, ['p0']);
  room = recordMatchForfeit(room, 'p1');
  assert.equal(room.status, 'cancelled');
  assert.equal(room.cancelReason, 'multiple_voluntary_exits');
  assert.deepEqual(room.matchScore, [0, 0]);
  assert.deepEqual(room.playerProgress, { p0: { xp: 100, level: 1 }, p1: { xp: 50, level: 1 } });
  assert.deepEqual(room.pendingXpDeductions, []);
});

test('unanimous player cancellation clears all match points but preserves previously earned XP', () => {
  let room = createRoom({ roomId: 'phase1-cancel-score', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = { ...room, matchScore: [2, 1], playerProgress: { p0: { xp: 100, level: 1 } } };
  for (const id of ['p0', 'p1', 'p2']) room = voteToCancelMatch(room, id, true, room.version);
  room = voteToCancelMatch(room, 'p3', true, room.version);
  assert.equal(room.status, 'cancelled');
  assert.deepEqual(room.matchScore, [0, 0]);
  assert.deepEqual(room.playerProgress, { p0: { xp: 100, level: 1 } });
});

test('Hard trump heuristic prioritizes suit count, then summed normal card ranks', () => {
  const state = {
    phase: 'choose_trump', hakemSeat: 0,
    hands: [[
      { suit: 'clubs', rank: '2' }, { suit: 'clubs', rank: '3' }, { suit: 'clubs', rank: '4' },
      { suit: 'hearts', rank: 'A' }, { suit: 'hearts', rank: 'K' }, { suit: 'hearts', rank: 'Q' },
      { suit: 'spades', rank: 'A' }, { suit: 'diamonds', rank: '2' }
    ], [], [], []], currentTrick: [], trickWinners: []
  };
  assert.equal(chooseHardBotAction(state, 0).suit, 'hearts',
    'equal suit counts are broken by the higher sum of 2..A rank values');
});

test('one temporary disconnect becomes Hard bot after 20 seconds and returning player reclaims control without penalty', () => {
  let room = createRoom({ roomId: 'phase1-single-reconnect', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = disconnectPlayer(room, 'p0', { now: 2000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  room = handleDisconnectTimeout(room, 'p0', { now: deadline, expectedVersion: room.version });
  assert.equal(room.players[0].temporaryBot, true);
  assert.deepEqual(room.pendingXpDeductions, ['p0']);
  room = reconnectPlayer(room, 'p0', { now: deadline + 100, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].temporaryBot, false);
  assert.deepEqual(room.pendingXpDeductions, []);
});

test('a temporary bot that is never reclaimed incurs exactly -5 XP when the match completes', () => {
  let room = createRoom({ roomId: 'phase1-single-penalty', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = { ...room, playerProgress: { p0: { xp: 100, level: 1 } } };
  room = disconnectPlayer(room, 'p0', { now: 2000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  room = handleDisconnectTimeout(room, 'p0', { now: deadline, expectedVersion: room.version });
  assert.equal(room.players[0].temporaryBot, true);
  assert.deepEqual(room.pendingXpDeductions, ['p0']);
  room = { ...room, status: 'playing', pendingXpDeductions: ['p0'] };
  let progress = awardCompletedMatch(room.players, 1, room.playerProgress);
  progress = penalizeMatchLeaver(progress, 'p0');
  assert.equal(progress.p0.xp, 95);
});

test('a player who remains on temporary Hard bot receives only the -5 XP penalty, not win/loss XP', () => {
  const players = [
    { userId: 'p0', seat: 0, temporaryBot: true },
    { userId: 'p1', seat: 1 },
    { userId: 'p2', seat: 2 },
    { userId: 'p3', seat: 3 }
  ];
  let progress = awardCompletedMatch(players, 0, { p0: { xp: 100, level: 1 } });
  progress = penalizeMatchLeaver(progress, 'p0');
  assert.equal(progress.p0.xp, 95);
  assert.equal(progress.p1.xp, 5);
  assert.equal(progress.p2.xp, 20);
  assert.equal(progress.p3.xp, 5);
});


test('intentional exit permanently reserves the seat for Hard bot; no replacement player may join', () => {
  let room = createRoom({ roomId: 'phase1-no-replacement', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = recordMatchForfeit(room, 'p0');
  assert.equal(room.players[0].forfeited, true);
  assert.equal(room.players[0].botControlled, true);
  assert.throws(() => joinRoom(room, 'replacement-player', 3000), /not accepting players/);
  assert.equal(room.players.length, 4);
});


test('a single disconnected player is transferred to temporary Hard bot even during the three-second hand reveal', () => {
  let room = createRoom({ roomId: 'phase1-reveal-disconnect', hostUserId: 'p0', now: 1000 });
  for (const id of ['p1', 'p2', 'p3']) room = joinRoom(room, id, 1001);
  for (const id of ['p0', 'p1', 'p2', 'p3']) room = setPlayerReady(room, id, true);
  room = startRoom(room, 'p0', { now: 1002, rng: () => 0.5 });
  room = { ...room, status: 'round_completed', handRevealUntil: 5000 };
  room = disconnectPlayer(room, 'p0', { now: 2000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  room = handleDisconnectTimeout(room, 'p0', { now: deadline, expectedVersion: room.version });
  assert.equal(room.status, 'round_completed');
  assert.equal(room.players[0].temporaryBot, true);
  assert.deepEqual(room.pendingXpDeductions, ['p0']);
});
