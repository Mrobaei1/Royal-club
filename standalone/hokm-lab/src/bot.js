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
  return [...cards].sort((a,b) => score(b)-score(a) || SUITS.indexOf(a.suit)-SUITS.indexOf(b.suit) || rank[b.rank]-rank[a.rank])[0];
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
  return Object.freeze({ type: "play_card", card: { ...chosen }, difficulty: "hard" });
}
