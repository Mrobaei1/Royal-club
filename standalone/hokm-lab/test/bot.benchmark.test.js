import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, shuffleDeck, legalCards } from "../src/engine.js";
import { createRound, chooseTrump, playCard } from "../src/round.js";
import { chooseHardBotAction } from "../src/bot.js";

function seededRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
function randomItem(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

test("strategy benchmark: fixed-Hard team against a legal random baseline over 300 seeded deals", () => {
  const aggregate = {
    deals: 300,
    hardTeamWins: 0,
    baselineTeamWins: 0,
    tiedDeals: 0,
    hardTeamTricks: 0,
    baselineTeamTricks: 0,
    actions: 0
  };

  for (let seed = 1; seed <= aggregate.deals; seed += 1) {
    const rng = seededRng(seed * 7919);
    // Alternate the teams' seats to reduce fixed-seat / lead-order bias.
    const hardTeam = seed % 2;
    const hardSeats = new Set(hardTeam === 0 ? [0, 2] : [1, 3]);
    const hakemSeat = seed % 4;
    let state = createRound({
      deck: shuffleDeck(createDeck(), rng),
      hakemSeat
    });

    const trump = hardSeats.has(hakemSeat)
      ? chooseHardBotAction(state, hakemSeat).suit
      : randomItem(["spades", "hearts", "diamonds", "clubs"], rng);
    state = chooseTrump(state, hakemSeat, trump);

    let actions = 0;
    while (state.phase === "playing" && actions < 52) {
      const seat = state.currentSeat;
      const legal = legalCards(state.hands[seat], state.currentTrick);
      assert.ok(legal.length > 0, `empty legal set: seed ${seed}, seat ${seat}`);

      let card;
      if (hardSeats.has(seat)) {
        const action = chooseHardBotAction(state, seat);
        assert.equal(action.type, "play_card");
        card = action.card;
      } else {
        card = randomItem(legal, rng);
      }
      assert.ok(legal.some(candidate => candidate.suit === card.suit && candidate.rank === card.rank),
        `illegal action: seed ${seed}, seat ${seat}`);
      state = playCard(state, seat, card);
      actions += 1;
    }

    assert.equal(state.phase, "completed", `unfinished deal: seed ${seed}`);
    assert.equal(actions % 4, 0);
    assert.equal(state.scores[0] + state.scores[1], state.trickWinners.length);
    aggregate.actions += actions;
    aggregate.hardTeamTricks += state.scores[hardTeam];
    aggregate.baselineTeamTricks += state.scores[1 - hardTeam];
    if (state.scores[hardTeam] > state.scores[1 - hardTeam]) aggregate.hardTeamWins += 1;
    else if (state.scores[hardTeam] < state.scores[1 - hardTeam]) aggregate.baselineTeamWins += 1;
    else aggregate.tiedDeals += 1;
  }

  assert.equal(aggregate.hardTeamWins + aggregate.baselineTeamWins + aggregate.tiedDeals, aggregate.deals);
  assert.ok(aggregate.actions > aggregate.deals * 20);
  const hardWinRate = aggregate.hardTeamWins / aggregate.deals;
  const hardTrickShare = aggregate.hardTeamTricks /
    (aggregate.hardTeamTricks + aggregate.baselineTeamTricks);
  console.log("HOKM_BOT_BENCHMARK", JSON.stringify({
    ...aggregate,
    hardWinRate: Number(hardWinRate.toFixed(4)),
    hardTrickShare: Number(hardTrickShare.toFixed(4))
  }));
});
