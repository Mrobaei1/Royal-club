export const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type UnoColor = (typeof UNO_COLORS)[number];
export type UnoFace = number | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface UnoCard { id: string; color: UnoColor | 'wild'; face: UnoFace; }
export interface UnoPlayer { id: string; username: string; ready: boolean; connected: boolean; muted: boolean; selfMuted: boolean; hostMuted: boolean; }
export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'finished';
export type MatchToWin = 1 | 3 | 5;
export interface UnoRoom {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: UnoPlayer[];
  chatEnabled: boolean;
  voiceEnabled: boolean;
  createdAt: number;
  lastActivityAt: number;
  matchToWin: MatchToWin;
  roundsWon: Record<string, number>;
  roundsPlayed: number;
  matchWinnerId: string | null;
  game: UnoGame | null;
}
export interface UnoGame {
  players: Array<{ id: string; username: string; hand: UnoCard[] }>;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  activeColor: UnoColor;
  drawnCardId: string | null;
  unoPendingPlayerId: string | null;
  pendingWild4: { offenderId: string; targetId: string; offenderHadActiveColor: boolean } | null;
  winnerId: string | null;
  turnNumber: number;
}
export type GameAction =
  | { type: 'play'; cardId: string; chosenColor?: UnoColor }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'callUno' }
  | { type: 'catchUno' }
  | { type: 'challengeWild4' };
export interface PublicGameState {
  players: Array<{ id: string; username: string; cardCount: number }>;
  discardTop: UnoCard;
  currentPlayerId: string;
  activeColor: UnoColor;
  direction: 1 | -1;
  drawCount: number;
  winnerId: string | null;
  turnNumber: number;
  drawnCardId: string | null;
  unoPendingPlayerId: string | null;
}
export class UnoError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'UnoError'; }
}
