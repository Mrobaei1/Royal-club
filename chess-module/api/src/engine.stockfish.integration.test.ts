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
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
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
    "position fen r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "go perft 3",
    "position fen 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "go perft 3",
    "position fen r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    "go perft 3",
    "position fen rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    "go perft 3",
    "position fen r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    "go perft 3",
    "position startpos",
    "go perft 4",
    "position fen r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "go perft 4",
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
  assert.equal(sections.length - 1, positions.length + 8, result.stdout);

  positions.forEach((fen, index) => {
    const expectedLegal = new ChessGame(fen).snapshot().legalMoves.sort();
    const section = sections[index]!;
    const actualMoves = [...(section.match(
      /^[a-h][1-8][a-h][1-8][qrbn]?:\s+\d+$/gm,
    ) ?? [])].map((line) => line.split(":")[0]!).sort();
    assert.deepEqual(actualMoves, expectedLegal, `Stockfish legal moves differ for FEN: ${fen}`);

    const referenceCounts = new Map<string, number>();
    for (const move of new Chess(fen).moves({ verbose: true })) {
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

  const totals = [...result.stdout.matchAll(/Nodes searched:\s*(\d+)/g)];
  const initialPositionPerft3 = Number(totals.at(-8)?.[1]);
  const kiwipetePerft3 = Number(totals.at(-7)?.[1]);
  const endgamePerft3 = Number(totals.at(-6)?.[1]);
  const promotionPerft3 = Number(totals.at(-5)?.[1]);
  const tacticalPerft3 = Number(totals.at(-4)?.[1]);
  const middlegamePerft3 = Number(totals.at(-3)?.[1]);
  const initialPositionPerft4 = Number(totals.at(-2)?.[1]);
  const kiwipetePerft4 = Number(totals.at(-1)?.[1]);
  assert.equal(initialPositionPerft3, 8902, "standard initial-position perft-3 must equal 8,902");
  assert.equal(kiwipetePerft3, 97862, "standard Kiwipete perft-3 must equal 97,862");
  assert.equal(endgamePerft3, 2812, "standard endgame perft-3 must equal 2,812");
  assert.equal(promotionPerft3, 9467, "standard promotion/castling perft-3 must equal 9,467");
  assert.equal(tacticalPerft3, 62379, "standard tactical perft-3 must equal 62,379");
  assert.equal(middlegamePerft3, 89890, "standard middlegame perft-3 must equal 89,890");
  assert.equal(initialPositionPerft4, 197281, "standard initial-position perft-4 must equal 197,281");
  assert.equal(kiwipetePerft4, 4085603, "standard Kiwipete perft-4 must equal 4,085,603");
});
