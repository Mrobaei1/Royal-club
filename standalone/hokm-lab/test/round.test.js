import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, cardId } from "../src/engine.js";
import { createRound, chooseTrump, playCard, roundViewForSeat } from "../src/round.js";

function makeState(hakemSeat = 0) {
  const deck = createDeck();
  const state = createRound({ deck, hakemSeat });
  return { state };
}

test("round starts with five cards per player and waits for hakem", () => {
  const { state } = makeState(2);
  assert.equal(state.phase, "choose_trump");
  assert.equal(state.currentSeat, 2);
  assert.deepEqual(state.hands.map((h) => h.length), [5, 5, 5, 5]);
});

test("only hakem may choose a valid trump; then each hand has 13 cards", () => {
  const { state } = makeState(1);
  assert.throws(() => chooseTrump(state, 0, "hearts"), /hakem/);
  assert.throws(() => chooseTrump(state, 1, "joker"), /Invalid trump/);
  const playing = chooseTrump(state, 1, "spades");
  assert.equal(playing.phase, "playing");
  assert.equal(playing.trumpSuit, "spades");
  assert.deepEqual(playing.hands.map((h) => h.length), [13, 13, 13, 13]);
  assert.equal(new Set(playing.hands.flat().map(cardId)).size, 52);
});

test("play rejects wrong turn and a card not in the seat's hand", () => {
  const { state, remaining } = makeState();
  const playing = chooseTrump(state, 0, "clubs");
  assert.throws(() => playCard(playing, 1, playing.hands[1][0]), /turn/);
  assert.throws(() => playCard(playing, 0, { suit: "spades", rank: "A" }), /not in this player's hand/);
});

test("round view only exposes the requested player's hand", () => {
  const { state, remaining } = makeState();
  const playing = chooseTrump(state, 0, "clubs", remaining);
  const view = roundViewForSeat(playing, 2);
  assert.equal(view.ownSeat, 2);
  assert.equal(view.ownHand.length, 13);
  assert.equal("hands" in view, false);
  assert.equal("deck" in view, false);
});

test("playCard enforces follow-suit when a legal off-suit card is attempted", () => {
  // Use a deck arrangement that makes the first seat hold clubs and hearts.
  const deck = createDeck();
  const { state, remaining } = makeState();
  const playing = chooseTrump(state, 0, "spades");
  const first = playing.hands[0][0];
  const secondSeat = 1;
  const afterFirst = playCard(playing, 0, first);
  const legal = afterFirst.hands[secondSeat].filter((card) => card.suit === first.suit);
  if (legal.length > 0) {
    const illegal = afterFirst.hands[secondSeat].find((card) => card.suit !== first.suit);
    if (illegal) assert.throws(() => playCard(afterFirst, secondSeat, illegal), /must follow/);
  }
});

test("round rejects a malformed deck with duplicate cards before dealing", () => {
  const deck = createDeck();
  deck[51] = deck[0];
  assert.throws(() => createRound({ deck }), /52 unique/);
});


test("completed public trick history is retained and sanitized in seat views",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"hearts");
  const trick=[];
  for(let i=0;i<4;i++){
    const seat=state.currentSeat;
    const card=state.hands[seat].find(c=>!trick.length||c.suit===trick[0].suit) ?? state.hands[seat][0];
    if(!trick.length) trick.push(card);
    state=playCard(state,seat,card);
  }
  assert.equal(state.completedTricks.length,1);
  assert.equal(state.completedTricks[0].length,4);
  const view=roundViewForSeat(state,2);
  assert.equal(view.completedTricks.length,1);
  assert.equal(view.completedTricks[0].length,4);
  assert.equal("undealtDeck" in view,false);
  assert.equal("hands" in view,false);
});
