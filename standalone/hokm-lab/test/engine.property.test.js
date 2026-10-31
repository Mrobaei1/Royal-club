import test from "node:test";
import assert from "node:assert/strict";
import {
  SUITS, createDeck, shuffleDeck, dealCards, cardId,
  legalCards, resolveTrick, scoreTricks, teamForSeat
} from "../src/engine.js";

function seededRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

test("property: 2,000 seeded shuffles always deal a unique, complete 52-card partition", () => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const rng = seededRng(seed);
    const deck = shuffleDeck(createDeck(), rng);
    const hands = dealCards(deck, seed % 4);
    assert.deepEqual(hands.map(hand => hand.length), [13, 13, 13, 13], `seed ${seed}`);
    const ids = hands.flat().map(cardId);
    assert.equal(new Set(ids).size, 52, `duplicate card at seed ${seed}`);
    assert.deepEqual([...ids].sort(), createDeck().map(cardId).sort(), `card loss at seed ${seed}`);
  }
});

test("property: legal play generation and trick resolution remain consistent across 5,000 seeded tricks", () => {
  for (let seed = 1; seed <= 5000; seed += 1) {
    const rng = seededRng(seed * 17);
    const hands = dealCards(shuffleDeck(createDeck(), rng), seed % 4);
    const trump = pick(SUITS, rng);
    const leadSeat = seed % 4;
    const trick = [];

    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (leadSeat + offset) % 4;
      const legal = legalCards(hands[seat], trick);
      assert.ok(legal.length > 0, `no legal card at seed ${seed}, seat ${seat}`);
      if (trick.length > 0 && hands[seat].some(card => card.suit === trick[0].card.suit)) {
        assert.ok(legal.every(card => card.suit === trick[0].card.suit), `follow-suit failure at seed ${seed}`);
      }
      const selected = pick(legal, rng);
      trick.push({ seat, card: selected });
    }

    const result = resolveTrick(trick, trump);
    assert.ok(trick.some(play => play.seat === result.winnerSeat), `winner not in trick at seed ${seed}`);
    assert.equal(result.winningTeam, teamForSeat(result.winnerSeat));
    assert.equal(result.leadSuit, trick[0].card.suit);
    assert.equal(result.trumpSuit, trump);
    assert.deepEqual(resolveTrick(trick, trump), result, `non-deterministic resolution at seed ${seed}`);
  }
});

test("property: scoring never exceeds 13 tricks and winner appears only at seven", () => {
  for (let seed = 1; seed <= 3000; seed += 1) {
    const rng = seededRng(seed * 31);
    const winners = Array.from({ length: Math.floor(rng() * 14) }, () => Math.floor(rng() * 4));
    const result = scoreTricks(winners);
    assert.equal(result.tricks[0] + result.tricks[1], winners.length);
    assert.ok(result.tricks.every(count => count >= 0 && count <= 13));
    if (result.winnerTeam !== null) assert.ok(result.tricks[result.winnerTeam] >= 7);
    else assert.ok(result.tricks.every(count => count < 7));
  }
});

test("property: malformed duplicate-card decks are rejected regardless of card position", () => {
  const original = createDeck();
  for (let index = 0; index < 52; index += 1) {
    const malformed = original.map(card => ({ ...card }));
    malformed[index] = { ...malformed[(index + 1) % 52] };
    assert.throws(() => dealCards(malformed), /duplicate cards|incomplete/i, `index ${index}`);
  }
});
