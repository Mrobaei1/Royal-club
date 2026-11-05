/**
 * Independent Hokm rules primitives for Royal Club.
 * No network, UI, database, or framework dependencies.
 *
 * This is a first milestone, not yet a complete round/match controller.
 */

export const SUITS = Object.freeze(["clubs", "diamonds", "hearts", "spades"] as const);
export const RANKS = Object.freeze(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const);
export const SEATS = Object.freeze([0, 1, 2, 3] as const);

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Seat = (typeof SEATS)[number];
export type Card = Readonly<{ suit: Suit; rank: Rank }>;
export type Play = Readonly<{ seat: Seat; card: Card }>;
export type TrickResult = Readonly<{
  winnerSeat: Seat;
  winningCard: Card;
  leadSuit: Suit;
  trumpSuit: Suit;
  winningTeam: 0 | 1;
}>;
export type PublicGameView = Readonly<{
  phase: string;
  currentSeat: Seat;
  trumpSuit: Suit | null;
  playedTricks: number;
  scores: readonly [number, number];
}>;

const rankValue = new Map<Rank, number>(RANKS.map((rank, index) => [rank, index]));

export function cardId(card: Card): string {
  assertCard(card);
  return `${card.rank}_of_${card.suit}`;
}

export function assertCard(card: unknown): asserts card is Card {
  if (typeof card !== "object" || card === null) throw new TypeError("Invalid card");
  const candidate = card as { suit?: unknown; rank?: unknown };
  if (typeof candidate.suit !== "string" || !SUITS.includes(candidate.suit as Suit) ||
      typeof candidate.rank !== "string" || !rankValue.has(candidate.rank as Rank)) {
    throw new TypeError("Invalid card");
  }
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => Object.freeze({ suit, rank })));
}

/** Fisher-Yates shuffle. Pass an injectable RNG for deterministic tests. */
export function shuffleDeck(deck: readonly Card[] = createDeck(), rng: () => number = Math.random): Card[] {
  if (!Array.isArray(deck) || deck.length !== 52) throw new TypeError("Expected a full 52-card deck");
  const result = deck.map((card) => {
    assertCard(card);
    return { suit: card.suit, rank: card.rank };
  });
  for (let i = result.length - 1; i > 0; i -= 1) {
    const sample = rng();
    if (!(sample >= 0 && sample < 1)) throw new RangeError("RNG must return a number in [0, 1)");
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function teamForSeat(seat: number): 0 | 1 {
  assertSeat(seat);
  return seat % 2 === 0 ? 0 : 1;
}

export function partnerOf(seat: number): Seat {
  assertSeat(seat);
  return ((seat + 2) % 4) as Seat;
}

function assertSeat(seat: number): asserts seat is Seat {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) {
    throw new RangeError("Seat must be 0, 1, 2, or 3");
  }
}

function assertSuit(suit: string): asserts suit is Suit {
  if (!SUITS.includes(suit as Suit)) throw new RangeError("Invalid trump/lead suit");
}

/**
 * Deals five cards per seat first, then the remaining eight per seat.
 * Seat order is clockwise starting at startSeat. Hakem selection and the
 * timing of the second deal belong to the round controller, not this helper.
 */
export function dealCards(deck: readonly Card[], startSeat = 0): Card[][] {
  assertSeat(startSeat);
  if (!Array.isArray(deck) || deck.length !== 52) throw new TypeError("Expected a 52-card deck");
  const seen = new Set<string>();
  for (const card of deck) {
    assertCard(card);
    const id = cardId(card);
    if (seen.has(id)) throw new Error("Deck contains duplicate cards");
    seen.add(id);
  }
  if (seen.size !== 52) throw new Error("Deck is incomplete");

  const hands: Card[][] = [[], [], [], []];
  let cursor = 0;
  for (let round = 0; round < 13; round += 1) {
    for (let offset = 0; offset < 4; offset += 1) {
      const seat = (startSeat + offset) % 4;
      hands[seat].push({ ...deck[cursor++] });
    }
  }
  return hands;
}

/** Return cards the player may legally play, enforcing follow suit. */
export function legalCards(hand: readonly Card[], trick: readonly Play[]): Card[] {
  if (!Array.isArray(hand) || !Array.isArray(trick)) throw new TypeError("Hand and trick must be arrays");
  hand.forEach(assertCard);
  trick.forEach((play) => assertCard(play.card));
  if (trick.length === 0) return hand.map((card) => ({ ...card }));
  if (trick.length >= 4) throw new RangeError("A trick can contain at most four plays");

  const leadSuit = trick[0].card.suit;
  const following = hand.filter((card) => card.suit === leadSuit);
  return (following.length ? following : hand).map((card) => ({ ...card }));
}

function effectiveLeadSuit(trick: readonly Play[]): Suit {
  return trick[0].card.suit;
}

/**
 * Resolves a completed four-card trick.
 * Plays must be in clockwise order and each seat must be unique.
 * Trump beats non-trump; otherwise the led suit wins; within a suit, higher
 * rank wins. Off-suit non-trump cards cannot beat a led-suit card.
 */
export function resolveTrick(trick: readonly Play[], trumpSuit: Suit): TrickResult {
  assertSuit(trumpSuit);
  if (!Array.isArray(trick) || trick.length !== 4) throw new RangeError("A trick must contain exactly four plays");
  const seats = new Set<Seat>();
  for (const play of trick) {
    assertSeat(play.seat);
    assertCard(play.card);
    if (seats.has(play.seat)) throw new Error("A seat cannot play twice in one trick");
    seats.add(play.seat);
  }
  const firstSeat = trick[0].seat;
  for (let i = 0; i < trick.length; i += 1) {
    if (trick[i].seat !== (firstSeat + i) % 4) throw new Error("Trick plays must follow clockwise seat order");
  }
  const leadSuit = effectiveLeadSuit(trick);
  const strength = (card: Card): number => {
    if (card.suit === trumpSuit) return 2;
    if (card.suit === leadSuit) return 1;
    return 0;
  };

  let winner = trick[0];
  for (const play of trick.slice(1)) {
    const candidateStrength = strength(play.card);
    const winnerStrength = strength(winner.card);
    if (candidateStrength > winnerStrength ||
        (candidateStrength === winnerStrength && candidateStrength > 0 &&
         rankValue.get(play.card.rank)! > rankValue.get(winner.card.rank)!)) {
      winner = play;
    }
  }
  return Object.freeze({
    winnerSeat: winner.seat,
    winningCard: { ...winner.card },
    leadSuit,
    trumpSuit,
    winningTeam: teamForSeat(winner.seat),
  });
}

/** Standard base scoring: first team to seven tricks wins the hand. */
export function scoreTricks(trickWinners: readonly number[]): Readonly<{
  tricks: readonly [number, number];
  winnerTeam: 0 | 1 | null;
}> {
  if (!Array.isArray(trickWinners) || trickWinners.length > 13) {
    throw new RangeError("A hand has between 0 and 13 completed tricks");
  }
  const tricks: [number, number] = [0, 0];
  for (const seat of trickWinners) tricks[teamForSeat(seat)] += 1;
  const winnerTeam = tricks[0] >= 7 ? 0 : tricks[1] >= 7 ? 1 : null;
  return Object.freeze({ tricks, winnerTeam });
}

/** Public, client-safe view. Never include hands for other seats. */
export function publicGameView({
  phase,
  currentSeat,
  trumpSuit = null,
  playedTricks = 0,
  scores = [0, 0],
}: {
  phase: string;
  currentSeat: number;
  trumpSuit?: string | null;
  playedTricks?: number;
  scores?: readonly number[];
}): PublicGameView {
  if (typeof phase !== "string") throw new TypeError("phase must be a string");
  assertSeat(currentSeat);
  if (trumpSuit !== null) assertSuit(trumpSuit);
  if (!Number.isInteger(playedTricks) || playedTricks < 0 || playedTricks > 13) {
    throw new RangeError("playedTricks must be between 0 and 13");
  }
  if (!Array.isArray(scores) || scores.length !== 2 || scores.some((score) => !Number.isInteger(score) || score < 0)) {
    throw new TypeError("scores must be two non-negative integers");
  }
  return Object.freeze({
    phase,
    currentSeat,
    trumpSuit,
    playedTricks,
    scores: [scores[0], scores[1]] as [number, number],
  });
}

export function playerPrivateView(
  publicView: PublicGameView,
  seat: number,
  hand: readonly Card[],
): Readonly<PublicGameView & { ownSeat: Seat; hand: readonly Card[] }> {
  assertSeat(seat);
  if (!Array.isArray(hand)) throw new TypeError("hand must be an array");
  hand.forEach(assertCard);
  return Object.freeze({
    ...publicView,
    ownSeat: seat,
    hand: hand.map((card) => ({ ...card })),
  });
}
