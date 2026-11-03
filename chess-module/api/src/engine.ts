import { Chess, type Square } from "chess.js";

export type Promotion = "q" | "r" | "b" | "n";
export type MoveCommand = { from: string; to: string; promotion?: Promotion };
export type EngineSnapshot = {
  fen: string;
  pgn: string;
  turn: "w" | "b";
  san: string | null;
  check: boolean;
  checkmate: boolean;
  draw: boolean;
  gameOver: boolean;
  legalMoves: string[];
};

export class ChessGame {
  private readonly game: Chess;
  constructor(fen?: string, pgn?: string) {
    // chess.js 1.4 validates FEN in its constructor; it does not expose
    // Chess.validateFen as a static API.
    let parsedGame: Chess;
    try {
      parsedGame = fen === undefined ? new Chess() : new Chess(fen);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid position";
      throw new Error(`invalid_fen:${detail}`);
    }
    this.game = parsedGame;
    // Replaying the stored PGN restores repetition history; FEN alone cannot.
    if (pgn?.trim()) this.game.loadPgn(pgn);
  }

  private isTerminalPosition(): boolean {
    // Threefold repetition and the 50-move rule are claimable draws, not
    // automatic game termination. Keep allowing moves until a terminal
    // position is reached; chess.js isGameOver() also treats claims as over.
    return this.game.isCheckmate() ||
      this.game.isStalemate() ||
      this.game.isInsufficientMaterial();
  }

  play(command: MoveCommand): EngineSnapshot {
    if (this.isTerminalPosition()) throw new Error("game_over");
    if (!command || typeof command !== "object" ||
        typeof command.from !== "string" || typeof command.to !== "string" ||
        !/^[a-h][1-8]$/.test(command.from) || !/^[a-h][1-8]$/.test(command.to)) {
      throw new Error("invalid_square");
    }
    if (command.promotion !== undefined && !["q", "r", "b", "n"].includes(command.promotion)) {
      throw new Error("invalid_promotion");
    }
    let move;
    try {
      move = this.game.move({
        from: command.from as Square,
        to: command.to as Square,
        ...(command.promotion ? { promotion: command.promotion } : {})
      });
    } catch {
      throw new Error("illegal_move");
    }
    return this.snapshot(move.san);
  }

  snapshot(lastSan: string | null = null): EngineSnapshot {
    return {
      fen: this.game.fen(),
      pgn: this.game.pgn(),
      turn: this.game.turn(),
      san: lastSan,
      check: this.game.isCheck(),
      checkmate: this.game.isCheckmate(),
      draw: this.game.isDraw(),
      gameOver: this.game.isGameOver(),
      legalMoves: this.game.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion ?? ""}`)
    };
  }
}
