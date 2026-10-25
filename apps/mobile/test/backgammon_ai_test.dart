import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/backgammon_ai.dart';
import 'package:royal_club/backgammon_engine.dart';

void main() {
  group('BackgammonAI', () {
    late BackgammonEngine game;
    late BackgammonAI ai;

    setUp(() {
      game = BackgammonEngine();
      ai = BackgammonAI();
      game.points.fillRange(0, 24, 0);
      game.bar.fillRange(0, 2, 0);
      game.borneOff.fillRange(0, 2, 0);
      game.currentPlayer = 1;
      game.dice = [1, 2];
      game.finished = false;
      game.winner = null;
      game.points[0] = 2;
      game.points[10] = 2;
    });

    test('chooses a legal move at every difficulty', () {
      for (final difficulty in BackgammonDifficulty.values) {
        final move = ai.chooseMove(game, difficulty: difficulty);
        expect(move, isNotNull);
        expect(
          game.legalMoves().any((m) =>
              m.from == move!.from &&
              m.to == move.to &&
              m.die == move.die &&
              m.fromBar == move.fromBar),
          isTrue,
        );
      }
    });

    test('choosing a move does not mutate the original game', () {
      final beforePoints = List<int>.from(game.points);
      final beforeDice = List<int>.from(game.dice);
      final beforeBar = List<int>.from(game.bar);
      final beforeOff = List<int>.from(game.borneOff);
      final beforePlayer = game.currentPlayer;

      ai.chooseMove(game, difficulty: BackgammonDifficulty.hard);

      expect(game.points, beforePoints);
      expect(game.dice, beforeDice);
      expect(game.bar, beforeBar);
      expect(game.borneOff, beforeOff);
      expect(game.currentPlayer, beforePlayer);
    });

    test('returns null when no legal move is available', () {
      game.dice = [];
      expect(ai.chooseMove(game), isNull);
    });

    test('returns null when the game is finished', () {
      game.finished = true;
      game.winner = 1;
      expect(ai.chooseMove(game), isNull);
    });
  });
}
