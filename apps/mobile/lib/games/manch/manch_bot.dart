import 'manch_engine.dart';
import 'manch_game_state.dart';

enum ManchBotDifficulty { easy, normal, hard }

/// Deterministic offline opponent policy. It only chooses engine-approved
/// moves and never mutates state or affects online/ranked play.
class ManchBot {
  const ManchBot();

  static const Map<ManchColour, int> _starts = {
    ManchColour.red: 0,
    ManchColour.green: 13,
    ManchColour.yellow: 26,
    ManchColour.blue: 39,
  };

  ManchMove? chooseMove(
    ManchGameState state, {
    ManchBotDifficulty difficulty = ManchBotDifficulty.normal,
  }) {
    final moves = const ManchEngine().legalMoves(state);
    if (moves.isEmpty) return null;

    ManchMove? best;
    var bestScore = -1000000;
    for (final move in moves) {
      final score = _score(state, move, difficulty);
      if (score > bestScore ||
          (score == bestScore &&
              (best == null || move.tokenIndex < best.tokenIndex))) {
        best = move;
        bestScore = score;
      }
    }
    return best;
  }

  int _score(
    ManchGameState state,
    ManchMove move,
    ManchBotDifficulty difficulty,
  ) {
    if (move.toProgress == ManchEngine.finish) return 10000;

    var score = move.toProgress - move.fromProgress;
    if (move.isCapture) {
      score += switch (difficulty) {
        ManchBotDifficulty.easy => 0,
        ManchBotDifficulty.normal => 1000,
        ManchBotDifficulty.hard => 1200,
      };
    }
    if (move.isEntry) score += 100;
    if (move.toProgress >= 52) {
      score += 250 + (move.toProgress - 52) * 10;
    }

    if (difficulty != ManchBotDifficulty.hard ||
        move.toProgress >= ManchEngine.trackLength) {
      return score;
    }

    final colour = state.players[move.playerIndex].colour;
    final target = _global(colour, move.toProgress);
    if (state.profile.safeTrackIndices.contains(target)) {
      score += 35;
    } else if (_isThreatened(state, move, target)) {
      // A capture can still land in another opponent's immediate threat range
      // in 3–4 player games. Hard difficulty must account for that exposure.
      score -= 1500;
    }

    if (state.profile.blockadesEnabled &&
        state.profile.friendlyStackingEnabled) {
      final player = state.players[move.playerIndex];
      final sameCell = player.tokens.where((position) =>
          position >= 0 &&
          position < ManchEngine.trackLength &&
          _global(player.colour, position) == target).length;
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
