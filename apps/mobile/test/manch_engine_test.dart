import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_engine.dart';
import 'package:royal_club/games/manch/manch_board_geometry.dart';
import 'package:royal_club/games/manch/manch_game_state.dart';
import 'package:royal_club/games/manch/manch_rule_profile.dart';

void main() {
  const engine = ManchEngine();

  group('ManchEngine', () {
    test('creates two to four players with four tokens in the yard', () {
      final state = engine.newGame(playerCount: 4);
      expect(state.players, hasLength(4));
      for (final player in state.players) {
        expect(player.tokens, equals([-1, -1, -1, -1]));
      }
      expect(() => engine.newGame(playerCount: 1), throwsArgumentError);
    });

    test('assigns opposing seats in a two-player match', () {
      final state = engine.newGame(playerCount: 2);
      expect(state.players.map((player) => player.colour).toList(),
          [ManchColour.red, ManchColour.yellow]);
    });

    test('requires an entry face and grants an extra roll after six', () {
      final state = engine.newGame(playerCount: 2);
      final noEntry = engine.roll(state, 5);
      expect(engine.legalMoves(noEntry), isEmpty);
      final afterPass = engine.passTurn(noEntry);
      expect(afterPass.activePlayerIndex, 1);

      final sixState = engine.roll(state, 6);
      expect(engine.legalMoves(sixState).map((m) => m.tokenIndex),
          equals([0, 1, 2, 3]));
      final moved = engine.move(sixState, 0);
      expect(moved.players[0].tokens[0], 0);
      expect(moved.activePlayerIndex, 0);
      expect(moved.pendingDice, isNull);
    });

    test('captures one opponent token on a non-safe shared cell', () {
      final profile = const ManchRuleProfile();
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [0, -1, -1, -1]),
          ManchPlayerState(colour: ManchColour.green, tokens: [40, -1, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: profile,
      );
      final rolled = engine.roll(state, 1);
      final move = engine.legalMoves(rolled).single;
      expect(move.isCapture, isTrue);
      final next = engine.move(rolled, move.tokenIndex);
      expect(next.players[1].tokens[0], -1);
      expect(next.players[0].tokens[0], 1);
      expect(next.activePlayerIndex, 1);
    });

    test('does not capture an opponent on a configured safe cell', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [12, -1, -1, -1]),
          ManchPlayerState(colour: ManchColour.green, tokens: [0, -1, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
      );
      final rolled = engine.roll(state, 1);
      expect(engine.legalMoves(rolled).single.isCapture, isFalse);
      final next = engine.move(rolled, 0);
      expect(next.players[1].tokens[0], 0);
    });

    test('requires exact count to finish and declares the winner', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [56, 57, 57, 57]),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
      );
      final overshoot = engine.roll(state, 2);
      expect(engine.legalMoves(overshoot), isEmpty);
      expect(engine.passTurn(overshoot).activePlayerIndex, 1);

      final exact = engine.roll(state, 1);
      final won = engine.move(exact, 0);
      expect(won.isFinished, isTrue);
      expect(won.winnerIndex, 0);
    });

    test('allows landing on a blockade when the profile disables opponent blocking', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red),
          ManchPlayerState(colour: ManchColour.green, tokens: [39, 39, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(
          blockadesEnabled: true,
          blockadeBlocksOpponents: false,
        ),
      );
      final rolled = engine.roll(state, 6);
      expect(engine.legalMoves(rolled), hasLength(4));
      final moved = engine.move(rolled, 0);
      expect(moved.players[0].tokens[0], 0);
      expect(moved.players[1].tokens.take(2), [39, 39]);
    });

    test('blockades block landing and passing when enabled', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [0, -1, -1, -1]),
          ManchPlayerState(colour: ManchColour.green, tokens: [40, 40, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(
          blockadesEnabled: true,
          blockadeBlocksOpponents: true,
        ),
      );
      final rolled = engine.roll(state, 2);
      expect(engine.legalMoves(rolled), isEmpty);
      expect(engine.passTurn(rolled).activePlayerIndex, 1);
    });

    test('blockade before home lane still blocks the final shared-track step', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [50, 57, 57, 57]),
          ManchPlayerState(colour: ManchColour.green, tokens: [38, 38, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(
          blockadesEnabled: true,
          blockadeBlocksOpponents: true,
        ),
      );
      final rolled = engine.roll(state, 6);
      expect(engine.legalMoves(rolled), isEmpty);
    });

    test('a six grants an extra roll even when no token can move', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [56, 57, 57, 57]),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
      );
      final rolled = engine.roll(state, 6);
      expect(engine.legalMoves(rolled), isEmpty);
      final passed = engine.passTurn(rolled);
      expect(passed.activePlayerIndex, 0);
      expect(passed.pendingDice, isNull);
      expect(passed.consecutiveSixes, 1);
    });

    test('optional third consecutive six penalty loses the turn', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(
          threeSixPenalty: ThreeSixPenalty.loseTurn,
        ),
        consecutiveSixes: 2,
      );
      final next = engine.roll(state, 6);
      expect(next.activePlayerIndex, 1);
      expect(next.pendingDice, isNull);
      expect(next.consecutiveSixes, 0);
    });

    test('rejects illegal moves without mutating the original state', () {
      final state = engine.newGame(playerCount: 2);
      final rolled = engine.roll(state, 3);
      expect(() => engine.move(rolled, 0), throwsStateError);
      expect(state.players[0].tokens, equals([-1, -1, -1, -1]));
      expect(rolled.pendingDice, 3);
    });

    test('game state snapshots mutable rule sets defensively', () {
      final entryFaces = <int>{6};
      final safeCells = <int>{0};
      final profile = ManchRuleProfile(
        entryFaces: entryFaces,
        safeTrackIndices: safeCells,
      );
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: profile,
      );

      entryFaces.add(1);
      safeCells.clear();

      expect(state.profile.entryFaces, {6});
      expect(state.profile.safeTrackIndices, {0});
      expect(
        () => state.profile.entryFaces.add(1),
        throwsUnsupportedError,
      );
      expect(
        () => state.profile.safeTrackIndices.clear(),
        throwsUnsupportedError,
      );
    });

    test('saves and restores a complete in-progress game', () {
      final state = engine.roll(engine.newGame(playerCount: 2), 6);
      final moved = engine.move(state, 0);
      final rolledAgain = engine.roll(moved, 3);
      final restored = ManchGameState.fromJson(rolledAgain.toJson());
      expect(restored.players.map((p) => p.tokens).toList(),
          equals(rolledAgain.players.map((p) => p.tokens).toList()));
      expect(restored.activePlayerIndex, rolledAgain.activePlayerIndex);
      expect(restored.pendingDice, rolledAgain.pendingDice);
      expect(restored.profile.toJson(), rolledAgain.profile.toJson());
      expect(restored.turnNumber, rolledAgain.turnNumber);
    });

    test('rejects duplicate seats and an invalid declared winner', () {
      expect(
        () => ManchGameState(
          players: [
            ManchPlayerState(colour: ManchColour.red),
            ManchPlayerState(colour: ManchColour.red),
          ],
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
        ),
        throwsArgumentError,
      );
      expect(
        () => ManchGameState(
          players: [
            ManchPlayerState(colour: ManchColour.red),
            ManchPlayerState(colour: ManchColour.green),
          ],
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
          winnerIndex: 0,
        ),
        throwsArgumentError,
      );
    });

    test('rejects state snapshots that violate turn and winner invariants', () {
      final players = [
        ManchPlayerState(colour: ManchColour.red),
        ManchPlayerState(colour: ManchColour.green),
      ];

      expect(
        () => ManchGameState(
          players: players,
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
          pendingDice: 6,
          consecutiveSixes: 0,
        ),
        throwsArgumentError,
      );
      expect(
        () => ManchGameState(
          players: players,
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
          pendingDice: 3,
          consecutiveSixes: 1,
        ),
        throwsArgumentError,
      );
      expect(
        () => ManchGameState(
          players: players,
          activePlayerIndex: 1,
          profile: const ManchRuleProfile(),
          winnerIndex: 0,
        ),
        throwsArgumentError,
      );
      expect(
        () => ManchGameState(
          players: [
            ManchPlayerState(
              colour: ManchColour.red,
              tokens: [57, 57, 57, 57],
            ),
            players[1],
          ],
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
        ),
        throwsArgumentError,
      );
    });

    test('rejects unsupported or incomplete save data', () {
      expect(
        () => ManchGameState.fromJson({'version': 99}),
        throwsFormatException,
      );
      expect(
        () => ManchGameState.fromJson({'version': 1, 'players': []}),
        throwsFormatException,
      );
    });

    test('rule profile serializes local variant switches', () {
      const profile = ManchRuleProfile(
        entryFaces: {1, 6},
        blockadesEnabled: true,
        extraRollOnCapture: true,
      );
      final json = profile.toJson();
      expect(json['entryFaces'], [1, 6]);
      expect(json['blockadesEnabled'], true);
      expect(json['extraRollOnCapture'], true);
    });
    test('two, three and four player seat allocations are stable', () {
      expect(
        engine.newGame(playerCount: 2).players.map((p) => p.colour).toList(),
        [ManchColour.red, ManchColour.yellow],
      );
      expect(
        engine.newGame(playerCount: 3).players.map((p) => p.colour).toList(),
        [ManchColour.red, ManchColour.green, ManchColour.yellow],
      );
      expect(
        engine.newGame(playerCount: 4).players.map((p) => p.colour).toList(),
        ManchColour.values,
      );
    });

    test('each colour enters at its own fixed shared-track offset', () {
      expect(ManchBoardGeometry.startOffsets, {
        ManchColour.red: 0,
        ManchColour.green: 13,
        ManchColour.yellow: 26,
        ManchColour.blue: 39,
      });
      final fourPlayers = engine.newGame(playerCount: 4);
      for (var playerIndex = 0;
          playerIndex < fourPlayers.players.length;
          playerIndex++) {
        final state = fourPlayers.copyWith(activePlayerIndex: playerIndex);
        final entered = engine.move(engine.roll(state, 6), 0);
        expect(
          entered.players[playerIndex].tokens[0],
          0,
          reason: '${fourPlayers.players[playerIndex].colour} must enter at progress zero.',
        );
        expect(
          ManchBoardGeometry.globalTrackIndex(
            fourPlayers.players[playerIndex].colour, 0),
          [0, 13, 26, 39][playerIndex],
        );
      }
    });

    test('base profile does not lose a turn after three consecutive sixes', () {
      var state = engine.newGame(playerCount: 2);
      for (var roll = 0; roll < 3; roll++) {
        state = engine.roll(state, 6);
        expect(state.pendingDice, 6);
        expect(state.consecutiveSixes, roll + 1);
        state = engine.move(state, 0);
        expect(state.activePlayerIndex, 0);
      }
      expect(state.players[0].tokens[0], 12);
      expect(state.consecutiveSixes, 3);
    });

    test('deterministic simulations preserve engine and serialization invariants', () {
      final random = Random(20261103);
      for (final playerCount in [2, 3, 4]) {
        for (var game = 0; game < 20; game++) {
          var state = engine.newGame(playerCount: playerCount);
          for (var turn = 0; turn < 250 && !state.isFinished; turn++) {
            state = engine.roll(state, random.nextInt(6) + 1);
            final legalMoves = engine.legalMoves(state);
            if (legalMoves.isEmpty) {
              state = engine.passTurn(state);
            } else {
              final selected = legalMoves[random.nextInt(legalMoves.length)];
              state = engine.move(state, selected.tokenIndex);
            }

            final restored = ManchGameState.fromJson(state.toJson());
            expect(restored.players.length, playerCount);
            expect(restored.activePlayerIndex, inInclusiveRange(0, playerCount - 1));
            expect(restored.players.every(
              (player) => player.tokens.length == 4 &&
                  player.tokens.every((position) => position >= -1 && position <= 57),
            ), isTrue);
            expect(restored.isFinished, state.isFinished);
            expect(restored.winnerIndex, state.winnerIndex);
            state = restored;
          }
        }
      }
    });

  });

    test('a stacked pair is not captured as one exposed token', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [0, -1, -1, -1]),
          ManchPlayerState(colour: ManchColour.green, tokens: [40, 40, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
      );
      final rolled = engine.roll(state, 1);
      final move = engine.legalMoves(rolled).single;
      expect(move.isCapture, isFalse);
      final next = engine.move(rolled, move.tokenIndex);
      expect(next.players[1].tokens.take(2), [40, 40]);
    });

    test('capture extra roll follows the configured profile', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [0, -1, -1, -1]),
          ManchPlayerState(colour: ManchColour.green, tokens: [40, -1, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(extraRollOnCapture: true),
      );
      final next = engine.move(engine.roll(state, 1), 0);
      expect(next.players[1].tokens[0], -1);
      expect(next.activePlayerIndex, 0);
      expect(next.turnNumber, state.turnNumber);
    });

    test('friendly stacking can be disabled while other moves remain legal', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [1, 0, -1, -1]),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(friendlyStackingEnabled: false),
      );
      final moves = engine.legalMoves(engine.roll(state, 1));
      expect(moves.any((move) => move.tokenIndex == 1), isFalse);
      expect(moves.any((move) => move.tokenIndex == 0), isTrue);
    });

    test('non-exact finish clamps an overshoot to the finish cell', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [56, 57, 57, 57]),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(exactFinishRequired: false),
      );
      final won = engine.move(engine.roll(state, 6), 0);
      expect(won.isFinished, isTrue);
      expect(won.players[0].tokens, everyElement(57));
    });


    test('rejects invalid dice, a second roll with pending dice, and an illegal pass', () {
      final initial = engine.newGame(playerCount: 2);
      expect(() => engine.roll(initial, 0), throwsArgumentError);
      expect(() => engine.roll(initial, 7), throwsArgumentError);
      final pending = engine.roll(initial, 6);
      expect(() => engine.roll(pending, 1), throwsStateError);
      expect(() => engine.passTurn(pending), throwsStateError);
    });

    test('configured entry faces can capture an exposed token on entry', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red),
          ManchPlayerState(colour: ManchColour.green, tokens: [39, -1, -1, -1]),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(entryFaces: {1, 6}, safeTrackIndices: {}),
      );
      final rolled = engine.roll(state, 1);
      final entry = engine.legalMoves(rolled).firstWhere((move) => move.tokenIndex == 0);
      expect(entry.isEntry, isTrue);
      expect(entry.isCapture, isTrue);
      final next = engine.move(rolled, entry.tokenIndex);
      expect(next.players[0].tokens[0], 0);
      expect(next.players[1].tokens[0], -1);
      expect(next.activePlayerIndex, 1,
          reason: 'Capture does not grant an extra roll in the base profile.');
    });

    test('all four globally configured safe cells protect single tokens', () {
      for (final safeCell in const [0, 13, 26, 39]) {
        final source = (safeCell + 51) % 52;
        final enemyProgress = (safeCell - 13 + 52) % 52;
        final state = ManchGameState(
          players: [
            ManchPlayerState(colour: ManchColour.red, tokens: [source, -1, -1, -1]),
            ManchPlayerState(colour: ManchColour.green, tokens: [enemyProgress, -1, -1, -1]),
          ],
          activePlayerIndex: 0,
          profile: const ManchRuleProfile(),
        );
        final rolled = engine.roll(state, 1);
        expect(engine.legalMoves(rolled).single.isCapture, isFalse,
            reason: 'Global safe cell $safeCell must not capture.');
        final next = engine.move(rolled, 0);
        expect(next.players[1].tokens[0], enemyProgress);
      }
    });

    test('finish bonus is controlled independently from the six bonus', () {
      final players = [
        ManchPlayerState(colour: ManchColour.red, tokens: [56, 56, 57, 57]),
        ManchPlayerState(colour: ManchColour.green),
      ];
      final bonus = ManchGameState(
        players: players,
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(extraRollOnFinish: true),
      );
      final bonusResult = engine.move(engine.roll(bonus, 1), 0);
      expect(bonusResult.players[0].tokens[0], 57);
      expect(bonusResult.activePlayerIndex, 0);

      final noBonus = ManchGameState(
        players: players,
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(extraRollOnFinish: false),
      );
      final normalResult = engine.move(engine.roll(noBonus, 1), 0);
      expect(normalResult.activePlayerIndex, 1);
    });

    test('a finished game rejects all subsequent turn actions', () {
      final almostWon = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red, tokens: [56, 57, 57, 57]),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
      );
      final won = engine.move(engine.roll(almostWon, 1), 0);
      expect(won.isFinished, isTrue);
      expect(() => engine.roll(won, 6), throwsStateError);
      expect(() => engine.passTurn(won), throwsStateError);
    });

    test('caps consecutive sixes at the configured maximum without a penalty', () {
      final state = ManchGameState(
        players: [
          ManchPlayerState(colour: ManchColour.red),
          ManchPlayerState(colour: ManchColour.green),
        ],
        activePlayerIndex: 0,
        profile: const ManchRuleProfile(),
        consecutiveSixes: 3,
      );
      final rolled = engine.roll(state, 6);
      expect(rolled.consecutiveSixes, 3);
      expect(rolled.activePlayerIndex, 0);
      expect(rolled.pendingDice, 6);
    });

    test('preserves legacy six counters and rejects a finished state with pending dice', () {
      final base = engine.newGame(playerCount: 2);
      final legacy = base.copyWith(consecutiveSixes: 4);
      expect(legacy.consecutiveSixes, 4);
      expect(engine.roll(legacy, 6).consecutiveSixes, 3);
      expect(
        () => base.copyWith(
          winnerIndex: 0,
          pendingDice: 6,
          consecutiveSixes: 1,
        ),
        throwsArgumentError,
      );
    });
  });
}
