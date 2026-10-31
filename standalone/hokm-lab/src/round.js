import {
  SUITS, createDeck, shuffleDeck, cardId, legalCards, resolveTrick,
  teamForSeat
} from "./engine.js";

const validSeat = (seat) => Number.isInteger(seat) && seat >= 0 && seat < 4;
const copyCard = (card) => ({ suit: card.suit, rank: card.rank });
const cloneHands = (hands) => hands.map((hand) => hand.map(copyCard));

function assertSeat(seat) {
  if (!validSeat(seat)) throw new RangeError("Seat must be 0, 1, 2, or 3");
}

function nextSeat(seat) {
  return (seat + 1) % 4;
}

/**
 * Server-side round state machine. Keep this state on the authoritative server.
 * It deliberately returns sanitized views rather than exposing all hands.
 *
 * Assumptions: hakem receives the first five cards and chooses trump; after
 * declaration the remaining eight cards are dealt; hakem leads the first trick.
 * Regional dealing/early-finish rules should be confirmed before production.
 */
export function createRound({ deck = shuffleDeck(createDeck()), hakemSeat = 0 } = {}) {
  assertSeat(hakemSeat);
  if (!Array.isArray(deck) || deck.length !== 52) throw new TypeError("Expected a 52-card deck");
  const deckIds = new Set(deck.map(cardId));
  if (deckIds.size !== 52) throw new Error("Deck must contain 52 unique valid cards");
  const hands = [[], [], [], []];
  let cursor = 0;
  for (let i = 0; i < 5; i += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      hands[(hakemSeat + offset) % 4].push(copyCard(deck[cursor++]));
    }
  }
  return {
    phase: "choose_trump",
    hakemSeat,
    currentSeat: hakemSeat,
    trumpSuit: null,
    hands,
    currentTrick: [],
    trickWinners: [],
    scores: [0, 0],
    deckCursor: cursor,
    seenCards: new Set(hands.flat().map(cardId)),
    // Hidden undealt cards stay server-side; clients never submit the remaining deck.
    undealtDeck: deck.slice(20).map(copyCard)
  };
}

export function chooseTrump(state, seat, suit) {
  if (state.phase !== "choose_trump") throw new Error("Round is not waiting for trump selection");
  if (seat !== state.hakemSeat) throw new Error("Only the hakem may choose trump");
  if (!SUITS.includes(suit)) throw new RangeError("Invalid trump suit");
  const remainingDeck = state.undealtDeck;
  if (!Array.isArray(remainingDeck) || remainingDeck.length !== 32) {
    throw new Error("Server-side undealt deck is missing or invalid");
  }
  const seen = new Set(state.seenCards);
  for (const card of remainingDeck) {
    const id = cardId(card);
    if (seen.has(id)) throw new Error("Remaining deck contains an already dealt card");
    seen.add(id);
  }
  if (seen.size !== 52) throw new Error("Remaining deck is incomplete or invalid");

  const next = {
    ...state,
    hands: cloneHands(state.hands),
    currentTrick: [],
    trickWinners: [...state.trickWinners],
    scores: [...state.scores],
    seenCards: seen,
    undealtDeck: [],
    trumpSuit: suit,
    phase: "playing",
    deckCursor: 52
  };
  let cursor = 0;
  for (let i = 0; i < 8; i += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      next.hands[(state.hakemSeat + offset) % 4].push(copyCard(remainingDeck[cursor++]));
    }
  }
  return next;
}

export function playCard(state, seat, card) {
  if (state.phase !== "playing") throw new Error("Round is not accepting card plays");
  if (seat !== state.currentSeat) throw new Error("It is not this seat's turn");
  const hand = state.hands[seat];
  const wantedId = cardId(card);
  const index = hand.findIndex((candidate) => cardId(candidate) === wantedId);
  if (index < 0) throw new Error("Card is not in this player's hand");
  const legal = legalCards(hand, state.currentTrick);
  if (!legal.some((candidate) => cardId(candidate) === wantedId)) {
    throw new Error("Illegal play: must follow the lead suit when possible");
  }

  const hands = cloneHands(state.hands);
  hands[seat].splice(index, 1);
  const currentTrick = [...state.currentTrick, { seat, card: copyCard(card) }];
  const base = {
    ...state,
    hands,
    currentTrick,
    trickWinners: [...state.trickWinners],
    scores: [...state.scores]
  };

  if (currentTrick.length < 4) {
    return { ...base, currentSeat: nextSeat(seat) };
  }

  const result = resolveTrick(currentTrick, state.trumpSuit);
  const trickWinners = [...state.trickWinners, result.winnerSeat];
  const scores = [...state.scores];
  scores[teamForSeat(result.winnerSeat)] += 1;
  const roundFinished = scores[0] >= 7 || scores[1] >= 7 || trickWinners.length === 13;
  return {
    ...base,
    currentTrick: [],
    trickWinners,
    scores,
    currentSeat: result.winnerSeat,
    phase: roundFinished ? "completed" : "playing",
    lastTrick: result
  };
}

/** A client-safe view for one seat; no opponent hand or hidden deck is returned. */
export function roundViewForSeat(state, seat) {
  assertSeat(seat);
  const view = {
    phase: state.phase,
    hakemSeat: state.hakemSeat,
    currentSeat: state.currentSeat,
    trumpSuit: state.trumpSuit,
    currentTrick: state.currentTrick.map((play) => ({ seat: play.seat, card: copyCard(play.card) })),
    trickWinners: [...state.trickWinners],
    scores: [...state.scores],
    ownSeat: seat,
    ownHand: state.hands[seat].map(copyCard)
  };
  if (state.lastTrick) view.lastTrick = { ...state.lastTrick, winningCard: copyCard(state.lastTrick.winningCard) };
  return Object.freeze(view);
}
