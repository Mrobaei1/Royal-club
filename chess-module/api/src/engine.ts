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
  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  play(command: MoveCommand): EngineSnapshot {
    if (!/^[a-h][1-8]$/.test(command.from) || !/^[a-h][1-8]$/.test(command.to)) {
      throw new Error("invalid_square");
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
      legalMoves: this.game.moves()
    };
  }
}
