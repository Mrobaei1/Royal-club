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

  test('bot returns null when there is no pending legal move', () {
    final state = engine.newGame(playerCount: 2);
    expect(bot.chooseMove(state), isNull);
    expect(bot.chooseMove(engine.roll(state, 1)), isNull);
  });
}
