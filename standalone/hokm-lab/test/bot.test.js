import test from "node:test";
import assert from "node:assert/strict";
import { createDeck } from "../src/engine.js";
import { createRound, chooseTrump, playCard } from "../src/round.js";
import { chooseHardBotAction, visibleCardLedger } from "../src/bot.js";

test("hard bot selects trump only for the hakem and chooses a suit in its own five cards",()=>{
  const state=createRound({deck:createDeck(),hakemSeat:0});
  const action=chooseHardBotAction(state,0);
  assert.equal(action.type,"choose_trump");
  assert.equal(action.difficulty,"hard");
  assert.ok(state.hands[0].some(c=>c.suit===action.suit));
  assert.throws(()=>chooseHardBotAction(state,1),/hakem/);
});

test("hard bot follows suit and returns only a legal card",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"spades");
  const lead=state.hands[0][0];
  state=playCard(state,0,lead);
  const action=chooseHardBotAction(state,1);
  assert.equal(action.type,"play_card");
  assert.ok(state.hands[1].some(c=>c.suit===lead.suit)
    ? action.card.suit===lead.suit
    : state.hands[1].some(c=>c.rank===action.card.rank&&c.suit===action.card.suit));
  assert.ok(state.hands[1].some(c=>c.rank===action.card.rank&&c.suit===action.card.suit));
});

test("hard bot does not read hidden hands to build its visible card ledger",()=>{
  const state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"clubs");
  const ledger=visibleCardLedger(state,0);
  assert.equal(ledger.ownHandCount,13);
  assert.equal(ledger.knownCards,13);
  assert.equal("undealtDeck" in ledger,false);
  assert.equal("hands" in ledger,false);
});

test("bot rejects wrong turn and never offers selectable difficulty",()=>{
  const state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"clubs");
  assert.throws(()=>chooseHardBotAction(state,1),/turn/);
  const action=chooseHardBotAction(state,0);
  assert.deepEqual(Object.keys(action).sort(),["card","difficulty","type"]);
  assert.equal(action.difficulty,"hard");
});
