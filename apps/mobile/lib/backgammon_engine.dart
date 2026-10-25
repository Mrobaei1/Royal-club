import 'dart:math';

class BackgammonMove {
  final int from;
  final int to;
  final int die;
  final bool fromBar;

  const BackgammonMove({
    required this.from,
    required this.to,
    required this.die,
    this.fromBar = false,
  });

  @override
  String toString() =>
      fromBar ? 'Bar -> $to (die $die)' : '$from -> $to (die $die)';
}

class BackgammonEngine {
  BackgammonEngine({Random? random}) : _random = random ?? Random.secure() {
    reset();
  }

  final Random _random;

  /// Positive checkers move toward point 24; negative checkers toward point -1.
  final List<int> points = List<int>.filled(24, 0);

  /// Index 0: player -1; index 1: player +1.
  final List<int> bar = [0, 0];
  final List<int> borneOff = [0, 0];

  List<int> dice = [];
  int currentPlayer = 1;
  bool finished = false;
  int? winner;

  int get _slot => _barSlot(currentPlayer);

  int _barSlot(int player) => player == 1 ? 1 : 0;

  void reset() {
    points.fillRange(0, 24, 0);
    bar[0] = bar[1] = 0;
    borneOff[0] = borneOff[1] = 0;

    points[0] = 2;
    points[11] = 5;
    points[16] = 3;
    points[18] = 5;
    points[23] = -2;
    points[12] = -5;
    points[7] = -3;
    points[5] = -5;

    dice = [];
    currentPlayer = 1;
    finished = false;
    winner = null;
  }

  List<int> rollDice() {
    if (finished || dice.isNotEmpty) return List.unmodifiable(dice);

    final a = _random.nextInt(6) + 1;
    final b = _random.nextInt(6) + 1;
    dice = a == b ? [a, a, a, a] : [a, b];

    // Automatically pass if no die can be played.
    if (legalMoves().isEmpty) {
      dice.clear();
      currentPlayer *= -1;
    }
    return List.unmodifiable(dice);
  }

  bool _allInHome(int player, List<int> board, List<int> bars) {
    if (bars[_barSlot(player)] > 0) return false;

    for (var i = 0; i < 24; i++) {
      if (board[i] * player > 0) {
        if (player == 1 && i < 18) return false;
        if (player == -1 && i > 5) return false;
      }
    }
    return true;
  }

  bool _canLand(int destination, int player, List<int> board) {
    if (destination < 0 || destination >= 24) return false;
    return board[destination] * player >= -1;
  }

  List<BackgammonMove> _rawMovesForDie(
    int player,
    int die,
    List<int> board,
    List<int> bars,
    List<int> off,
  ) {
    final result = <BackgammonMove>[];
    final slot = _barSlot(player);

    // A checker on the bar must enter before any other checker can move.
    if (bars[slot] > 0) {
      final destination = player == 1 ? 24 - die : die - 1;
      if (_canLand(destination, player, board)) {
        result.add(BackgammonMove(
          from: -1,
          to: destination,
          die: die,
          fromBar: true,
        ));
      }
      return result;
    }

    for (var from = 0; from < 24; from++) {
      if (board[from] * player <= 0) continue;
      final destination = from + player * die;

      if (destination >= 0 && destination < 24) {
        if (_canLand(destination, player, board)) {
          result.add(BackgammonMove(from: from, to: destination, die: die));
        }
        continue;
      }

      if (!_allInHome(player, board, bars)) continue;

      final exactDistance = player == 1 ? 24 - from : from + 1;
      if (die == exactDistance) {
        result.add(BackgammonMove(from: from, to: -1, die: die));
      } else if (die > exactDistance) {
        var hasFartherChecker = false;
        if (player == 1) {
          for (var i = 18; i < from; i++) {
            if (board[i] > 0) {
              hasFartherChecker = true;
              break;
            }
          }
        } else {
          for (var i = from + 1; i <= 5; i++) {
            if (board[i] < 0) {
              hasFartherChecker = true;
              break;
            }
          }
        }
        if (!hasFartherChecker) {
          result.add(BackgammonMove(from: from, to: -1, die: die));
        }
      }
    }
    return result;
  }

  void _applyToState(
    BackgammonMove move,
    int player,
    List<int> board,
    List<int> bars,
    List<int> off,
  ) {
    final slot = _barSlot(player);
    if (move.fromBar) {
      bars[slot]--;
    } else {
      board[move.from] -= player;
    }

    if (move.to == -1) {
      off[slot]++;
      return;
    }

    if (board[move.to] == -player) {
      board[move.to] = 0;
      bars[_barSlot(-player)]++;
    }
    board[move.to] += player;
  }

  List<List<BackgammonMove>> _allSequences(
    List<int> remainingDice,
    List<int> board,
    List<int> bars,
    List<int> off,
  ) {
    if (remainingDice.isEmpty) return [[]];

    final sequences = <List<BackgammonMove>>[];
    final triedValues = <int>{};

    for (var index = 0; index < remainingDice.length; index++) {
      final die = remainingDice[index];
      if (!triedValues.add(die)) continue;

      final moves = _rawMovesForDie(currentPlayer, die, board, bars, off);
      for (final move in moves) {
        final nextBoard = List<int>.from(board);
        final nextBars = List<int>.from(bars);
        final nextOff = List<int>.from(off);
        _applyToState(move, currentPlayer, nextBoard, nextBars, nextOff);

        final nextDice = List<int>.from(remainingDice)..removeAt(index);
        final tails = _allSequences(nextDice, nextBoard, nextBars, nextOff);
        for (final tail in tails) {
          sequences.add([move, ...tail]);
        }
      }
    }

    return sequences.isEmpty ? [[]] : sequences;
  }

  /// Returns only moves that belong to a sequence using the maximum number
  /// of available dice. If only one of two different dice can be used,
  /// the higher die is required when it has a legal move.
  List<BackgammonMove> legalMoves([int? die]) {
    if (finished || dice.isEmpty) return [];

    final sequences = _allSequences(
      List<int>.from(dice),
      List<int>.from(points),
      List<int>.from(bar),
      List<int>.from(borneOff),
    );

    var maxLength = 0;
    for (final sequence in sequences) {
      if (sequence.length > maxLength) maxLength = sequence.length;
    }
    if (maxLength == 0) return [];

    var best = sequences.where((s) => s.length == maxLength).toList();

    // With two distinct dice, if only one move can be made, use the higher
    // die whenever it can legally be played.
    if (maxLength == 1 && dice.length == 2 && dice[0] != dice[1]) {
      final high = max(dice[0], dice[1]);
      final highMoves = best.where((s) => s.first.die == high).toList();
      if (highMoves.isNotEmpty) best = highMoves;
    }

    final firstMoves = <BackgammonMove>[];
    for (final sequence in best) {
      if (sequence.isEmpty) continue;
      final move = sequence.first;
      if (die != null && move.die != die) continue;
      if (!firstMoves.any((m) =>
          m.from == move.from &&
          m.to == move.to &&
          m.die == move.die &&
          m.fromBar == move.fromBar)) {
        firstMoves.add(move);
      }
    }
    return firstMoves;
  }

  bool playMove(BackgammonMove move) {
    if (finished || !dice.contains(move.die)) return false;

    final legal = legalMoves().any((candidate) =>
        candidate.from == move.from &&
        candidate.to == move.to &&
        candidate.die == move.die &&
        candidate.fromBar == move.fromBar);
    if (!legal) return false;

    _applyToState(move, currentPlayer, points, bar, borneOff);
    dice.remove(move.die);

    if (borneOff[_slot] == 15) {
      finished = true;
      winner = currentPlayer;
      dice.clear();
      return true;
    }

    if (dice.isNotEmpty && legalMoves().isEmpty) {
      dice.clear();
    }
    if (dice.isEmpty) currentPlayer *= -1;
    return true;
  }
}
