import { SUITS, legalCards, resolveTrick, teamForSeat } from "./engine.js";

const rank = Object.freeze({ "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14 });

function assertSeat(seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new RangeError("Invalid bot seat");
}
function assertState(state, seat) {
  assertSeat(seat);
  if (!state || !Array.isArray(state.hands) || state.hands.length !== 4 ||
      !Array.isArray(state.currentTrick) || !Array.isArray(state.trickWinners)) {
    throw new TypeError("Invalid server round state");
  }
  if (state.phase === "playing" && !SUITS.includes(state.trumpSuit)) throw new Error("Trump is not set");
}

/** Count unseen cards from the bot's perspective; no undealt deck or opponent hand is read. */
export function visibleCardLedger(state, seat) {
  assertState(state, seat);
  const visible = new Set(state.hands[seat].map(c => `${c.rank}_of_${c.suit}`));
  for (const play of state.currentTrick) visible.add(`${play.card.rank}_of_${play.card.suit}`);
  for (const trick of state.completedTricks ?? []) {
    for (const play of trick) visible.add(`${play.card.rank}_of_${play.card.suit}`);
  }
  return Object.freeze({ knownCards: visible.size, ownHandCount: state.hands[seat].length });
}

function partialWinner(trick, trumpSuit) {
  if (!trick.length) return null;
  const lead = trick[0].card.suit;
  const strength = card => card.suit === trumpSuit ? 2 : card.suit === lead ? 1 : 0;
  let best = trick[0];
  for (const play of trick.slice(1)) {
    const a = strength(play.card), b = strength(best.card);
    if (a > b || (a === b && a > 0 && rank[play.card.rank] > rank[best.card.rank])) best = play;
  }
  return best;
}
function beats(card, current, trump) {
  if (!current) return true;
  const lead = current.card.suit;
  const a = card.suit === trump ? 2 : card.suit === lead ? 1 : 0;
  const b = current.card.suit === trump ? 2 : current.card.suit === lead ? 1 : 0;
  return a > b || (a === b && a > 0 && rank[card.rank] > rank[current.card.rank]);
}
function cardCost(card, trump) {
  return rank[card.rank] + (card.suit === trump ? 5 : 0);
}

/** Fixed Hard policy. It considers only the bot's hand and public trick history. */
export function chooseHardBotAction(state, seat) {
  assertState(state, seat);
  if (state.phase === "choose_trump") {
    if (seat !== state.hakemSeat) throw new Error("Only the hakem bot may choose trump");
    const hand = state.hands[seat];
    const suitScore = suit => {
      const cards = hand.filter(c => c.suit === suit);
      return cards.length * 3 + cards.reduce((sum,c) => sum + (rank[c.rank] >= 12 ? rank[c.rank] - 10 : 0),0);
    };
    const suit = [...SUITS].sort((a,b) => suitScore(b)-suitScore(a) || SUITS.indexOf(a)-SUITS.indexOf(b))[0];
    return Object.freeze({ type:"choose_trump", suit, difficulty:"hard" });
  }
  if (state.phase !== "playing") throw new Error("Bot cannot act outside an active round");
  if (state.currentSeat !== seat) throw new Error("It is not the bot's turn");
  const hand = state.hands[seat];
  const legal = legalCards(hand, state.currentTrick);
  const partner = (seat + 2) % 4;
  const winningPlay = partialWinner(state.currentTrick, state.trumpSuit);
  const partnerCurrentlyWinning = winningPlay?.seat === partner;
  let chosen;

  if (state.currentTrick.length === 0) {
    // Lead from a long, strong non-trump suit; preserve trump for control.
    chosen = [...legal].sort((a,b) => {
      const countA = hand.filter(c=>c.suit===a.suit).length;
      const countB = hand.filter(c=>c.suit===b.suit).length;
      const scoreA = countA*4 + rank[a.rank] + (a.suit===state.trumpSuit ? -8 : 0);
      const scoreB = countB*4 + rank[b.rank] + (b.suit===state.trumpSuit ? -8 : 0);
      return scoreB-scoreA || rank[b.rank]-rank[a.rank];
    })[0];
  } else if (partnerCurrentlyWinning) {
    // Do not waste a control card when partner is already likely to take the trick.
    chosen = [...legal].sort((a,b)=>cardCost(a,state.trumpSuit)-cardCost(b,state.trumpSuit))[0];
  } else {
    // Win with the cheapest legal card that overtakes the current winning play.
    const winners = legal.filter(card=>beats(card,winningPlay,state.trumpSuit));
    chosen = winners.length
      ? [...winners].sort((a,b)=>cardCost(a,state.trumpSuit)-cardCost(b,state.trumpSuit))[0]
      : [...legal].sort((a,b)=>cardCost(a,state.trumpSuit)-cardCost(b,state.trumpSuit))[0];
  }
  return Object.freeze({ type:"play_card", card:{...chosen}, difficulty:"hard" });
}
