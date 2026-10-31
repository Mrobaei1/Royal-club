import { SUITS, RANKS, createDeck, legalCards, resolveTrick, teamForSeat } from "./engine.js";

const rankValue = Object.freeze(Object.fromEntries(RANKS.map((rank, index) => [rank, index + 2])));
const cardId = card => `${card.rank}_of_${card.suit}`;
const partner = seat => (seat + 2) % 4;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function seedFromPublicState(state, seat) {
  const publicPlays = [...(state.completedTricks ?? []).flat(), ...state.currentTrick]
    .map(play => `${play.seat}:${cardId(play.card)}`).join("|");
  const own = [...state.hands[seat]].map(cardId).sort().join("|");
  const input = `${seat};${state.trumpSuit};${publicPlays};${own}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function publicVoidMap(state, seat) {
  const voids = new Map();
  for (let player = 0; player < 4; player += 1) if (player !== seat) voids.set(player, new Set());
  const history = [...(state.completedTricks ?? []), ...(state.currentTrick.length ? [state.currentTrick] : [])];
  for (const trick of history) {
    if (!trick.length) continue;
    const lead = trick[0].card.suit;
    for (const play of trick) if (play.card.suit !== lead) voids.get(play.seat)?.add(lead);
  }
  return voids;
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sampleHiddenHands(state, seat, rng, voids) {
  const known = new Set(state.hands[seat].map(cardId));
  for (const trick of [...(state.completedTricks ?? []), ...(state.currentTrick.length ? [state.currentTrick] : [])]) {
    for (const play of trick) known.add(cardId(play.card));
  }
  const unseen = createDeck().filter(card => !known.has(cardId(card)));
  const opponents = [0, 1, 2, 3].filter(player => player !== seat);
  const capacities = opponents.map(player => state.hands[player].length);
  if (capacities.reduce((sum, n) => sum + n, 0) !== unseen.length) return null;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const cards = shuffle(unseen, rng);
    let cursor = 0;
    const sampled = new Map();
    let valid = true;
    for (let index = 0; index < opponents.length; index += 1) {
      const player = opponents[index];
      const hand = cards.slice(cursor, cursor + capacities[index]);
      cursor += capacities[index];
      if (hand.some(card => voids.get(player)?.has(card.suit))) {
        valid = false;
        break;
      }
      sampled.set(player, hand);
    }
    if (valid) return sampled;
  }
  return null;
}

/**
 * Determinization-based one-trick search. It samples only cards not present in
 * this seat's hand or public play history. Opponent hand contents and the
 * server's undealt deck are never inspected.
 */
export function chooseSearchCard(state, seat, legal, { samples = 64 } = {}) {
  if (!Number.isInteger(samples) || samples < 8 || samples > 512) {
    throw new RangeError("Search samples must be between 8 and 512");
  }
  if (!Array.isArray(legal) || legal.length === 0) throw new TypeError("Search requires legal candidate cards");
  const rng = seededRandom(seedFromPublicState(state, seat));
  const voids = publicVoidMap(state, seat);
  const baseTeam = teamForSeat(seat);
  const scores = new Map(legal.map(card => [cardId(card), { total: 0, completed: 0 }]));

  for (const candidate of legal) {
    const stats = scores.get(cardId(candidate));
    for (let sample = 0; sample < samples; sample += 1) {
      const sampledHands = sampleHiddenHands(state, seat, rng, voids);
      if (!sampledHands) continue;
      const trick = [...state.currentTrick, { seat, card: { ...candidate } }];
      let currentSeat = (seat + 1) % 4;
      let guard = 0;
      while (trick.length < 4 && guard < 3) {
        const hand = sampledHands.get(currentSeat);
        if (!hand) break;
        const legalReply = legalCards(hand, trick);
        if (!legalReply.length) break;
        const reply = legalReply[Math.floor(rng() * legalReply.length)];
        hand.splice(hand.findIndex(card => cardId(card) === cardId(reply)), 1);
        trick.push({ seat: currentSeat, card: reply });
        currentSeat = (currentSeat + 1) % 4;
        guard += 1;
      }
      if (trick.length !== 4) continue;
      const result = resolveTrick(trick, state.trumpSuit);
      const won = result.winningTeam === baseTeam;
      const cardPenalty = (rankValue[candidate.rank] - 2) * 0.18
        + (candidate.suit === state.trumpSuit ? 2.5 : 0);
      stats.total += (won ? 100 : 0) - cardPenalty;
      stats.completed += 1;
    }
  }

  const ranked = legal.map(card => {
    const stat = scores.get(cardId(card));
    return { card, average: stat.completed ? stat.total / stat.completed : Number.NEGATIVE_INFINITY,
      completed: stat.completed };
  }).sort((a, b) => b.average - a.average ||
    (a.card.suit < b.card.suit ? -1 : a.card.suit > b.card.suit ? 1 : rankValue[a.card.rank] - rankValue[b.card.rank]));
  if (!ranked[0] || !Number.isFinite(ranked[0].average)) return legal[0];
  return { ...ranked[0].card };
}
