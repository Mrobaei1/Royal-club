import 'manch_engine.dart';
import 'manch_game_state.dart';

/// Deterministic offline opponent policy. It only chooses among engine-approved
/// moves and never mutates game state or affects online/ranked play.
class ManchBot {
  const ManchBot();

  ManchMove? chooseMove(ManchGameState state) {
    final moves = const ManchEngine().legalMoves(state);
    if (moves.isEmpty) return null;

    ManchMove? best;
    var bestScore = -1;
    for (final move in moves) {
      final score = _score(move);
      if (score > bestScore ||
          (score == bestScore &&
              (best == null || move.tokenIndex < best.tokenIndex))) {
        best = move;
        bestScore = score;
      }
    }
    return best;
  }

  int _score(ManchMove move) {
    if (move.toProgress == ManchEngine.finish) return 10000;
    var score = move.toProgress - move.fromProgress;
    if (move.isCapture) score += 1000;
    if (move.isEntry) score += 100;
    if (move.toProgress >= 52) {
      score += 250 + (move.toProgress - 52) * 10;
    }
    return score;
  }
}
