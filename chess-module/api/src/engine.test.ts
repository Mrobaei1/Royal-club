import test from "node:test";
import assert from "node:assert/strict";
import { ChessGame } from "./engine.js";

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
  assert.match(game.snapshot().pgn, /1\. e4 e5 2\. Nf3/);
});
test("supports castling, en passant and promotion", () => {
  const castle = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  assert.equal(castle.play({from:"e1",to:"g1"}).san, "O-O");
  const ep = new ChessGame();
  for (const [from,to] of [["e2","e4"],["a7","a6"],["e4","e5"],["d7","d5"]] as const) ep.play({from,to});
  assert.equal(ep.play({from:"e5",to:"d6"}).san, "exd6");
  const promotion = new ChessGame("7k/P7/8/8/8/8/8/7K w - - 0 1");
  assert.match(promotion.play({from:"a7",to:"a8",promotion:"n"}).san, /a8=N/);
});
test("detects checkmate", () => {
  const game = new ChessGame();
  for (const [from,to] of [["f2","f3"],["e7","e5"],["g2","g4"],["d8","h4"]] as const) game.play({from,to});
  assert.equal(game.snapshot().checkmate, true);
  assert.equal(game.snapshot().gameOver, true);
});
