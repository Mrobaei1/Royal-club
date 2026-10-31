import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/backgammon_engine.dart';

void main() {
  group('BackgammonEngine rule audit regressions', () {
    late BackgammonEngine game;

    setUp(() => game = BackgammonEngine(random: Random(17)));

    void position({
      required int player,
      required List<int> dice,
      Map<int, int> points = const {},
      List<int> bars = const [0, 0],
      List<int> off = const [0, 0],
    }) {
      game.reset();
      game.points.fillRange(0, 24, 0);
      for (final entry in points.entries) {
        game.points[entry.key] = entry.value;
      }
      game.bar[0] = bars[0];
      game.bar[1] = bars[1];
      game.borneOff[0] = off[0];
      game.borneOff[1] = off[1];
      game.currentPlayer = player;
      game.dice = List<int>.from(dice);
    }

    test('finds a sequence where the first die must be played before the second', () {
      // +1 checker can use 2 from point 0 to 2; the 1 then reaches 3.
      // A blocked point makes the other ordering unavailable.
      position(player: 1, dice: [1, 2], points: {0: 1, 1: -2, 2: 0});
      final firstMoves = game.legalMoves();
      expect(firstMoves, isNotEmpty);
      expect(firstMoves.every((m) => m.die == 2), isTrue);
      expect(game.playMove(firstMoves.first), isTrue);
      expect(game.dice, [1]);
      expect(game.legalMoves(), isNotEmpty);
      expect(game.legalMoves().every((m) => m.die == 1), isTrue);
    });

    test('bar entry can hit a blot and sends the opponent to the bar', () {
      position(player: 1, dice: [1], bars: [0, 1], points: {0: -1});
      final move = game.legalMoves().single;
      expect(move.fromBar, isTrue);
      expect(move.to, 0);
      expect(game.playMove(move), isTrue);
      expect(game.bar, [1, 0]);
      expect(game.points[0], 1);
    });

    test('does not allow a move when every bar entry is blocked', () {
      position(player: 1, dice: [1, 2], bars: [0, 1]);
      for (var p = 0; p < 6; p++) {
        game.points[p] = -2;
      }
      expect(game.legalMoves(), isEmpty);
    });

    test('negative player cannot bear off oversized while a farther checker exists', () {
      position(player: -1, dice: [6], points: {0: -1, 3: -1});
      expect(
        game.legalMoves().any((m) => m.from == 0 && m.to == -1),
        isFalse,
      );
      expect(
        game.legalMoves().any((m) => m.from == 3 && m.to == -1),
        isTrue,
      );
    });

    test('bearing off cannot occur while any checker is on the bar', () {
      position(player: 1, dice: [6], points: {23: 1}, bars: [0, 1]);
      expect(game.legalMoves().any((m) => m.to == -1), isFalse);
      expect(game.legalMoves().every((m) => m.fromBar), isTrue);
    });

    test('each legal move preserves all 15 checkers for both players', () {
      position(
        player: 1,
        dice: [1, 2],
        points: {0: 2, 5: -2, 10: 1, 12: -1, 18: 2, 23: -2},
        bars: [1, 1],
        off: [9, 9],
      );
      for (final move in game.legalMoves()) {
        final clone = BackgammonEngine(random: Random(1));
        clone.points.setAll(0, game.points);
        clone.bar.setAll(0, game.bar);
        clone.borneOff.setAll(0, game.borneOff);
        clone.dice = List<int>.from(game.dice);
        clone.currentPlayer = game.currentPlayer;
        expect(clone.playMove(move), isTrue);
        expect(_checkerCount(clone, 1), 15);
        expect(_checkerCount(clone, -1), 15);
      }
    });

    test('deterministic random play never loses checkers or leaves invalid dice', () {
      final random = Random(20261027);
      for (var gameIndex = 0; gameIndex < 12; gameIndex++) {
        final simulation = BackgammonEngine(random: random);
        for (var turn = 0; turn < 100 && !simulation.finished; turn++) {
          final playerAtStart = simulation.currentPlayer;
          final rolled = simulation.rollDice();
          if (rolled.isNotEmpty) {
            var moveGuard = 0;
            while (!simulation.finished &&
                simulation.currentPlayer == playerAtStart &&
                simulation.dice.isNotEmpty &&
                moveGuard++ < 4) {
              final legal = simulation.legalMoves();
              expect(legal, isNotEmpty);
              final chosen = legal[random.nextInt(legal.length)];
              expect(simulation.playMove(chosen), isTrue);
              expect(_checkerCount(simulation, 1), 15);
              expect(_checkerCount(simulation, -1), 15);
              expect(simulation.dice.every((die) => die >= 1 && die <= 6), isTrue);
            }
            expect(moveGuard, lessThanOrEqualTo(5));
          }
        }
      }
    });

    test('positive-player oversized bear-off checks higher points, mirrored from negative player', () {
      position(player: 1, dice: [6], points: {19: 1, 23: 1});
      expect(game.legalMoves().any((m) => m.from == 19 && m.to == -1), isTrue);
      expect(game.legalMoves().any((m) => m.from == 23 && m.to == -1), isFalse);

      position(player: -1, dice: [6], points: {0: -1, 3: -1});
      expect(game.legalMoves().any((m) => m.from == 0 && m.to == -1), isFalse);
      expect(game.legalMoves().any((m) => m.from == 3 && m.to == -1), isTrue);
    });

  });
}

int _checkerCount(BackgammonEngine game, int player) {
  var count = game.borneOff[player == 1 ? 1 : 0] +
      game.bar[player == 1 ? 1 : 0];
  for (final point in game.points) {
    if (point * player > 0) count += point.abs();
  }
  return count;
}
