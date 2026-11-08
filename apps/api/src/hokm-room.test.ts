// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRoomCommand,
  createRoom,
  END_OF_HAND_REVEAL_MS,
  joinRoom,
  roomViewForUser,
} from './hokm/room.js';

function completedFinalHandFixture() {
  let room = createRoom({
    roomId: 'hokm-reveal-test',
    hostUserId: 'player-0',
    now: 1_000,
    matchTarget: 3,
  });
  for (let seat = 1; seat < 4; seat += 1) {
    room = joinRoom(room, `player-${seat}`, 1_000);
  }

  room.status = 'playing';
  room.matchScore = [2, 0];
  room.round = {
    phase: 'playing',
    hakemSeat: 0,
    currentSeat: 3,
    trumpSuit: 'spades',
    hands: [
      [{ suit: 'diamonds', rank: '2' }],
      [{ suit: 'clubs', rank: '2' }],
      [{ suit: 'diamonds', rank: '3' }],
      [{ suit: 'hearts', rank: '4' }],
    ],
    currentTrick: [
      { seat: 0, card: { suit: 'hearts', rank: 'A' } },
      { seat: 1, card: { suit: 'hearts', rank: '2' } },
      { seat: 2, card: { suit: 'hearts', rank: '3' } },
    ],
    completedTricks: [],
    trickWinners: [0, 2, 0, 2, 0, 2],
    scores: [6, 0],
    deckCursor: 52,
    seenCards: new Set(),
    undealtDeck: [],
  };
  return room;
}

test('all four players see remaining hands for exactly three seconds after the final hand', () => {
  const now = 1_000;
  const room = completedFinalHandFixture();

  for (let seat = 0; seat < 4; seat += 1) {
    const view = roomViewForUser(room, `player-${seat}`, { now });
    assert.equal(view.revealedHands, null);
    assert.ok(Array.isArray(view.game.ownHand));
    assert.equal('hands' in view.game, false);
  }

  const completed = applyRoomCommand(
    room,
    'player-3',
    { type: 'play_card', card: { suit: 'hearts', rank: '4' } },
    room.version,
    now,
  );

  assert.equal(completed.status, 'completed');
  assert.equal(completed.handRevealUntil, now + END_OF_HAND_REVEAL_MS);
  assert.deepEqual(completed.revealedHands.map(hand => hand.length), [1, 1, 1, 0]);

  const expectedHands = completed.revealedHands;
  for (let seat = 0; seat < 4; seat += 1) {
    const view = roomViewForUser(completed, `player-${seat}`, { now });
    assert.deepEqual(view.revealedHands, expectedHands);
    assert.equal(view.handRevealUntil, now + 3_000);
  }

  assert.deepEqual(
    roomViewForUser(completed, 'player-0', { now: now + 2_999 }).revealedHands,
    expectedHands,
  );
  assert.equal(
    roomViewForUser(completed, 'player-0', { now: now + 3_000 }).revealedHands,
    null,
  );
  assert.equal(
    roomViewForUser(completed, 'player-0', { now: now + 3_000 }).handRevealUntil,
    null,
  );
});


test('room projections expose usernames but never full names', () => {
  let room = createRoom({ roomId: 'hokm-username-projection', hostUserId: 'player-0', now: 1_000 });
  room = joinRoom(room, 'player-1', 1_001);
  room.players[1].username = 'cardMaster';
  room.players[1].fullName = 'Private Legal Name';
  const view = roomViewForUser(room, 'player-0');
  assert.equal(view.players[1].username, 'cardMaster');
  assert.equal(Object.hasOwn(view.players[1], 'fullName'), false);
  assert.equal(view.players[1].userId, 'player-1');
});
