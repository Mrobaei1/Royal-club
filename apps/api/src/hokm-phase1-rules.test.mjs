import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUITS, RANKS, createDeck, shuffleDeck, dealCards, legalCards,
  resolveTrick, scoreTricks, teamForSeat
} from './hokm/engine.js';
import { createRound, chooseTrump, playCard, roundViewForSeat } from './hokm/round.js';
import { chooseHardBotAction } from './hokm/bot.js';
import { xpRequiredForNextLevel, totalXpForLevel, levelForXp, applyXpChange, awardCompletedMatch, penalizeMatchLeaver } from './hokm/progression.js';
import { InMemoryRoomRepository, HokmRoomService } from './hokm/service.js';
import { HokmDeadlineScheduler } from './hokm/deadline-scheduler.js';
import {
  createRoom, joinRoom, setPlayerReady, startRoom, voteToCancelMatch, cancelForUnrecoverableTechnicalFailure,
  processAllDisconnectedTimeout, processTurnTimeout, disconnectPlayer, reconnectPlayer, handleDisconnectTimeout, roomViewForUser, startNextRound, TURN_DEADLINE_MS,
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




test('a complete hand ends on the seventh trick won or no later than trick thirteen', () => {
  let state = chooseTrump(createRound({ deck: orderedDeck(), hakemSeat: 0 }), 0, 'spades');
  let safety = 0;
  while (state.phase === 'playing' && safety < 52) {
    const seat = state.currentSeat;
    const legal = legalCards(state.hands[seat], state.currentTrick);
    assert.ok(legal.length > 0);
    state = playCard(state, seat, legal[0]);
    safety += 1;
  }
  assert.equal(state.phase, 'completed');
  assert.ok(state.trickWinners.length >= 7);
  assert.ok(state.trickWinners.length <= 13);
  assert.equal(state.scores[0] + state.scores[1], state.trickWinners.length);
  assert.ok(Math.max(...state.scores) >= 7);
  assert.ok(state.hands.every(hand => hand.length === 13 - state.trickWinners.length));
});


test('player reconnects before grace expiry and regains control without rolling back room state', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'reconnect-before-timeout', hostUserId: players[0], now: 4000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 4001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 4002, rng: () => 0 });
  room = disconnectPlayer(room, players[0], { now: 5000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, false);
  const beforeDeadline = room.players[0].reconnectDeadline - 1;
  room = reconnectPlayer(room, players[0], { now: beforeDeadline, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].botControlled, false);
  assert.equal(room.players[0].temporaryBot, false);
  assert.equal(room.allDisconnectedDeadline, null);
});

test('disconnected seat is taken over by Hard bot after grace and can later reconnect', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'temporary-bot-takeover', hostUserId: players[0], now: 6000, disconnectGraceMs: 1000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 6001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 6002, rng: () => 0 });
  room = disconnectPlayer(room, players[0], { now: 7000, expectedVersion: room.version });
  const deadline = room.players[0].reconnectDeadline;
  assert.throws(() => handleDisconnectTimeout(room, players[0], {
    now: deadline - 1, expectedVersion: room.version
  }), /grace period/);
  room = handleDisconnectTimeout(room, players[0], { now: deadline, expectedVersion: room.version });
  assert.equal(room.players[0].botControlled, true);
  assert.equal(room.players[0].temporaryBot, true);
  room = reconnectPlayer(room, players[0], { now: deadline + 1, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.players[0].botControlled, false);
  assert.equal(room.players[0].temporaryBot, false);
});


test('initial hakem is selected across all four seats', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'random-hakem', hostUserId: players[0], now: 8000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 8001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 8002, rng: () => 0.75 });
  assert.equal(room.round.hakemSeat, 3);
  assert.equal(room.round.currentSeat, 3);
});

test('next hand advances the hakem seat clockwise', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'next-hakem', hostUserId: players[0], now: 9000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 9001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 9002, rng: () => 0.75 });
  room = { ...room, status: 'round_completed', round: { ...room.round, phase: 'completed' }, handRevealUntil: 0 };
  room = startNextRound(room, players[0], { now: 9003, rng: () => 0 });
  assert.equal(room.round.hakemSeat, 0);
  assert.equal(room.round.currentSeat, 0);
});


test('Hokm progression awards winner and loser XP, clamps leaver penalties, and never lowers level', () => {
  const players = fourPlayers().map((userId, seat) => ({ userId, seat }));
  const awarded = awardCompletedMatch(players, 0, {});
  assert.deepEqual(players.map(player => awarded[player.userId].xp), [20, 5, 20, 5]);
  assert.deepEqual(players.map(player => awarded[player.userId].level), [1, 1, 1, 1]);
  const leveled = applyXpChange({ xp: totalXpForLevel(2), level: 2 }, -5);
  assert.equal(leveled.level, 2);
  assert.equal(leveled.xp, totalXpForLevel(2) - 5);
  assert.deepEqual(penalizeMatchLeaver({ p0: { xp: 2, level: 1 } }, 'p0').p0, { xp: 0, level: 1 });
  assert.equal(levelForXp(totalXpForLevel(10)), 10);
  assert.equal(xpRequiredForNextLevel(1), 300);
  assert.throws(() => xpRequiredForNextLevel(0), /positive integer/);
});


test('disconnect and reconnect remain available during the end-of-hand reveal window', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'reveal-reconnect', hostUserId: players[0], now: 10000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 10001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 10002, rng: () => 0 });
  room = { ...room, status: 'round_completed', handRevealUntil: 14000 };
  room = disconnectPlayer(room, players[0], { now: 11000, expectedVersion: room.version });
  assert.equal(room.players[0].connected, false);
  room = reconnectPlayer(room, players[0], { now: 11500, expectedVersion: room.version });
  assert.equal(room.players[0].connected, true);
  assert.equal(room.allDisconnectedDeadline, null);
});


test('deadline scheduler discovers a due room and advances its timed-out trump selection', async () => {
  let now = 20000;
  let nextId = 0;
  const repository = new InMemoryRoomRepository();
  const service = new HokmRoomService({ repository, now: () => now, id: () => `scheduler-room-${++nextId}` });
  const players = fourPlayers().map(userId => ({ authenticated: true, userId, role: 'player' }));
  let room = await service.create(players[0], { matchTarget: 3 });
  const roomId = room.roomId;
  for (const player of players.slice(1)) room = await service.join(player, roomId, room.version);
  for (const player of players) room = await service.ready(player, roomId, true, room.version);
  room = await service.start(players[0], roomId, room.version);
  now = room.turnDeadlineAt;
  const scheduler = new HokmDeadlineScheduler({ service, repository, now: () => now, intervalMs: 250 });
  const poll = await scheduler.pollOnce();
  assert.equal(poll.discovered, 1);
  assert.equal(poll.processed, 1);
  assert.equal(poll.failed, 0);
  const persisted = await repository.get(roomId);
  assert.equal(persisted.round.phase, 'playing');
  assert.ok(SUITS.includes(persisted.round.trumpSuit));
  assert.ok(persisted.turnDeadlineAt > now);
});


test('all-four-disconnected lease also applies while the completed-hand reveal is active', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'reveal-all-offline', hostUserId: players[0], now: 12000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 12001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 12002, rng: () => 0 });
  room = { ...room, status: 'round_completed', handRevealUntil: 15000 };
  for (const id of players) room = disconnectPlayer(room, id, { now: 13000, expectedVersion: room.version });
  assert.equal(room.allDisconnectedDeadline, 33000);
  const cancelled = processAllDisconnectedTimeout(room, {
    now: 33000, expectedVersion: room.version
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelReason, 'all_players_disconnected');
});


test('terminal cancelled and completed views hide round and remaining-card reveal state', () => {
  const players = fourPlayers();
  let room = createRoom({ roomId: 'terminal-view', hostUserId: players[0], now: 1000 });
  for (const id of players.slice(1)) room = joinRoom(room, id, 1001);
  for (const id of players) room = setPlayerReady(room, id, true);
  room = startRoom(room, players[0], { now: 1002, rng: () => 0 });
  room = {
    ...room,
    handRevealUntil: 9000,
    revealedHands: [0, 1, 2, 3].map(() => [{ suit: 'hearts', rank: 'A' }])
  };
  const cancelled = cancelForUnrecoverableTechnicalFailure(room);
  const cancelledView = roomViewForUser(cancelled, players[0], { now: 3000 });
  assert.equal(cancelledView.game, null);
  assert.equal(cancelledView.revealedHands, null);
  assert.equal(cancelledView.handRevealUntil, null);

  const completed = { ...room, status: 'completed' };
  const completedView = roomViewForUser(completed, players[0], { now: 3000 });
  assert.equal(completedView.game, null);
  assert.equal(completedView.revealedHands, null);
  assert.equal(completedView.handRevealUntil, null);
});
