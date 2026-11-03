import test from "node:test";
import assert from "node:assert/strict";
import { ChessGame, type Promotion } from "./engine.js";
import { Chess } from "chess.js";

test("starts from the standard position and rejects illegal moves", () => {
  const game = new ChessGame();
  assert.equal(game.snapshot().turn, "w");
  assert.ok(game.snapshot().legalMoves.includes("e2e4"));
  assert.ok(game.snapshot().legalMoves.includes("g1f3"));
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

test("checkmate takes precedence over automatic and claimable move-count draws", () => {
  const mateAtSeventyFiveMoveThreshold = new ChessGame("7k/6Q1/6K1/8/8/8/8/8 b - - 150 1").snapshot();
  assert.equal(mateAtSeventyFiveMoveThreshold.checkmate, true);
  assert.equal(mateAtSeventyFiveMoveThreshold.draw, false);
  assert.equal(mateAtSeventyFiveMoveThreshold.drawClaimable, false);
  assert.equal(mateAtSeventyFiveMoveThreshold.gameOver, true);

  const mateAtFiftyMoveThreshold = new ChessGame("7k/6Q1/6K1/8/8/8/8/8 b - - 100 1").snapshot();
  assert.equal(mateAtFiftyMoveThreshold.checkmate, true);
  assert.equal(mateAtFiftyMoveThreshold.drawClaimable, false);
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

test("distinguishes claimable 50-move and threefold draws from automatic draws", () => {
  const fifty = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 100 1").snapshot();
  assert.equal(fifty.draw, false);
  assert.equal(fifty.drawClaimable, true);
  assert.equal(fifty.drawClaimReason, "fifty_move_rule");
  assert.equal(fifty.gameOver, false);

  const seventyFive = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 150 1").snapshot();
  assert.equal(seventyFive.draw, true);
  assert.equal(seventyFive.drawClaimable, false);
  assert.equal(seventyFive.gameOver, true);

  const repetition = new ChessGame();
  for (let cycle = 0; cycle < 2; cycle++) {
    repetition.play({from:"g1",to:"f3"});
    repetition.play({from:"g8",to:"f6"});
    repetition.play({from:"f3",to:"g1"});
    repetition.play({from:"f6",to:"g8"});
  }
  assert.equal(repetition.snapshot().draw, false);
  assert.equal(repetition.snapshot().drawClaimable, true);
  assert.equal(repetition.snapshot().drawClaimReason, "threefold_repetition");
  assert.equal(repetition.snapshot().gameOver, false);
  assert.doesNotThrow(() => repetition.play({from:"g1",to:"f3"}));
});

test("a prospective legal move can create a claimable 50-move draw", () => {
  const game = new ChessGame("4k3/8/8/8/8/8/8/R3K3 w - - 99 1");
  const before = game.snapshot();
  assert.equal(before.drawClaimable, false);
  const after = game.play({from:"a1",to:"a2"});
  assert.equal(after.draw, false);
  assert.equal(after.drawClaimable, true);
  assert.equal(after.drawClaimReason, "fifty_move_rule");
});

test("fivefold repetition is an automatic draw and is restored from PGN history", () => {
  const repetition = new ChessGame();
  for (let cycle = 0; cycle < 4; cycle++) {
    repetition.play({from:"g1",to:"f3"});
    repetition.play({from:"g8",to:"f6"});
    repetition.play({from:"f3",to:"g1"});
    repetition.play({from:"f6",to:"g8"});
  }
  const snapshot = repetition.snapshot();
  assert.equal(snapshot.draw, true);
  assert.equal(snapshot.drawClaimable, false);
  assert.equal(snapshot.gameOver, true);
  const restored = new ChessGame(undefined, snapshot.pgn).snapshot();
  assert.equal(restored.draw, true);
  assert.equal(restored.gameOver, true);
});

test("rejects malformed promotion values before reaching the chess engine", () => {
  const game = new ChessGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
  assert.throws(() => game.play({from:"a7",to:"a8",promotion:"x" as "q"}), /invalid_promotion/);
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
      const move = legal[random % legal.length]!;
      const result = adapter.play({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion as Promotion } : {}),
      });
      reference.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
      assert.equal(result.fen, reference.fen(), `seed ${seed}, ply ${ply}`);
    }
  }
});


test("restores repetition history when a game is reconstructed from persisted PGN", () => {
  const original = new ChessGame();
  for (let cycle = 0; cycle < 2; cycle++) {
    original.play({from:"g1",to:"f3"});
    original.play({from:"g8",to:"f6"});
    original.play({from:"f3",to:"g1"});
    original.play({from:"f6",to:"g8"});
  }
  const saved = original.snapshot();
  assert.equal(saved.draw, false);
  assert.equal(saved.drawClaimable, true);
  const restored = new ChessGame(undefined, saved.pgn).snapshot();
  assert.equal(restored.fen, saved.fen);
  assert.equal(restored.draw, false);
  assert.equal(restored.drawClaimable, true);
  assert.equal(restored.gameOver, false);
});


test("rejects malformed runtime commands without mutating the position", () => {
  const game = new ChessGame();
  const before = game.snapshot();
  for (const command of [null, undefined, {}, {from: 1, to: "e4"}, {from: "e2", to: "e4x"}]) {
    assert.throws(() => game.play(command as never), /invalid_square/);
    assert.equal(game.snapshot().fen, before.fen);
  }
  assert.throws(() => game.play({from: "e2", to: "e4", promotion: "king" as never}), /invalid_promotion/);
  assert.equal(game.snapshot().fen, before.fen);
});

test("does not permit castling through check or moving a pinned piece", () => {
  const castleThroughCheck = new ChessGame("k4r2/8/8/8/8/8/8/4K2R w K - 0 1");
  assert.ok(!castleThroughCheck.snapshot().legalMoves.includes("e1g1"));
  assert.throws(() => castleThroughCheck.play({from: "e1", to: "g1"}), /illegal_move/);

  const pinned = new ChessGame("k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1");
  assert.ok(!pinned.snapshot().legalMoves.includes("e2d2"));
  assert.throws(() => pinned.play({from: "e2", to: "d2"}), /illegal_move/);
});

test("rejects en-passant capture that exposes the moving side king", () => {
  const game = new ChessGame("k3r3/8/8/3pPp2/8/8/8/4K3 w - f6 0 1");
  assert.ok(!game.snapshot().legalMoves.includes("e5f6"));
  assert.throws(() => game.play({from: "e5", to: "f6"}), /illegal_move/);
});

test("supports all promotion choices and preserves promoted piece in FEN", () => {
  for (const promotion of ["q", "r", "b", "n"] as const) {
    const game = new ChessGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
    const result = game.play({from: "a7", to: "a8", promotion});
    assert.match(result.fen.split(" ")[0]!, new RegExp(promotion.toUpperCase()));
    assert.match(result.san ?? "", new RegExp("=" + promotion.toUpperCase()));
  }
});

test("fivefold repetition is automatic and restores full move history from PGN", () => {
  const game = new ChessGame();
  for (let cycle = 0; cycle < 4; cycle++) {
    game.play({from: "g1", to: "f3"});
    game.play({from: "g8", to: "f6"});
    game.play({from: "f3", to: "g1"});
    game.play({from: "f6", to: "g8"});
  }
  const snapshot = game.snapshot();
  assert.equal(snapshot.draw, true);
  assert.equal(snapshot.drawClaimable, false);
  assert.equal(snapshot.drawClaimReason, null);
  assert.equal(snapshot.gameOver, true);
  const restored = new ChessGame(undefined, snapshot.pgn).snapshot();
  assert.equal(restored.fen, snapshot.fen);
  assert.equal(restored.draw, true);
  assert.equal(restored.drawClaimable, false);
  assert.equal(restored.gameOver, true);
});

test("validates malformed FEN at construction and reports no legal moves after terminal position", () => {
  assert.throws(() => new ChessGame("not-a-fen"));
  const mate = new ChessGame("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1").snapshot();
  assert.equal(mate.checkmate, true);
  assert.deepEqual(mate.legalMoves, []);
});

test("extended deterministic fuzzing covers 40 seeds and up to 250 plies per game", () => {
  for (let seed = 9; seed < 49; seed++) {
    const adapter = new ChessGame();
    const reference = new Chess();
    let random = seed;
    for (let ply = 0; ply < 250 && !reference.isGameOver(); ply++) {
      const legal = reference.moves({verbose: true});
      assert.ok(legal.length > 0, `seed ${seed}, ply ${ply}`);
      random = (random * 48271) % 2147483647;
      const move = legal[random % legal.length]!;
      const result = adapter.play({
        from: move.from,
        to: move.to,
        ...(move.promotion ? {promotion: move.promotion as Promotion} : {}),
      });
      reference.move({from: move.from, to: move.to, ...(move.promotion ? {promotion: move.promotion} : {})});
      assert.equal(result.fen, reference.fen(), `seed ${seed}, ply ${ply}`);
      assert.deepEqual(result.legalMoves, reference.moves({verbose: true}).map(m => `${m.from}${m.to}${m.promotion ?? ""}`));
    }
  }
});


test("rejects structurally invalid and impossible FEN positions", () => {
  const invalidPositions = [
    "8/8/8/8/8/8/8/8 w - - 0 1", // no kings
    "4k3/8/8/8/8/8/8/4K3 x - - 0 1", // invalid active color
    "4k3/8/8/8/8/8/8/4K3 w Z - 0 1", // invalid castling rights
    "4k3/8/8/8/8/8/8/4K3 w - - -1 1", // negative halfmove clock
    "4k3/8/8/8/8/8/8/4K3 w - - 0 0", // invalid fullmove number
    "4k3/8/8/8/8/8/8/4K3 w - - 0", // missing FEN field
  ];
  for (const fen of invalidPositions) {
    assert.throws(() => new ChessGame(fen), /.+/, `expected invalid FEN rejection: ${fen}`);
  }
});

test("rejects impossible pawn and king placements in FEN", () => {
  const invalidPositions = [
    "4k3/8/8/8/8/8/8/P3K3 w - - 0 1", // pawn on first rank
    "4k3/PPPPPPPP/8/P7/8/8/8/4K3 w - - 0 1", // nine pawns for one side
    "8/8/8/8/8/8/4k3/4K3 w - - 0 1", // adjacent kings
  ];
  for (const fen of invalidPositions) {
    assert.throws(() => new ChessGame(fen), /invalid_fen/);
  }
});

test("keeps terminal edge positions immutable when a move is attempted", () => {
  const terminalFens = [
    "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", // checkmate
    "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1", // stalemate
    "8/8/8/8/8/2k5/8/4K3 w - - 0 1", // insufficient material
  ];
  for (const fen of terminalFens) {
    const game = new ChessGame(fen);
    const before = game.snapshot();
    assert.equal(before.gameOver, true);
    assert.throws(() => game.play({from: "e1", to: "e2"}));
    assert.equal(game.snapshot().fen, before.fen);
    assert.deepEqual(game.snapshot().legalMoves, before.legalMoves);
  }
});
