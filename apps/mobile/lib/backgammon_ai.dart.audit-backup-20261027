import 'dart:math';
import 'backgammon_engine.dart';

enum BackgammonDifficulty { easy, medium, hard }

/// Selects a legal move without changing the active game.
class BackgammonAI {
  BackgammonAI({Random? random}) : _random = random ?? Random.secure();
  final Random _random;

  BackgammonMove? chooseMove(
    BackgammonEngine game, {
    BackgammonDifficulty difficulty = BackgammonDifficulty.medium,
  }) {
    final moves = game.legalMoves();
    if (moves.isEmpty) return null;
    if (difficulty == BackgammonDifficulty.easy) {
      return moves[_random.nextInt(moves.length)];
    }

    var best = double.negativeInfinity;
    final candidates = <BackgammonMove>[];
    for (final move in moves) {
      final next = _copy(game);
      if (!next.playMove(move)) continue;
      final score = _score(next, game.currentPlayer, difficulty);
      if (score > best + 0.0001) {
        best = score;
        candidates
          ..clear()
          ..add(move);
      } else if ((score - best).abs() <= 0.0001) {
        candidates.add(move);
      }
    }
    return candidates.isEmpty
        ? moves.first
        : candidates[_random.nextInt(candidates.length)];
  }

  BackgammonEngine _copy(BackgammonEngine source) {
    final game = BackgammonEngine(random: _FixedRandom());
    for (var i = 0; i < 24; i++) {
      game.points[i] = source.points[i];
    }
    for (var i = 0; i < 2; i++) {
      game.bar[i] = source.bar[i];
      game.borneOff[i] = source.borneOff[i];
    }
    game.dice = List<int>.from(source.dice);
    game.currentPlayer = source.currentPlayer;
    game.finished = source.finished;
    game.winner = source.winner;
    return game;
  }

  double _score(
    BackgammonEngine game,
    int player,
    BackgammonDifficulty difficulty,
  ) {
    if (game.finished) return game.winner == player ? 100000 : -100000;
    final own = player == 1 ? 1 : 0;
    final enemy = 1 - own;
    var score = (game.borneOff[own] - game.borneOff[enemy]) * 24.0;
    score -= game.bar[own] * 18.0;
    score += game.bar[enemy] * 18.0;
    var made = 0, blots = 0, home = 0, pips = 0;
    for (var i = 0; i < 24; i++) {
      final count = game.points[i] * player;
      if (count <= 0) continue;
      if (count >= 2) made++;
      if (count == 1) blots++;
      if ((player == 1 && i >= 18) || (player == -1 && i <= 5)) {
        home += count;
      }
      pips += count * (player == 1 ? 24 - i : i + 1);
    }
    score += made * (difficulty == BackgammonDifficulty.hard ? 3.5 : 2.5);
    score -= blots * (difficulty == BackgammonDifficulty.hard ? 3.0 : 1.5);
    score += home * 0.35;
    score -= pips * (difficulty == BackgammonDifficulty.hard ? 0.16 : 0.1);
    if (difficulty == BackgammonDifficulty.hard) {
      var run = 0, longest = 0;
      for (var i = 0; i < 24; i++) {
        if (game.points[i] * player >= 2) {
          run++;
          longest = max(longest, run);
        } else {
          run = 0;
        }
      }
      score += longest * longest * 1.8;
    }
    return score;
  }
}

class _FixedRandom implements Random {
  @override
  bool nextBool() => false;
  @override
  double nextDouble() => 0.5;
  @override
  int nextInt(int max) => 0;
}
