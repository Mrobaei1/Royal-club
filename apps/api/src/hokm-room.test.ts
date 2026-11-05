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

  // During the hand, each seat receives only its own cards.
  for (let seat = 0; seat < 4; seat += 1) {
    const view = roomViewForUser(room, `player-${seat}`, { now });
    assert.equal(view.revealedHands, null);
    assert.ok(Array.isArray(view.game.ownHand));
    assert.equal('hands' in view.game, false);
  }

  // Seat 3 plays the fourth card. Team 0 reaches seven tricks and this
  // hand also reaches the match target, so the room becomes "completed".
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

  // The reveal remains visible up to, but not including, the deadline.
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

test('all four players see remaining hands for three seconds after a non-final hand too', () => {
  const now = 2_000;
  const room = completedFinalHandFixture();
  room.matchScore = [0, 0];

  const completed = applyRoomCommand(
    room,
    'player-3',
    { type: 'play_card', card: { suit: 'hearts', rank: '4' } },
    room.version,
    now,
  );

  assert.equal(completed.status, 'round_completed');
  assert.equal(completed.handRevealUntil, now + END_OF_HAND_REVEAL_MS);
  assert.deepEqual(completed.revealedHands.map(hand => hand.length), [1, 1, 1, 0]);

  for (let seat = 0; seat < 4; seat += 1) {
    assert.deepEqual(
      roomViewForUser(completed, `player-${seat}`, { now }).revealedHands,
      completed.revealedHands,
    );
  }
  assert.deepEqual(
    roomViewForUser(completed, 'player-2', { now: now + 2_999 }).revealedHands,
    completed.revealedHands,
  );
  assert.equal(
    roomViewForUser(completed, 'player-2', { now: now + 3_000 }).revealedHands,
    null,
  );
});
