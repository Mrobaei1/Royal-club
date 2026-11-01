import 'manch_rule_profile.dart';

enum ManchColour { red, green, yellow, blue }

class ManchPlayerState {
  ManchPlayerState({required this.colour, List<int>? tokens})
      : tokens = List<int>.unmodifiable(tokens ?? List.filled(4, -1)) {
    if (this.tokens.length != 4 ||
        this.tokens.any((p) => p < -1 || p > 57)) {
      throw ArgumentError('A player must have four valid token positions.');
    }
  }

  final ManchColour colour;
  /// -1 = yard; 0..51 = shared track; 52..56 = home lane; 57 = finished.
  final List<int> tokens;

  ManchPlayerState withTokens(List<int> next) =>
      ManchPlayerState(colour: colour, tokens: next);
}

class ManchGameState {
  ManchGameState({
    required List<ManchPlayerState> players,
    required this.activePlayerIndex,
    required this.profile,
    this.pendingDice,
    this.consecutiveSixes = 0,
    this.turnNumber = 1,
    this.winnerIndex,
  }) : players = List<ManchPlayerState>.unmodifiable(players) {
    profile.validate();
    if (players.length < 2 || players.length > 4) {
      throw ArgumentError('Manch supports two to four players.');
    }
    if (activePlayerIndex < 0 || activePlayerIndex >= players.length) {
      throw ArgumentError('Invalid active player index.');
    }
    if (pendingDice != null && (pendingDice! < 1 || pendingDice! > 6)) {
      throw ArgumentError('Dice must be between 1 and 6.');
    }
    if (winnerIndex != null &&
        (winnerIndex! < 0 || winnerIndex! >= players.length)) {
      throw ArgumentError('Invalid winner index.');
    }
  }

  final List<ManchPlayerState> players;
  final int activePlayerIndex;
  final ManchRuleProfile profile;
  final int? pendingDice;
  final int consecutiveSixes;
  final int turnNumber;
  final int? winnerIndex;
  bool get isFinished => winnerIndex != null;

  ManchGameState copyWith({
    List<ManchPlayerState>? players,
    int? activePlayerIndex,
    ManchRuleProfile? profile,
    Object? pendingDice = _unset,
    int? consecutiveSixes,
    int? turnNumber,
    Object? winnerIndex = _unset,
  }) => ManchGameState(
    players: players ?? this.players,
    activePlayerIndex: activePlayerIndex ?? this.activePlayerIndex,
    profile: profile ?? this.profile,
    pendingDice: identical(pendingDice, _unset) ? this.pendingDice : pendingDice as int?,
    consecutiveSixes: consecutiveSixes ?? this.consecutiveSixes,
    turnNumber: turnNumber ?? this.turnNumber,
    winnerIndex: identical(winnerIndex, _unset) ? this.winnerIndex : winnerIndex as int?,
  );
}
const Object _unset = Object();
