import test from "node:test";
import assert from "node:assert/strict";
import { ChessGame } from "./engine.js";
import { Chess } from "chess.js";

test("starts from the standard position and rejects illegal moves", () => {
  const game = new ChessGame();
  assert.equal(game.snapshot().turn, "w");
  assert.throws(() => game.play({from:"e2",to:"e5"}), /illegal_move/);
  assert.equal(game.snapshot().fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
});
test("supports legal moves, SAN and PGN", () => {
  const game = new ChessGame();
  assert.equal(game.play({from:"e2",to:"e4"}).san, "e4");
  assert.equal(game.play({from:"e7",to:"e5"}).san, "e5");
  assert.equal(game.play({from:"g1",to:"f3"}).san, "Nf3");
  assert.match(game.snapshot().pgn ?? '', /1\. e4 e5 2\. Nf3/);
});
test("supports castling, en passant and promotion", () => {
  const castle = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(castle.play({from:"e1",to:"g1"}).san, "O-O");
  const ep = new ChessGame();
  for (const [from,to] of [["e2","e4"],["a7","a6"],["e4","e5"],["d7","d5"]] as const) ep.play({from,to});
  assert.equal(ep.play({from:"e5",to:"d6"}).san, "exd6");
  const promotion = new ChessGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
  assert.match(promotion.play({from:"a7",to:"a8",promotion:"n"}).san ?? "", /a8=N/);
});
test("detects checkmate", () => {
  const game = new ChessGame();
  for (const [from,to] of [["f2","f3"],["e7","e5"],["g2","g4"],["d8","h4"]] as const) game.play({from,to});
  assert.equal(game.snapshot().checkmate, true);
  assert.equal(game.snapshot().gameOver, true);
});

test("detects stalemate and insufficient material", () => {
  const stalemate = new ChessGame("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1").snapshot();
  assert.equal(stalemate.check, false);
  assert.equal(stalemate.draw, true);
  assert.equal(stalemate.gameOver, true);

  const insufficient = new ChessGame("8/8/8/8/8/2k5/8/4K3 w - - 0 1").snapshot();
  assert.equal(insufficient.draw, true);
  assert.equal(insufficient.gameOver, true);
});

test("detects 50-move, 75-move and threefold repetition draws", () => {
  const fifty = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 100 1").snapshot();
  assert.equal(fifty.draw, true);

  const seventyFive = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 150 1").snapshot();
  assert.equal(seventyFive.draw, true);

  const repetition = new ChessGame();
  for (let cycle = 0; cycle < 2; cycle++) {
    repetition.play({from:"g1",to:"f3"});
    repetition.play({from:"g8",to:"f6"});
    repetition.play({from:"f3",to:"g1"});
    repetition.play({from:"f6",to:"g8"});
  }
  assert.equal(repetition.snapshot().draw, true);
  assert.equal(repetition.snapshot().gameOver, true);
});

test("rejects malformed promotion values before reaching the chess engine", () => {
  const game = new ChessGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
  assert.throws(() => game.play({from:"a7",to:"a8",promotion:"x" as "q"}), /illegal_move/);
});

test("deterministic legal-move fuzzing keeps adapter FEN in sync with chess.js", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const adapter = new ChessGame();
    const reference = new Chess();
    let random = seed;
    for (let ply = 0; ply < 100 && !reference.isGameOver(); ply++) {
      const legal = reference.moves({ verbose: true });
      assert.ok(legal.length > 0);
      random = (random * 48271) % 2147483647;
      const move = legal[random % legal.length];
      const result = adapter.play({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
      reference.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      assert.equal(result.fen, reference.fen(), `seed ${seed}, ply ${ply}`);
    }
  }
});
