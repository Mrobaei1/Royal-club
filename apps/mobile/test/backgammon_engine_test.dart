import 'dart:math';

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

    test('rolling again during an active turn does not replace the dice', () {
      game.dice = [2, 5];
      final firstRoll = List<int>.from(game.rollDice());

      expect(firstRoll, [2, 5]);
      expect(game.dice, [2, 5]);
    });

    test('a finished game rejects further rolls and moves', () {
      clearPosition(rolledDice: [1]);
      game.points[23] = 1;
      game.borneOff[1] = 14;
      final finalMove = game.legalMoves().single;
      expect(game.playMove(finalMove), isTrue);
      expect(game.finished, isTrue);

      final winner = game.winner;
      final pointsAfterWin = List<int>.from(game.points);
      expect(game.rollDice(), isEmpty);
      expect(game.playMove(finalMove), isFalse);
      expect(game.winner, winner);
      expect(game.points, pointsAfterWin);
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

    test('player -1 moves in the mirrored direction', () {
      clearPosition(player: -1, rolledDice: [3]);
      game.points[10] = -1;

      final moves = game.legalMoves();
      expect(moves, hasLength(1));
      expect(moves.single.from, 10);
      expect(moves.single.to, 7);
      expect(moves.single.die, 3);
    });

    test('player -1 must use the farther checker before oversized bear-off', () {
      clearPosition(player: -1, rolledDice: [6]);
      game.points[0] = -1;
      game.points[3] = -1;

      final moves = game.legalMoves();
      expect(moves.any((move) => move.from == 0 && move.to == -1), isFalse);
      expect(moves.any((move) => move.from == 3 && move.to == -1), isTrue);
    });

    test('player -1 enters from the bar only onto an open point', () {
      clearPosition(player: -1, rolledDice: [1, 2]);
      game.bar[0] = 1;
      game.points[23] = 2; // Blocks entry for die 1.
      game.points[22] = 0; // Entry for die 2 is open.

      final moves = game.legalMoves();
      expect(moves, isNotEmpty);
      expect(moves.every((move) => move.fromBar), isTrue);
      expect(moves.every((move) => move.to == 22 && move.die == 2), isTrue);
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

    test('rejects an illegal move without changing the position or dice', () {
      game.points.fillRange(0, 24, 0);
      game.dice = [1, 2];
      game.currentPlayer = 1;
      game.points[0] = 1;
      final beforePoints = List<int>.from(game.points);
      final beforeDice = List<int>.from(game.dice);

      expect(
        game.playMove(const BackgammonMove(from: 0, to: 20, die: 1)),
        isFalse,
      );
      expect(game.points, beforePoints);
      expect(game.dice, beforeDice);
      expect(game.currentPlayer, 1);
    });

    test('a blocked bar entry automatically passes the turn', () {
      final blockedGame = BackgammonEngine(random: _FixedRandom([0, 0]));
      blockedGame.points.fillRange(0, 24, 0);
      blockedGame.bar[1] = 1;
      for (var point = 0; point < 6; point++) {
        blockedGame.points[point] = -2;
      }

      blockedGame.rollDice();
      expect(blockedGame.dice, isEmpty);
      expect(blockedGame.currentPlayer, -1);
      expect(blockedGame.bar[1], 1);
    });

    test('doubles allow up to four legal checker moves', () {
      clearPosition(rolledDice: [2, 2, 2, 2]);
      game.points[0] = 1;

      for (var i = 0; i < 4; i++) {
        final moves = game.legalMoves();
        expect(moves, isNotEmpty);
        expect(moves.every((move) => move.die == 2), isTrue);
        expect(game.playMove(moves.first), isTrue);
      }

      expect(game.dice, isEmpty);
      expect(game.currentPlayer, -1);
    });

    test('oversized bear-off die cannot skip a farther checker', () {
      clearPosition(rolledDice: [6]);
      game.points[23] = 1;
      game.points[20] = 1;

      final moves = game.legalMoves();
      expect(moves.any((move) => move.from == 23 && move.to == -1), isFalse);
    });

    test(
        'illegal move leaves board, bar, borne-off counters and dice unchanged',
        () {
      clearPosition(rolledDice: [1, 2]);
      game.points[0] = 1;
      game.points[1] = -2;
      final beforePoints = List<int>.from(game.points);
      final beforeBar = List<int>.from(game.bar);
      final beforeOff = List<int>.from(game.borneOff);
      final beforeDice = List<int>.from(game.dice);

      expect(
        game.playMove(const BackgammonMove(from: 0, to: 1, die: 1)),
        isFalse,
      );
      expect(game.points, beforePoints);
      expect(game.bar, beforeBar);
      expect(game.borneOff, beforeOff);
      expect(game.dice, beforeDice);
    });

    test('turn ends when no remaining die can be played', () {
      clearPosition(rolledDice: [1, 2]);
      game.points[0] = 1;
      game.points[1] = -2; // Die 1 is blocked initially.
      game.points[3] = -2; // After playing die 2, die 1 is still blocked.

      final moves = game.legalMoves();
      expect(moves, hasLength(1));
      expect(moves.single.die, 2);
      expect(game.playMove(moves.single), isTrue);
      expect(game.dice, isEmpty);
      expect(game.currentPlayer, -1);
    });
  });
}

class _FixedRandom implements Random {
  _FixedRandom(this.values);
  final List<int> values;
  int index = 0;

  @override
  bool nextBool() => nextInt(2) == 1;

  @override
  double nextDouble() => nextInt(1000000) / 1000000;

  @override
  int nextInt(int max) => values[index++ % values.length] % max;
}
