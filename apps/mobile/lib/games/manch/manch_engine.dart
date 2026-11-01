import 'manch_game_state.dart';
import 'manch_rule_profile.dart';

class ManchMove {
  const ManchMove({
    required this.playerIndex,
    required this.tokenIndex,
    required this.fromProgress,
    required this.toProgress,
    this.capturedPlayerIndex,
    this.capturedTokenIndex,
  });
  final int playerIndex;
  final int tokenIndex;
  final int fromProgress;
  final int toProgress;
  final int? capturedPlayerIndex;
  final int? capturedTokenIndex;
  bool get isEntry => fromProgress == -1 && toProgress == 0;
  bool get isCapture => capturedPlayerIndex != null;
}

class ManchEngine {
  const ManchEngine();
  static const int trackLength = 52;
  static const int finish = 57;
  static const Map<ManchColour, int> _starts = {
    ManchColour.red: 0,
    ManchColour.green: 13,
    ManchColour.yellow: 26,
    ManchColour.blue: 39,
  };

  ManchGameState newGame({
    required int playerCount,
    ManchRuleProfile profile = const ManchRuleProfile(),
  }) {
    if (playerCount < 2 || playerCount > 4) {
      throw ArgumentError('Manch supports two to four players.');
    }
    return ManchGameState(
      players: ManchColour.values.take(playerCount)
          .map((c) => ManchPlayerState(colour: c)).toList(),
      activePlayerIndex: 0,
      profile: profile,
    );
  }

  /// Dice randomness is supplied by the caller (offline RNG or trusted server).
  ManchGameState roll(ManchGameState state, int dice) {
    _ensureActive(state);
    if (state.pendingDice != null) {
      throw StateError('Use or pass the pending dice first.');
    }
    if (dice < 1 || dice > 6) throw ArgumentError.value(dice, 'dice');
    final sixes = dice == 6 ? state.consecutiveSixes + 1 : 0;
    if (dice == 6 && sixes >= state.profile.maxConsecutiveSixes &&
        state.profile.threeSixPenalty == ThreeSixPenalty.loseTurn) {
      return _advance(state.copyWith(consecutiveSixes: 0));
    }
    return state.copyWith(pendingDice: dice, consecutiveSixes: sixes);
  }

  List<ManchMove> legalMoves(ManchGameState state) {
    if (state.isFinished || state.pendingDice == null) return const [];
    final p = state.activePlayerIndex;
    final player = state.players[p];
    final dice = state.pendingDice!;
    final result = <ManchMove>[];
    for (var t = 0; t < 4; t++) {
      final from = player.tokens[t];
      if (from == finish) continue;
      if (from == -1) {
        if (!state.profile.entryFaces.contains(dice)) continue;
        final capture = _captureAt(state, p, 0);
        final move = ManchMove(playerIndex: p, tokenIndex: t,
            fromProgress: -1, toProgress: 0,
            capturedPlayerIndex: capture?.$1,
            capturedTokenIndex: capture?.$2);
        if (_destinationAllowed(state, move)) result.add(move);
        continue;
      }
      final rawTarget = from + dice;
      if (rawTarget > finish && state.profile.exactFinishRequired) continue;
      final to = rawTarget > finish ? finish : rawTarget;
      final capture = _captureAt(state, p, to);
      final move = ManchMove(playerIndex: p, tokenIndex: t,
          fromProgress: from, toProgress: to,
          capturedPlayerIndex: capture?.$1,
          capturedTokenIndex: capture?.$2);
      if (_pathOpen(state, move) && _destinationAllowed(state, move)) {
        result.add(move);
      }
    }
    return List.unmodifiable(result);
  }

  ManchGameState move(ManchGameState state, int tokenIndex) {
    _ensureActive(state);
    if (tokenIndex < 0 || tokenIndex > 3) throw ArgumentError.value(tokenIndex);
    final choices = legalMoves(state).where((m) => m.tokenIndex == tokenIndex);
    if (choices.isEmpty) throw StateError('Illegal Manch move.');
    final m = choices.first;
    final players = [...state.players];
    final ownTokens = [...players[m.playerIndex].tokens];
    ownTokens[tokenIndex] = m.toProgress;
    players[m.playerIndex] = players[m.playerIndex].withTokens(ownTokens);

    if (m.isCapture) {
      final enemy = players[m.capturedPlayerIndex!];
      final enemyTokens = [...enemy.tokens];
      enemyTokens[m.capturedTokenIndex!] = -1;
      players[m.capturedPlayerIndex!] = enemy.withTokens(enemyTokens);
    }

    if (ownTokens.every((p) => p == finish)) {
      return state.copyWith(players: players, pendingDice: null,
          winnerIndex: m.playerIndex);
    }

    final extra = (state.pendingDice == 6 && state.profile.extraRollOnSix) ||
        (m.isCapture && state.profile.extraRollOnCapture) ||
        (m.toProgress == finish && state.profile.extraRollOnFinish);
    final next = state.copyWith(
      players: players,
      pendingDice: null,
      consecutiveSixes: state.pendingDice == 6 ? state.consecutiveSixes : 0,
    );
    return extra ? next : _advance(next);
  }

  ManchGameState passTurn(ManchGameState state) {
    _ensureActive(state);
    if (state.pendingDice == null) throw StateError('No pending dice.');
    if (legalMoves(state).isNotEmpty) {
      throw StateError('A legal move exists; cannot pass.');
    }
    final passed = state.copyWith(pendingDice: null);
    if (state.pendingDice == 6 && state.profile.extraRollOnSix) {
      return passed;
    }
    return _advance(passed);
  }

  (int, int)? _captureAt(ManchGameState state, int playerIndex, int progress) {
    if (progress < 0 || progress >= 52) return null;
    final cell = _global(state.players[playerIndex].colour, progress);
    if (state.profile.safeTrackIndices.contains(cell)) return null;
    for (var p = 0; p < state.players.length; p++) {
      if (p == playerIndex) continue;
      final enemy = state.players[p];
      for (var t = 0; t < 4; t++) {
        final enemyProgress = enemy.tokens[t];
        if (enemyProgress >= 0 && enemyProgress < 52 &&
            _global(enemy.colour, enemyProgress) == cell) {
          final count = enemy.tokens.where((candidate) =>
            candidate >= 0 && candidate < 52 &&
            _global(enemy.colour, candidate) == cell).length;
          if (count == 1) return (p, t);
        }
      }
    }
    return null;
  }

  bool _destinationAllowed(ManchGameState state, ManchMove move) {
    if (move.toProgress >= 52) return true;
    final colour = state.players[move.playerIndex].colour;
    final cell = _global(colour, move.toProgress);
    final friendly = _countAt(state.players[move.playerIndex], colour, cell);
    if (!state.profile.friendlyStackingEnabled && friendly > 0) return false;

    final enemies = <(int, int)>[];
    for (var p = 0; p < state.players.length; p++) {
      if (p == move.playerIndex) continue;
      final enemy = state.players[p];
      for (var t = 0; t < 4; t++) {
        final progress = enemy.tokens[t];
        if (progress >= 0 && progress < 52 &&
            _global(enemy.colour, progress) == cell) {
          enemies.add((p, t));
        }
      }
    }
    if (enemies.length >= 2 && state.profile.blockadesEnabled) return false;
    if (enemies.length == 1 &&
        !state.profile.safeTrackIndices.contains(cell)) {
      return true;
    }
    return true;
  }

  bool _pathOpen(ManchGameState state, ManchMove move) {
    if (!state.profile.blockadesEnabled ||
        !state.profile.blockadeBlocksOpponents ||
        move.fromProgress < 0 || move.fromProgress >= 52 ||
        move.toProgress >= 52) return true;
    final colour = state.players[move.playerIndex].colour;
    for (var step = 1; step <= move.toProgress - move.fromProgress; step++) {
      final progress = move.fromProgress + step;
      if (progress >= 52) break;
      final cell = _global(colour, progress);
      var count = 0;
      for (var p = 0; p < state.players.length; p++) {
        if (p == move.playerIndex) continue;
        final enemy = state.players[p];
        for (final token in enemy.tokens) {
          if (token >= 0 && token < 52 &&
              _global(enemy.colour, token) == cell) count++;
        }
      }
      if (count >= 2) return false;
    }
    return true;
  }

  int _countAt(ManchPlayerState player, ManchColour colour, int cell) =>
      player.tokens.where((p) => p >= 0 && p < 52 &&
          _global(colour, p) == cell).length;

  int _global(ManchColour colour, int progress) =>
      (_starts[colour]! + progress) % trackLength;

  ManchGameState _advance(ManchGameState state) => state.copyWith(
    activePlayerIndex: (state.activePlayerIndex + 1) % state.players.length,
    pendingDice: null,
    consecutiveSixes: 0,
    turnNumber: state.turnNumber + 1,
  );

  void _ensureActive(ManchGameState state) {
    if (state.isFinished) throw StateError('Game already finished.');
  }
}
