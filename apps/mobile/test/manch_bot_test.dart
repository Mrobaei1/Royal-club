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

  test('bot returns null when there is no pending legal move', () {
    final state = engine.newGame(playerCount: 2);
    expect(bot.chooseMove(state), isNull);
    expect(bot.chooseMove(engine.roll(state, 1)), isNull);
  });
}
