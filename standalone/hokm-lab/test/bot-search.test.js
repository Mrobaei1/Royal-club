import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, shuffleDeck, legalCards } from "../src/engine.js";
import { createRound, chooseTrump, playCard } from "../src/round.js";
import { chooseSearchCard } from "../src/bot-search.js";

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 0x100000000);
}

test("determinization search returns a legal card and is deterministic for identical public state", () => {
  let state = chooseTrump(createRound({ deck: shuffleDeck(createDeck(), seeded(77)), hakemSeat: 0 }), 0, "hearts");
  for (let step = 0; step < 12; step += 1) {
    const seat = state.currentSeat;
    const legal = legalCards(state.hands[seat], state.currentTrick);
    const first = chooseSearchCard(state, seat, legal, { samples: 24 });
    const second = chooseSearchCard(state, seat, legal, { samples: 24 });
    assert.deepEqual(first, second);
    assert.ok(legal.some(card => card.suit === first.suit && card.rank === first.rank));
    state = playCard(state, seat, first);
  }
});

test("determinization search is invariant to hidden opponent card identities", () => {
  let state = chooseTrump(createRound({ deck: shuffleDeck(createDeck(), seeded(101)), hakemSeat: 0 }), 0, "clubs");
  for (let i = 0; i < 3; i += 1) {
    const seat = state.currentSeat;
    state = playCard(state, seat, state.hands[seat][0]);
  }
  const seat = state.currentSeat;
  const legal = legalCards(state.hands[seat], state.currentTrick);
  const original = chooseSearchCard(state, seat, legal, { samples: 24 });
  const pool = createDeck();
  let cursor = 0;
  const altered = {
    ...state,
    hands: state.hands.map((hand, index) => index === seat
      ? hand
      : Array.from({ length: hand.length }, () => pool[cursor++]))
  };
  const changed = chooseSearchCard(altered, seat, legal, { samples: 24 });
  assert.deepEqual(changed, original);
});

test("search rejects invalid sample budgets", () => {
  const state = chooseTrump(createRound({ deck: createDeck(), hakemSeat: 0 }), 0, "spades");
  const seat = state.currentSeat;
  const legal = legalCards(state.hands[seat], state.currentTrick);
  assert.throws(() => chooseSearchCard(state, seat, legal, { samples: 2 }), /between 8 and 512/);
});
