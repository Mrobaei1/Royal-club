import 'manch_engine.dart';
import 'manch_game_state.dart';

/// Deterministic offline opponent policy. It only chooses among engine-approved
/// moves and never mutates game state or affects online/ranked play.
class ManchBot {
  const ManchBot();

  static const Map<ManchColour, int> _starts = {
    ManchColour.red: 0,
    ManchColour.green: 13,
    ManchColour.yellow: 26,
    ManchColour.blue: 39,
  };

  ManchMove? chooseMove(ManchGameState state) {
    final moves = const ManchEngine().legalMoves(state);
    if (moves.isEmpty) return null;

    ManchMove? best;
    var bestScore = -1000000;
    for (final move in moves) {
      final score = _score(state, move);
      if (score > bestScore ||
          (score == bestScore &&
              (best == null || move.tokenIndex < best.tokenIndex))) {
        best = move;
        bestScore = score;
      }
    }
    return best;
  }

  int _score(ManchGameState state, ManchMove move) {
    if (move.toProgress == ManchEngine.finish) return 10000;

    var score = move.toProgress - move.fromProgress;
    if (move.isCapture) score += 1000;
    if (move.isEntry) score += 100;
    if (move.toProgress >= 52) {
      score += 250 + (move.toProgress - 52) * 10;
    }

    // Prefer protected entry/safe cells and avoid handing an opponent an
    // immediate one-die capture on the next turn.
    if (move.toProgress < ManchEngine.trackLength) {
      final colour = state.players[move.playerIndex].colour;
      final target = _global(colour, move.toProgress);
      if (state.profile.safeTrackIndices.contains(target)) {
        score += 35;
      } else if (!move.isCapture && _isThreatened(state, move, target)) {
        score -= 120;
      }
    }

    // A stack is harder to capture when blockade rules are enabled.
    if (state.profile.blockadesEnabled &&
        state.profile.friendlyStackingEnabled &&
        move.toProgress < ManchEngine.trackLength) {
      final player = state.players[move.playerIndex];
      final sameCell = player.tokens.where((position) =>
          position >= 0 &&
          position < ManchEngine.trackLength &&
          _global(player.colour, position) ==
              _global(player.colour, move.toProgress)).length;
      if (sameCell > 0) score += 20;
    }
    return score;
  }

  bool _isThreatened(
    ManchGameState state,
    ManchMove move,
    int targetCell,
  ) {
    for (var playerIndex = 0;
        playerIndex < state.players.length;
        playerIndex++) {
      if (playerIndex == move.playerIndex) continue;
      final opponent = state.players[playerIndex];
      for (final progress in opponent.tokens) {
        if (progress < 0 || progress >= ManchEngine.trackLength) continue;
        final opponentCell = _global(opponent.colour, progress);
        final distance =
            (targetCell - opponentCell + ManchEngine.trackLength) %
                ManchEngine.trackLength;
        if (distance >= 1 && distance <= 6) return true;
      }
    }
    return false;
  }

  int _global(ManchColour colour, int progress) =>
      (_starts[colour]! + progress) % ManchEngine.trackLength;
}
