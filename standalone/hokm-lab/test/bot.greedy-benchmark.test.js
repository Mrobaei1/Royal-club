import test from "node:test";
import assert from "node:assert/strict";
import { SUITS, RANKS, createDeck, shuffleDeck, legalCards } from "../src/engine.js";
import { createRound, chooseTrump, playCard } from "../src/round.js";
import { chooseHardBotAction } from "../src/bot.js";

const value = Object.freeze(Object.fromEntries(RANKS.map((rank, index) => [rank, index + 2])));
const partner = seat => (seat + 2) % 4;
const cost = (card, trump) => value[card.rank] + (card.suit === trump ? 14 : 0);

function rngFor(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}
function pickBest(cards, score) {
  return [...cards].sort((a, b) => score(b) - score(a))[0];
}
function winnerOf(trick, trump) {
  const lead = trick[0].card.suit;
  const strength = card => card.suit === trump ? 2 : card.suit === lead ? 1 : 0;
  return trick.reduce((best, play) => {
    const a = strength(play.card), b = strength(best.card);
    return a > b || (a === b && a > 0 && value[play.card.rank] > value[best.card.rank]) ? play : best;
  });
}
function greedyBaseline(state, seat) {
  const hand = state.hands[seat];
  if (state.phase === "choose_trump") {
    const suit = pickBest(SUITS, candidate =>
      hand.filter(card => card.suit === candidate).length * 10 +
      hand.filter(card => card.suit === candidate).reduce((sum, card) => sum + value[card.rank], 0) * 0.1);
    return { type: "choose_trump", suit };
  }
  const legal = legalCards(hand, state.currentTrick);
  if (!state.currentTrick.length) {
    const suit = pickBest(SUITS, candidate => hand.filter(card => card.suit === candidate).length);
    return pickBest(legal.filter(card => card.suit === suit), card => value[card.rank]);
  }
  const winner = winnerOf(state.currentTrick, state.trumpSuit);
  if (winner.seat === partner(seat)) return pickBest(legal, card => -cost(card, state.trumpSuit));
  const lead = state.currentTrick[0].card.suit;
  const strength = card => card.suit === state.trumpSuit ? 2 : card.suit === lead ? 1 : 0;
  const winning = legal.filter(card => {
    const a = strength(card), b = strength(winner.card);
    return a > b || (a === b && a > 0 && value[card.rank] > value[winner.card.rank]);
  });
  return winning.length
    ? pickBest(winning, card => -cost(card, state.trumpSuit))
    : pickBest(legal, card => -cost(card, state.trumpSuit));
}

test("benchmark: Hard partnership against deterministic greedy partnership over 300 seeded deals", () => {
  const totals = { deals: 300, hardWins: 0, greedyWins: 0, ties: 0, hardTricks: 0, greedyTricks: 0 };
  for (let seed = 1; seed <= totals.deals; seed += 1) {
    const rng = rngFor(seed * 104729);
    const hardTeam = seed % 2;
    const hardSeats = new Set(hardTeam === 0 ? [0, 2] : [1, 3]);
    const hakem = seed % 4;
    let state = createRound({ deck: shuffleDeck(createDeck(), rng), hakemSeat: hakem });
    const trumpAction = hardSeats.has(hakem)
      ? chooseHardBotAction(state, hakem)
      : greedyBaseline(state, hakem);
    state = chooseTrump(state, hakem, trumpAction.suit);

    let actions = 0;
    while (state.phase === "playing" && actions < 52) {
      const seat = state.currentSeat;
      const action = hardSeats.has(seat)
        ? chooseHardBotAction(state, seat)
        : greedyBaseline(state, seat);
      const card = action.card ?? action;
      assert.ok(legalCards(state.hands[seat], state.currentTrick)
        .some(candidate => candidate.suit === card.suit && candidate.rank === card.rank));
      state = playCard(state, seat, card);
      actions += 1;
    }
    assert.equal(state.phase, "completed", `seed ${seed}`);
    const hardScore = state.scores[hardTeam], greedyScore = state.scores[1 - hardTeam];
    totals.hardTricks += hardScore;
    totals.greedyTricks += greedyScore;
    if (hardScore > greedyScore) totals.hardWins += 1;
    else if (hardScore < greedyScore) totals.greedyWins += 1;
    else totals.ties += 1;
  }
  console.log("HOKM_HARD_VS_GREEDY", JSON.stringify({
    ...totals,
    hardWinRate: Number((totals.hardWins / totals.deals).toFixed(4)),
    hardTrickShare: Number((totals.hardTricks / (totals.hardTricks + totals.greedyTricks)).toFixed(4))
  }));
  assert.equal(totals.hardWins + totals.greedyWins + totals.ties, totals.deals);
});
