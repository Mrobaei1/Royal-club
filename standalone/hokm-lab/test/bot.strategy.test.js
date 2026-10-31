import test from "node:test";
import assert from "node:assert/strict";
import { chooseHardBotAction } from "../src/bot.js";

const card = (suit, rank) => ({ suit, rank });
function stateForBot({ seat = 0, hand, trick, trump = "clubs" }) {
  return {
    phase: "playing",
    currentSeat: seat,
    trumpSuit: trump,
    hakemSeat: 0,
    hands: Array.from({ length: 4 }, (_, index) => index === seat ? hand : []),
    currentTrick: trick,
    completedTricks: [],
    trickWinners: []
  };
}

test("partnership: bot sheds the cheapest legal card when its partner is already winning", () => {
  const state = stateForBot({
    hand: [card("hearts", "2"), card("hearts", "K"), card("clubs", "A")],
    trick: [
      { seat: 1, card: card("hearts", "10") },
      { seat: 2, card: card("hearts", "A") },
      { seat: 3, card: card("hearts", "J") }
    ]
  });
  const action = chooseHardBotAction(state, 0);
  assert.deepEqual(action.card, card("hearts", "2"));
});

test("partnership: bot overtakes an opponent with the cheapest winning legal card", () => {
  const state = stateForBot({
    hand: [card("hearts", "Q"), card("hearts", "A"), card("clubs", "2")],
    trick: [
      { seat: 1, card: card("hearts", "10") },
      { seat: 2, card: card("hearts", "3") },
      { seat: 3, card: card("hearts", "4") }
    ]
  });
  const action = chooseHardBotAction(state, 0);
  assert.deepEqual(action.card, card("hearts", "Q"));
});

test("partnership: bot must trump when void in lead suit and no partner is winning", () => {
  const state = stateForBot({
    hand: [card("clubs", "2"), card("clubs", "K"), card("spades", "A")],
    trick: [
      { seat: 1, card: card("hearts", "A") },
      { seat: 2, card: card("hearts", "3") },
      { seat: 3, card: card("hearts", "4") }
    ],
    trump: "clubs"
  });
  const action = chooseHardBotAction(state, 0);
  assert.equal(action.card.suit, "clubs");
  assert.deepEqual(action.card, card("clubs", "2"));
});
