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
  drawClaimable: boolean;
  drawClaimReason: "threefold_repetition" | "fifty_move_rule" | null;
  gameOver: boolean;
  legalMoves: string[];
};

export class ChessGame {
  private readonly game: Chess;
  private readonly repetitionCounts = new Map<string, number>();
  constructor(fen?: string, pgn?: string) {
    // chess.js 1.4 validates FEN in its constructor; it does not expose
    // Chess.validateFen as a static API.
    let parsedGame: Chess;
    try {
      if (fen !== undefined) {
        const fields = fen.trim().split(/\s+/);
        if (fields.length !== 6 || !/^(?:0|[1-9]\d*)$/.test(fields[4]!) || !/^[1-9]\d*$/.test(fields[5]!)) {
          throw new Error("FEN must contain six fields with non-negative halfmove and positive fullmove counters");
        }
      }
      parsedGame = fen === undefined ? new Chess() : new Chess(fen);
      if (fen !== undefined) {
        const pieces = parsedGame.board().flat().filter((piece): piece is NonNullable<typeof piece> => piece !== null);
        const whiteKings = pieces.filter(piece => piece.type === "k" && piece.color === "w").length;
        const blackKings = pieces.filter(piece => piece.type === "k" && piece.color === "b").length;
        if (whiteKings !== 1 || blackKings !== 1) {
          throw new Error("FEN must contain exactly one king for each side");
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid position";
      throw new Error(`invalid_fen:${detail}`);
    }
    this.game = parsedGame;
    // Replaying stored PGN restores repetition history; FEN alone cannot.
    if (pgn?.trim()) this.game.loadPgn(pgn);
    this.rebuildRepetitionCounts();
  }

  private positionKey(fen: string): string {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ");
  }

  private incrementCurrentPosition(): void {
    const key = this.positionKey(this.game.fen());
    this.repetitionCounts.set(key, (this.repetitionCounts.get(key) ?? 0) + 1);
  }

  private rebuildRepetitionCounts(): void {
    const history = this.game.history({ verbose: true });
    const positions = history.length
      ? [history[0]!.before, ...history.map(move => move.after)]
      : [this.game.fen()];
    for (const position of positions) {
      const key = this.positionKey(position);
      this.repetitionCounts.set(key, (this.repetitionCounts.get(key) ?? 0) + 1);
    }
  }

  private currentPositionRepetitions(): number {
    return this.repetitionCounts.get(this.positionKey(this.game.fen())) ?? 0;
  }

  private isFivefoldRepetition(): boolean {
    return this.currentPositionRepetitions() >= 5;
  }

  private isAutomaticDraw(): boolean {
    const halfMoveClock = Number(this.game.fen().split(/\s+/)[4] ?? 0);
    return !this.game.isCheckmate() && (
      this.game.isStalemate() ||
      this.game.isInsufficientMaterial() ||
      halfMoveClock >= 150 ||
      this.isFivefoldRepetition()
    );
  }

  private isTerminalPosition(): boolean {
    return this.game.isCheckmate() || this.isAutomaticDraw();
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
    this.incrementCurrentPosition();
    return this.snapshot(move.san);
  }

  snapshot(lastSan: string | null = null): EngineSnapshot {
    const fen = this.game.fen();
    const halfMoveClock = Number(fen.split(/\s+/)[4] ?? 0);
    const draw = this.isAutomaticDraw();
    const drawClaimReason = !draw && !this.game.isCheckmate()
      ? this.currentPositionRepetitions() >= 3
        ? "threefold_repetition"
        : halfMoveClock >= 100 ? "fifty_move_rule" : null
      : null;
    const drawClaimable = drawClaimReason !== null;
    const checkmate = this.game.isCheckmate();
    return {
      fen,
      pgn: this.game.pgn(),
      turn: this.game.turn(),
      san: lastSan,
      check: this.game.isCheck(),
      checkmate,
      draw,
      drawClaimable,
      drawClaimReason,
      gameOver: checkmate || draw,
      legalMoves: this.game.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion ?? ""}`)
    };
  }
}
