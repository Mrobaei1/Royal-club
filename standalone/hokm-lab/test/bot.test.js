import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, shuffleDeck, legalCards } from "../src/engine.js";
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


test("hard bot completes a full deterministic hand using only legal engine actions",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"spades");
  let actions=0;
  while(state.phase==="playing" && actions<52){
    const seat=state.currentSeat;
    const action=chooseHardBotAction(state,seat);
    assert.equal(action.difficulty,"hard");
    assert.equal(action.type,"play_card");
    assert.ok(state.hands[seat].some(card=>card.rank===action.card.rank&&card.suit===action.card.suit));
    state=playCard(state,seat,action.card);
    actions++;
  }
  assert.equal(state.phase,"completed");
  assert.equal(actions%4,0);
  assert.ok(state.completedTricks.length>=7);
  assert.equal(state.hands.flat().length,52-actions);
});

test("public ledger counts cards from completed tricks and infers revoked suits",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"clubs");
  // Hakem leads a card; seat 1 is forced off-suit only if it has no lead suit.
  const lead=state.hands[0][0];
  state=playCard(state,0,lead);
  const seat1=1;
  const follow=state.hands[seat1].find(card=>card.suit===lead.suit) ?? state.hands[seat1][0];
  state=playCard(state,seat1,follow);
  state=playCard(state,2,state.hands[2].find(card=>card.suit===lead.suit) ?? state.hands[2][0]);
  state=playCard(state,3,state.hands[3].find(card=>card.suit===lead.suit) ?? state.hands[3][0]);
  const view=visibleCardLedger(state,0);
  assert.equal(view.knownCards,16);
  assert.equal(view.ownHandCount,12);
  if(follow.suit!==lead.suit) assert.ok(view.voidSuitsBySeat[1].includes(lead.suit));
  assert.equal("undealtDeck" in view,false);
  assert.equal("hands" in view,false);
});



test("sampled trick search is deterministic and independent of hidden opponent hands", () => {
  const base = chooseTrump(createRound({deck:shuffleDeck(createDeck(), seededRng(9876)),hakemSeat:0}),0,"hearts");
  const seat = base.currentSeat;
  const first = chooseHardBotAction(base,seat);
  const hiddenAltered = {
    ...base,
    hands: base.hands.map((hand,index) => index === seat ? hand : [])
  };
  const second = chooseHardBotAction(hiddenAltered,seat);
  const repeated = chooseHardBotAction(base,seat);
  assert.deepEqual(first,second);
  assert.deepEqual(first,repeated);
  assert.equal(first.difficulty,"hard");
  assert.ok(legalCards(base.hands[seat],base.currentTrick)
    .some(card => card.suit === first.card.suit && card.rank === first.card.rank));
});

function seededRng(seed) {
  let value=seed>>>0;
  return ()=>{ value=(1664525*value+1013904223)>>>0; return value/0x100000000; };
}

test("sampled search remains legal when deciding second and third in a trick", () => {
  for (const seed of [31, 72, 119]) {
    let state = chooseTrump(createRound({
      deck: shuffleDeck(createDeck(), seededRng(seed * 13)),
      hakemSeat: seed % 4
    }), seed % 4, "spades");
    const botSeat = (state.currentSeat + 2) % 4;
    while (state.currentSeat !== botSeat) {
      const seat = state.currentSeat;
      const legal = legalCards(state.hands[seat], state.currentTrick);
      state = playCard(state, seat, legal[0]);
    }
    const legal = legalCards(state.hands[botSeat], state.currentTrick);
    const action = chooseHardBotAction(state, botSeat);
    assert.ok(legal.some(card => card.suit === action.card.suit && card.rank === action.card.rank));
    const repeated = chooseHardBotAction(state, botSeat);
    assert.deepEqual(repeated, action);
  }
});

test("hard bot completes 24 seeded deals without illegal actions or hidden-information dependence",()=>{
  for(let seed=1;seed<=24;seed++){
    let state=chooseTrump(createRound({deck:shuffleDeck(createDeck(),seededRng(seed)),hakemSeat:seed%4}),seed%4,"hearts");
    let actions=0;
    while(state.phase==="playing" && actions<52){
      const seat=state.currentSeat;
      const action=chooseHardBotAction(state,seat);
      assert.ok(state.hands[seat].some(card=>card.rank===action.card.rank&&card.suit===action.card.suit));
      state=playCard(state,seat,action.card);
      actions++;
    }
    assert.equal(state.phase,"completed",`seed ${seed} did not finish`);
    assert.equal(actions%4,0);
    assert.equal(state.completedTricks.length,actions/4);
  }
});

test("bot decisions are unchanged when hidden opponent hands are altered",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"diamonds");
  const actionA=chooseHardBotAction(state,state.currentSeat);
  const hiddenPool=createDeck();
  let cursor=0;
  const altered={...state,hands:state.hands.map((hand,index)=>index===state.currentSeat
    ? hand
    : Array.from({length:hand.length},()=>hiddenPool[cursor++]))};
  const actionB=chooseHardBotAction(altered,altered.currentSeat);
  assert.deepEqual(actionB,actionA);
});

test("visible-card ledger conserves the 52-card count",()=>{
  let state=chooseTrump(createRound({deck:createDeck(),hakemSeat:0}),0,"clubs");
  for(let i=0;i<4;i++){
    const seat=state.currentSeat;
    const lead=state.currentTrick[0]?.card.suit;
    const card=state.hands[seat].find(c=>!lead||c.suit===lead) ?? state.hands[seat][0];
    state=playCard(state,seat,card);
  }
  const ledger=visibleCardLedger(state,0);
  assert.equal(ledger.knownCards+Object.values(ledger.unseenBySuit).reduce((a,b)=>a+b,0),52);
});


test("four fixed-Hard bots complete 100 seeded full matches to the configured target", () => {
  for (let seed = 101; seed <= 200; seed += 1) {
    const rng = seededRng(seed);
    const matchTarget = 3;
    const matchScore = [0, 0];
    let hakemSeat = seed % 4;
    let rounds = 0;
    while (Math.max(...matchScore) < matchTarget && rounds < 20) {
      let state = createRound({
        deck: shuffleDeck(createDeck(), rng),
        hakemSeat
      });
      const trumpAction = chooseHardBotAction(state, hakemSeat);
      assert.equal(trumpAction.type, "choose_trump");
      state = chooseTrump(state, hakemSeat, trumpAction.suit);
      assert.deepEqual(state.hands.map(hand => hand.length), [13, 13, 13, 13]);
      let actions = 0;
      while (state.phase === "playing" && actions < 52) {
        const seat = state.currentSeat;
        const action = chooseHardBotAction(state, seat);
        assert.equal(action.type, "play_card");
        assert.ok(legalCards(state.hands[seat], state.currentTrick)
          .some(card => card.suit === action.card.suit && card.rank === action.card.rank));
        state = playCard(state, seat, action.card);
        actions += 1;
      }
      assert.equal(state.phase, "completed", "round must finish for seed " + seed);
      assert.ok(actions >= 28 && actions <= 52);
      assert.equal(actions % 4, 0);
      const winner = state.scores[0] > state.scores[1] ? 0 : 1;
      matchScore[winner] += 1;
      rounds += 1;
      hakemSeat = (hakemSeat + 1) % 4;
    }
    assert.equal(Math.max(...matchScore), matchTarget, "match target not reached for seed " + seed);
    assert.ok(rounds >= matchTarget && rounds <= 20);
  }
});
