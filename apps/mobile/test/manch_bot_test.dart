import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_bot.dart';
import 'package:royal_club/games/manch/manch_engine.dart';
import 'package:royal_club/games/manch/manch_game_state.dart';
import 'package:royal_club/games/manch/manch_rule_profile.dart';

void main() {
  const bot = ManchBot();
  const engine = ManchEngine();

  test('bot prioritizes finishing the last token over a capture', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [56, 0, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [40, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );
    final rolled = engine.roll(state, 1);
    final move = bot.chooseMove(rolled);

    expect(move, isNotNull);
    expect(move!.tokenIndex, 0);
    expect(move.toProgress, ManchEngine.finish);
  });

  test('bot chooses a capture over an ordinary progress move', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 10, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [40, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );
    final rolled = engine.roll(state, 1);
    final move = bot.chooseMove(rolled);

    expect(move, isNotNull);
    expect(move!.tokenIndex, 0);
    expect(move.isCapture, isTrue);
  });

  test('bot avoids an exposed square when another safe move is available', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 10, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [39, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );

    final move = bot.chooseMove(
      engine.roll(state, 1),
      difficulty: ManchBotDifficulty.hard,
    );

    expect(move, isNotNull);
    expect(move!.tokenIndex, 1);
    expect(move.toProgress, 11);
  });

  test('bot does not penalize an opponent threat on a safe cell', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 10, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [39, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(safeTrackIndices: {1}),
    );

    final move = bot.chooseMove(
      engine.roll(state, 1),
      difficulty: ManchBotDifficulty.hard,
    );

    expect(move, isNotNull);
    expect(move!.tokenIndex, 0);
  });

  test('easy bot prioritizes home-lane progress over a capture', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 50, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [41, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );
    final rolled = engine.roll(state, 2);

    final easy = bot.chooseMove(
      rolled,
      difficulty: ManchBotDifficulty.easy,
    );
    final normal = bot.chooseMove(
      rolled,
      difficulty: ManchBotDifficulty.normal,
    );

    expect(easy, isNotNull);
    expect(easy!.tokenIndex, 1);
    expect(easy.toProgress, 52);
    expect(normal, isNotNull);
    expect(normal!.tokenIndex, 0);
    expect(normal.isCapture, isTrue);
  });

  test('hard bot avoids an exposed square while normal bot advances', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 10, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [39, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );
    final rolled = engine.roll(state, 1);

    final normal = bot.chooseMove(
      rolled,
      difficulty: ManchBotDifficulty.normal,
    );
    final hard = bot.chooseMove(
      rolled,
      difficulty: ManchBotDifficulty.hard,
    );

    expect(normal, isNotNull);
    expect(normal!.tokenIndex, 0);
    expect(hard, isNotNull);
    expect(hard!.tokenIndex, 1);
  });

  test('hard bot avoids a capture that exposes the token to a third player', () {
    final state = ManchGameState(
      players: [
        ManchPlayerState(
          colour: ManchColour.red,
          tokens: [0, 10, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.green,
          tokens: [40, -1, -1, -1],
        ),
        ManchPlayerState(
          colour: ManchColour.yellow,
          tokens: [26, -1, -1, -1],
        ),
      ],
      activePlayerIndex: 0,
      profile: const ManchRuleProfile(),
    );

    final rolled = engine.roll(state, 1);
    final capture = engine.legalMoves(rolled).firstWhere(
      (move) => move.tokenIndex == 0,
    );
    expect(capture.isCapture, isTrue);

    final hard = bot.chooseMove(
      rolled,
      difficulty: ManchBotDifficulty.hard,
    );

    expect(hard, isNotNull);
    expect(hard!.tokenIndex, 1);
    expect(hard.toProgress, 11);
  });

  test('bot returns null when there is no pending legal move', () {
    final state = engine.newGame(playerCount: 2);
    expect(bot.chooseMove(state), isNull);
    expect(bot.chooseMove(engine.roll(state, 1)), isNull);
  });
  test('all difficulty policies always return an engine-legal move in seeded games', () {
    for (final playerCount in [2, 3, 4]) {
      for (final difficulty in ManchBotDifficulty.values) {
        var state = engine.newGame(playerCount: playerCount);
        for (var turn = 0; turn < 240 && !state.isFinished; turn++) {
          final dice = ((turn * 5 + playerCount * 3) % 6) + 1;
          state = engine.roll(state, dice);
          if (state.pendingDice == null) continue;

          final legalMoves = engine.legalMoves(state);
          if (legalMoves.isEmpty) {
            state = engine.passTurn(state);
            continue;
          }

          final chosen = bot.chooseMove(state, difficulty: difficulty);
          expect(chosen, isNotNull,
              reason: 'playerCount=$playerCount difficulty=$difficulty turn=$turn');
          final selected = chosen!;
          expect(
            legalMoves.any((move) =>
                move.playerIndex == selected.playerIndex &&
                move.tokenIndex == selected.tokenIndex &&
                move.fromProgress == selected.fromProgress &&
                move.toProgress == selected.toProgress),
            isTrue,
            reason: 'Bot selected a move outside the engine legal-move set.',
          );
          state = engine.move(state, selected.tokenIndex);
        }
      }
    }
  });


  test('all bot difficulty levels can complete seeded full games for 2–4 players', () {
    for (final playerCount in [2, 3, 4]) {
      for (final difficulty in ManchBotDifficulty.values) {
        var state = engine.newGame(playerCount: playerCount);
        var randomState = 0x13579BDF ^ (playerCount * 7919) ^ difficulty.index;
        var rolls = 0;

        while (!state.isFinished && rolls < 20000) {
          randomState = (randomState * 1664525 + 1013904223) & 0x7fffffff;
          final dice = (randomState % 6) + 1;
          state = engine.roll(state, dice);
          rolls++;

          final legalMoves = engine.legalMoves(state);
          if (legalMoves.isEmpty) {
            state = engine.passTurn(state);
            continue;
          }

          final chosen = bot.chooseMove(state, difficulty: difficulty);
          expect(chosen, isNotNull,
              reason: 'playerCount=$playerCount difficulty=$difficulty roll=$rolls');
          expect(
            legalMoves.any((move) =>
                move.playerIndex == chosen!.playerIndex &&
                move.tokenIndex == chosen.tokenIndex &&
                move.fromProgress == chosen.fromProgress &&
                move.toProgress == chosen.toProgress),
            isTrue,
            reason: 'Bot must only choose a currently legal move.',
          );
          state = engine.move(state, chosen!.tokenIndex);
        }

        expect(
          state.isFinished,
          isTrue,
          reason: 'Full game did not finish: players=$playerCount difficulty=$difficulty rolls=$rolls',
        );
        expect(state.winnerIndex, inInclusiveRange(0, playerCount - 1));
        expect(
          state.players[state.winnerIndex!].tokens.every(
            (position) => position == ManchEngine.finish,
          ),
          isTrue,
        );
      }
    }
  });

}
