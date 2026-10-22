import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/backgammon_engine.dart';

void main() {
  group('BackgammonEngine - core behavior', () {
    late BackgammonEngine game;

    setUp(() {
      game = BackgammonEngine();
    });

    void clearPosition({int player = 1, List<int> rolledDice = const []}) {
      game.points.fillRange(0, 24, 0);
      game.bar[0] = 0;
      game.bar[1] = 0;
      game.borneOff[0] = 0;
      game.borneOff[1] = 0;
      game.currentPlayer = player;
      game.dice = List<int>.from(rolledDice);
      game.finished = false;
      game.winner = null;
    }

    test('reset creates the standard 24-point board and clears game state', () {
      expect(game.points, hasLength(24));
      expect(game.points[0], 2);
      expect(game.points[11], 5);
      expect(game.points[16], 3);
      expect(game.points[18], 5);
      expect(game.points[23], -2);
      expect(game.points[12], -5);
      expect(game.points[7], -3);
      expect(game.points[5], -5);
      expect(game.currentPlayer, 1);
      expect(game.finished, isFalse);
      expect(game.winner, isNull);
      expect(game.dice, isEmpty);
      expect(game.bar, [0, 0]);
      expect(game.borneOff, [0, 0]);
    });

    test('rolling dice produces valid values and doubles produce four dice',
        () {
      game.rollDice();
      expect(game.dice, isNotEmpty);
      expect(game.dice.length, anyOf(2, 4));
      for (final die in game.dice) {
        expect(die, inInclusiveRange(1, 6));
      }
    });

    test('a checker on the bar must enter before any other checker moves', () {
      clearPosition(rolledDice: [1, 2]);
      game.bar[1] = 1;
      game.points[0] = -2; // Entry for die 1 is blocked.
      game.points[10] = 1; // Must not move this checker instead.

      final moves = game.legalMoves();
      expect(moves, isNotEmpty);
      expect(moves.every((move) => move.fromBar), isTrue);
      expect(moves.every((move) => move.to == 1 && move.die == 2), isTrue);
    });

    test('hitting a single opposing checker sends it to the bar', () {
      clearPosition(rolledDice: [1, 2]);
      game.points[0] = 1;
      game.points[1] = -1;

      final hit = game.legalMoves().firstWhere(
            (move) => move.from == 0 && move.to == 1 && move.die == 1,
          );
      expect(game.playMove(hit), isTrue);
      expect(game.points[1], 1);
      expect(game.bar[0], 1);
    });

    test('the maximum number of dice must be used when possible', () {
      clearPosition(rolledDice: [1, 2]);
      game.points[0] = 1;

      final moves = game.legalMoves();
      expect(moves, isNotEmpty);
      expect(game.playMove(moves.first), isTrue);
      expect(game.dice, hasLength(1));
      expect(game.currentPlayer, 1); // Turn is not over yet.
      expect(game.legalMoves(), isNotEmpty);
    });

    test('when only one move can be made, the higher die takes priority', () {
      clearPosition(rolledDice: [1, 2]);
      game.points[23] = 1; // One checker; either die can bear it off.

      final moves = game.legalMoves();
      expect(moves, hasLength(1));
      expect(moves.single.die, 2);
      expect(moves.single.to, -1);
    });

    test('bearing off is forbidden while a checker remains outside home', () {
      clearPosition(rolledDice: [1]);
      game.points[23] = 1;
      game.points[17] = 1; // Outside player +1's home board.

      final moves = game.legalMoves();
      expect(moves.any((move) => move.from == 23 && move.to == -1), isFalse);
    });

    test('bearing off the fifteenth checker ends the game and sets the winner',
        () {
      clearPosition(rolledDice: [1]);
      game.points[23] = 1;
      game.borneOff[1] = 14;

      final move = game.legalMoves().singleWhere(
            (candidate) => candidate.from == 23 && candidate.to == -1,
          );
      expect(game.playMove(move), isTrue);
      expect(game.finished, isTrue);
      expect(game.winner, 1);
      expect(game.borneOff[1], 15);
      expect(game.dice, isEmpty);
    });

    test('reset clears dice, bars, borne-off counters and winner after a roll',
        () {
      game.rollDice();
      game.reset();

      expect(game.dice, isEmpty);
      expect(game.currentPlayer, 1);
      expect(game.finished, isFalse);
      expect(game.winner, isNull);
      expect(game.bar, [0, 0]);
      expect(game.borneOff, [0, 0]);
    });
  });
}
