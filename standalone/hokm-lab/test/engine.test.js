import test from "node:test";
import assert from "node:assert/strict";
import {
  SUITS, RANKS, createDeck, shuffleDeck, dealCards, teamForSeat,
  partnerOf, legalCards, resolveTrick, scoreTricks, publicGameView,
  playerPrivateView
} from "../src/engine.js";

const c = (suit, rank) => ({ suit, rank });

test("deck contains 52 unique cards and all suits/ranks", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((x) => `${x.suit}:${x.rank}`)).size, 52);
  assert.deepEqual(new Set(deck.map((x) => x.suit)), new Set(SUITS));
  assert.deepEqual(new Set(deck.map((x) => x.rank)), new Set(RANKS));
});

test("shuffle is deterministic with an injected RNG and preserves cards", () => {
  const deck = createDeck();
  const shuffled = shuffleDeck(deck, () => 0.5);
  assert.equal(shuffled.length, 52);
  assert.deepEqual([...shuffled.map((x) => `${x.suit}:${x.rank}`)].sort(),
    [...deck.map((x) => `${x.suit}:${x.rank}`)].sort());
  assert.throws(() => shuffleDeck(deck, () => 1), /RNG/);
});

test("deal gives each seat 13 unique cards and rejects duplicate cards", () => {
  const hands = dealCards(createDeck());
  assert.deepEqual(hands.map((hand) => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(hands.flat().map((x) => `${x.suit}:${x.rank}`)).size, 52);
  assert.throws(() => dealCards(Array(52).fill(c("clubs", "A"))), /duplicate/i);
});

test("teams and partners are opposite seats", () => {
  assert.deepEqual([0, 1, 2, 3].map(teamForSeat), [0, 1, 0, 1]);
  assert.deepEqual([0, 1, 2, 3].map(partnerOf), [2, 3, 0, 1]);
});

test("players must follow the lead suit when they can", () => {
  const hand = [c("hearts", "2"), c("spades", "A"), c("clubs", "K")];
  const trick = [{ seat: 0, card: c("spades", "3") }];
  assert.deepEqual(legalCards(hand, trick), [c("spades", "A")]);
});

test("player may discard any suit if void in the lead suit", () => {
  const hand = [c("hearts", "2"), c("clubs", "K")];
  const trick = [{ seat: 0, card: c("spades", "3") }];
  assert.deepEqual(legalCards(hand, trick), hand);
});

test("trump beats a higher non-trump led-suit card", () => {
  const result = resolveTrick([
    { seat: 0, card: c("hearts", "A") },
    { seat: 1, card: c("spades", "2") },
    { seat: 2, card: c("hearts", "K") },
    { seat: 3, card: c("clubs", "A") }
  ], "spades");
  assert.equal(result.winnerSeat, 1);
  assert.equal(result.winningTeam, 1);
});

test("highest card of the led suit wins when no trump is played", () => {
  const result = resolveTrick([
    { seat: 0, card: c("hearts", "10") },
    { seat: 1, card: c("hearts", "A") },
    { seat: 2, card: c("clubs", "A") },
    { seat: 3, card: c("hearts", "K") }
  ], "spades");
  assert.equal(result.winnerSeat, 1);
});

test("off-suit non-trump ace cannot beat a led-suit card", () => {
  const result = resolveTrick([
    { seat: 0, card: c("hearts", "2") },
    { seat: 1, card: c("clubs", "A") },
    { seat: 2, card: c("hearts", "3") },
    { seat: 3, card: c("diamonds", "A") }
  ], "spades");
  assert.equal(result.winnerSeat, 2);
});

test("trick rejects incomplete tricks and duplicate seats", () => {
  assert.throws(() => resolveTrick([{ seat: 0, card: c("hearts", "A") }], "spades"), /four plays/);
  assert.throws(() => resolveTrick([
    { seat: 0, card: c("hearts", "A") },
    { seat: 0, card: c("hearts", "K") },
    { seat: 2, card: c("hearts", "Q") },
    { seat: 3, card: c("hearts", "J") }
  ], "spades"), /twice/);
});

test("base scoring awards a hand to the first team reaching seven", () => {
  assert.deepEqual(scoreTricks([0, 1, 2, 3, 0, 1, 2]), { tricks: [4, 3], winnerTeam: null });
  assert.deepEqual(scoreTricks([0, 2, 0, 2, 0, 2, 0]), { tricks: [7, 0], winnerTeam: 0 });
  assert.throws(() => scoreTricks(Array(14).fill(0)), /13/);
});

test("private view exposes only the requested seat's hand", () => {
  const publicView = publicGameView({ phase: "playing", currentSeat: 2, trumpSuit: "hearts" });
  const view = playerPrivateView(publicView, 2, [c("hearts", "A")]);
  assert.equal(view.ownSeat, 2);
  assert.deepEqual(view.hand, [c("hearts", "A")]);
  assert.equal("hands" in view, false);
  assert.equal("otherHands" in view, false);
});

test("invalid cards and seats are rejected", () => {
  assert.throws(() => legalCards([c("moon", "A")], []), /Invalid card/);
  assert.throws(() => dealCards(createDeck(), 4), /Seat/);
  assert.throws(() => publicGameView({ phase: "x", currentSeat: 9 }), /Seat/);
});
