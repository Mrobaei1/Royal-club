import { SUITS, RANKS, legalCards } from "./engine.js";

const rank = Object.freeze(Object.fromEntries(RANKS.map((value, index) => [value, index + 2])));
const cardKey = card => `${card.rank}_of_${card.suit}`;
const partnerOf = seat => (seat + 2) % 4;

function assertSeat(seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new RangeError("Invalid bot seat");
}
function assertState(state, seat) {
  assertSeat(seat);
  if (!state || !Array.isArray(state.hands) || state.hands.length !== 4 ||
      !Array.isArray(state.currentTrick) || !Array.isArray(state.trickWinners)) {
    throw new TypeError("Invalid server round state");
  }
  if (!Array.isArray(state.hands[seat])) throw new TypeError("Bot's private hand is unavailable");
  if (state.phase === "playing" && !SUITS.includes(state.trumpSuit)) throw new Error("Trump is not set");
}

function publicHistory(state) {
  return [...(state.completedTricks ?? []), ...(state.currentTrick.length ? [state.currentTrick] : [])];
}

/** Derives only cards in the bot hand and publicly exposed plays. */
export function visibleCardLedger(state, seat) {
  assertState(state, seat);
  const visible = new Set(state.hands[seat].map(cardKey));
  for (const trick of publicHistory(state)) {
    for (const play of trick) visible.add(cardKey(play.card));
  }
  const unseenBySuit = Object.fromEntries(SUITS.map(suit => [suit, RANKS.filter(rankName =>
    !visible.has(cardKey({ suit, rank: rankName }))).length]));
  const voidSuitsBySeat = Object.fromEntries([0,1,2,3].filter(s => s !== seat).map(s => [s, []]));
  for (const trick of publicHistory(state)) {
    if (!trick.length) continue;
    const leadSuit = trick[0].card.suit;
    for (const play of trick) {
      if (play.card.suit !== leadSuit && voidSuitsBySeat[play.seat] &&
          !voidSuitsBySeat[play.seat].includes(leadSuit)) {
        voidSuitsBySeat[play.seat].push(leadSuit);
      }
    }
  }
  return Object.freeze({
    knownCards: visible.size,
    ownHandCount: state.hands[seat].length,
    unseenBySuit: Object.freeze(unseenBySuit),
    voidSuitsBySeat: Object.freeze(Object.fromEntries(Object.entries(voidSuitsBySeat)
      .map(([id, suits]) => [id, Object.freeze(suits)])))
  });
}

function strength(card, leadSuit, trumpSuit) {
  if (card.suit === trumpSuit) return 2;
  if (card.suit === leadSuit) return 1;
  return 0;
}
function currentWinner(trick, trumpSuit) {
  if (!trick.length) return null;
  const leadSuit = trick[0].card.suit;
  return trick.reduce((best, play) => {
    const a = strength(play.card, leadSuit, trumpSuit);
    const b = strength(best.card, leadSuit, trumpSuit);
    return a > b || (a === b && a > 0 && rank[play.card.rank] > rank[best.card.rank]) ? play : best;
  });
}
function beats(card, current, trumpSuit) {
  if (!current) return true;
  const leadSuit = current.leadSuit;
  const a = strength(card, leadSuit, trumpSuit);
  const b = strength(current.card, leadSuit, trumpSuit);
  return a > b || (a === b && a > 0 && rank[card.rank] > rank[current.card.rank]);
}
function cardCost(card, trumpSuit) {
  return rank[card.rank] + (card.suit === trumpSuit ? 14 : 0);
}
function stableBest(cards, score) {
  return [...cards].sort((a,b) => {
    const delta = score(b) - score(a);
    if (delta) return delta;
    const suitA = typeof a === "string" ? a : a.suit;
    const suitB = typeof b === "string" ? b : b.suit;
    const suitDelta = SUITS.indexOf(suitA) - SUITS.indexOf(suitB);
    if (suitDelta) return suitDelta;
    return rank[typeof b === "string" ? "2" : b.rank] - rank[typeof a === "string" ? "2" : a.rank];
  })[0];
}


function hashSeed(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
function sampleHiddenHands(state, seat, ledger, rng) {
  const played = [0, 1, 2, 3].map(() => 0);
  for (const trick of publicHistory(state)) for (const play of trick) played[play.seat] += 1;
  const capacities = [0, 1, 2, 3].map(id => id === seat ? 0 : 13 - played[id]);
  if (capacities[seat] !== 0 || capacities.some((count, id) => id !== seat && count < 0)) return null;
  const cards = [];
  for (const suit of SUITS) for (const rankName of RANKS) {
    const key = cardKey({ suit, rank: rankName });
    const visible = new Set([
      ...state.hands[seat].map(cardKey),
      ...publicHistory(state).flatMap(trick => trick.map(play => cardKey(play.card)))
    ]);
    if (!visible.has(key)) cards.push({ suit, rank: rankName });
  }
  const required = capacities.reduce((sum, count) => sum + count, 0);
  if (cards.length !== required) return null;
  const voids = ledger.voidSuitsBySeat;
  const eligible = card => [0, 1, 2, 3].filter(id => id !== seat &&
    !(voids[id] ?? []).includes(card.suit) && capacities[id] > 0);
  cards.sort((a, b) => eligible(a).length - eligible(b).length);
  const hands = [[], [], [], []];
  function assign(index) {
    if (index === cards.length) return capacities.every((count, id) => id === seat || count === 0);
    const remaining = cards.length - index;
    if (capacities.reduce((sum, count) => sum + count, 0) !== remaining) return false;
    for (const id of [0, 1, 2, 3]) {
      if (id === seat || capacities[id] === 0) continue;
      let possible = 0;
      for (let cursor = index; cursor < cards.length; cursor += 1) {
        if (!(voids[id] ?? []).includes(cards[cursor].suit)) possible += 1;
      }
      if (possible < capacities[id]) return false;
    }
    const card = cards[index];
    const choices = eligible(card);
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    for (const id of choices) {
      capacities[id] -= 1;
      hands[id].push(card);
      if (assign(index + 1)) return true;
      hands[id].pop();
      capacities[id] += 1;
    }
    return false;
  }
  return assign(0) ? hands : null;
}
function simulatedWinner(trick, trump) {
  return currentWinner(trick, trump);
}
function simulatedPolicy(hand, trick, trump) {
  const legal = legalCards(hand, trick);
  const winner = simulatedWinner(trick, trump);
  if (winner && winner.seat % 2 === (trick.length ? (trick[0].seat % 2) : winner.seat % 2) &&
      (winner.seat + 2) % 4 !== -1) {
    // Partnership check is applied by the caller below; this branch only keeps
    // the deterministic fallback cheap when no sampled winning card exists.
  }
  const leadSuit = trick[0]?.card.suit;
  const winning = winner ? legal.filter(card => beats(card,
    { ...winner, leadSuit }, trump)) : legal;
  return stableBest(winning.length ? winning : legal, card => -cardCost(card, trump));
}
function searchExpectedTrickValue(state, seat, candidates, ledger) {
  const historyKey = publicHistory(state).flatMap(trick =>
    trick.map(play => `${play.seat}:${cardKey(play.card)}`)).join("|");
  const seedBase = hashSeed(`${seat}:${state.trumpSuit}:${historyKey}:${state.hands[seat].map(cardKey).sort().join(",")}`);
  const samples = 12;
  const values = new Map(candidates.map(card => [cardKey(card), { score: 0, samples: 0 }]));
  for (let sample = 0; sample < samples; sample += 1) {
    const rng = seededRandom(seedBase + sample * 104729);
    const hidden = sampleHiddenHands(state, seat, ledger, rng);
    if (!hidden) continue;
    for (const candidate of candidates) {
      const trick = [...state.currentTrick, { seat, card: candidate }];
      const simulatedHands = hidden.map(hand => [...hand]);
      let valid = true;
      for (let offset = 1; offset < 4 - state.currentTrick.length; offset += 1) {
        const nextSeat = (seat + offset) % 4;
        const hand = nextSeat === seat ? state.hands[seat] : simulatedHands[nextSeat];
        if (!hand?.length) { valid = false; break; }
        const card = simulatedPolicy(hand, trick, state.trumpSuit);
        const index = hand.findIndex(item => cardKey(item) === cardKey(card));
        if (index < 0) { valid = false; break; }
        hand.splice(index, 1);
        trick.push({ seat: nextSeat, card });
      }
      if (!valid || trick.length !== 4) continue;
      const winner = simulatedWinner(trick, state.trumpSuit);
      const won = winner.seat % 2 === seat % 2;
      const entry = values.get(cardKey(candidate));
      entry.score += won ? 1 : 0;
      entry.samples += 1;
    }
  }
  const scored = candidates.map(card => {
    const entry = values.get(cardKey(card));
    return { card, rate: entry.samples ? entry.score / entry.samples : -1,
      cost: cardCost(card, state.trumpSuit) };
  });
  return scored.sort((a, b) => b.rate - a.rate || a.cost - b.cost ||
    SUITS.indexOf(a.card.suit) - SUITS.indexOf(b.card.suit))[0]?.card ?? null;
}

/** Fixed Hard policy; no opponent hand or undealt deck is inspected. */
export function chooseHardBotAction(state, seat) {
  assertState(state, seat);
  if (state.phase === "choose_trump") {
    if (seat !== state.hakemSeat) throw new Error("Only the hakem bot may choose trump");
    const hand = state.hands[seat];
    const suit = stableBest(SUITS, candidate => {
      const cards = hand.filter(card => card.suit === candidate);
      return cards.length * 5 + cards.reduce((sum, card) => sum + Math.max(0, rank[card.rank] - 10), 0);
    });
    return Object.freeze({ type: "choose_trump", suit, difficulty: "hard" });
  }
  if (state.phase !== "playing") throw new Error("Bot cannot act outside an active round");
  if (state.currentSeat !== seat) throw new Error("It is not the bot's turn");

  const hand = state.hands[seat];
  const legal = legalCards(hand, state.currentTrick);
  if (!legal.length) throw new Error("No legal card is available");
  const ledger = visibleCardLedger(state, seat);
  const partner = partnerOf(seat);
  const winner = currentWinner(state.currentTrick, state.trumpSuit);
  const partnerWinning = winner?.seat === partner;

  let chosen;
  if (state.currentTrick.length === 0) {
    chosen = stableBest(legal, card => {
      const sameSuit = hand.filter(item => item.suit === card.suit);
      const topHonors = sameSuit.filter(item => rank[item.rank] >= 11).length;
      const remaining = ledger.unseenBySuit[card.suit];
      const voidRisk = Object.entries(ledger.voidSuitsBySeat).filter(([id, suits]) =>
        Number(id) !== partner && suits.includes(card.suit)).length;
      return sameSuit.length * 5 + topHonors * 2 + rank[card.rank] * 0.2
        + Math.min(remaining, 8) * 0.25 - voidRisk * 3
        - (card.suit === state.trumpSuit ? 7 : 0);
    });
  } else if (partnerWinning) {
    chosen = stableBest(legal, card => -cardCost(card, state.trumpSuit));
  } else {
    const current = { ...winner, leadSuit: state.currentTrick[0].card.suit };
    const winning = legal.filter(card => beats(card, current, state.trumpSuit));
    chosen = winning.length
      ? stableBest(winning, card => -cardCost(card, state.trumpSuit))
      : stableBest(legal, card => -cardCost(card, state.trumpSuit));
  }
  const searched = searchExpectedTrickValue(state, seat, legal, ledger);
  if (searched) chosen = searched;
  return Object.freeze({ type: "play_card", card: { ...chosen }, difficulty: "hard" });
}
