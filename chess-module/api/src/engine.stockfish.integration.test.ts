import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Chess } from "chess.js";
import { ChessGame } from "./engine.js";

const stockfishPath = process.env.STOCKFISH_PATH;

test("independent Stockfish perft agrees with adapter and reference legal moves across edge and generated positions", {
  skip: !stockfishPath || !existsSync(stockfishPath),
  timeout: 30_000,
}, () => {
  const positions = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
    "7k/P7/8/8/8/8/8/7K w - - 0 1",
    "k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1",
    "k4r2/8/8/8/8/8/8/4K2R w K - 0 1",
    "7k/5K2/6Q1/8/8/8/8/8 b - - 0 1",
  ];

  for (let seed = 1; seed <= 12; seed += 1) {
    const game = new Chess();
    let random = seed;
    for (let ply = 0; ply < 24 && !game.isGameOver(); ply += 1) {
      const legal = game.moves({ verbose: true });
      random = (random * 48271) % 2147483647;
      game.move(legal[random % legal.length]!);
      if (ply % 6 === 5 && !game.isGameOver()) positions.push(game.fen());
    }
  }

  const input = [
    "uci",
    "isready",
    ...positions.flatMap((fen) => [`position fen ${fen}`, "go perft 2"]),
    "position startpos",
    "go perft 3",
    "quit",
  ].join("\n") + "\n";
  const result = spawnSync(stockfishPath!, [], {
    input,
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  const sections = result.stdout.split(/Nodes searched:\s*\d+/i);
  assert.equal(sections.length - 1, positions.length + 1, result.stdout);

  positions.forEach((fen, index) => {
    const expectedLegal = new ChessGame(fen).snapshot().legalMoves.sort();
    const section = sections[index]!;
    const actualMoves = [...(section.match(
      /^[a-h][1-8][a-h][1-8][qrbn]?:\s+\d+$/gm,
    ) ?? [])].map((line) => line.split(":")[0]!).sort();
    assert.deepEqual(actualMoves, expectedLegal, `Stockfish legal moves differ for FEN: ${fen}`);

    const referenceCounts = new Map<string, number>();
    const reference = new Chess(fen);
    for (const move of reference.moves({ verbose: true })) {
      const branch = new Chess(fen);
      branch.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
      referenceCounts.set(`${move.from}${move.to}${move.promotion ?? ""}`, branch.moves().length);
    }
    const actualCounts = new Map(
      [...(section.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?):\s+(\d+)$/gm))]
        .map((match) => [match[1]!, Number(match[2])]),
    );
    assert.deepEqual(
      [...actualCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
      [...referenceCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
      `Stockfish perft-2 branch counts differ for FEN: ${fen}`,
    );
  });

  const initialPositionPerft3 = Number(
    result.stdout.match(/Nodes searched:\s*(\d+)\s*$/m)?.[1],
  );
  assert.equal(initialPositionPerft3, 8902, "standard initial-position perft-3 must equal 8,902");
});
