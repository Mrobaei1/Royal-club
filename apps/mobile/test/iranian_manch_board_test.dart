import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/iranian_manch_board.dart';
import 'package:royal_club/games/manch/manch_board_geometry.dart';
import 'package:royal_club/games/manch/manch_engine.dart';
import 'package:royal_club/games/manch/manch_rule_profile.dart';

void main() {
  testWidgets('Iranian Manch board renders as a square custom-painted board',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(420, 800));
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 360,
              child: IranianManchBoard(),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(IranianManchBoard), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(IranianManchBoard),
        matching: find.byType(CustomPaint),
      ),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('Iranian four-colour Manch board'),
        findsOneWidget);

    final size = tester.getSize(find.byType(IranianManchBoard));
    expect(size.width, closeTo(size.height, .01));
    await tester.binding.setSurfaceSize(null);
    semantics.dispose();
  });

  testWidgets('board semantics describe turn and token distribution', (tester) async {
    final semantics = tester.ensureSemantics();
    const engine = ManchEngine();
    final state = engine.newGame(playerCount: 2, profile: const ManchRuleProfile());
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              child: IranianManchBoard(gameState: state, showSampleTokens: false),
            ),
          ),
        ),
      ),
    );
    expect(
      find.bySemanticsLabel(
        'Iranian four-colour Manch board. Red to move. Red: 4 in yard, 0 on track, 0 in home, 0 finished; Yellow: 4 in yard, 0 on track, 0 in home, 0 finished. Dice: not rolled.',
      ),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('board home tap reports the fixed red seat in upper-left',
      (tester) async {
    ManchSeat? tapped;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 300,
              child: IranianManchBoard(onHomeTap: (seat) => tapped = seat),
            ),
          ),
        ),
      ),
    );

    final boardTopLeft = tester.getTopLeft(find.byType(IranianManchBoard));
    await tester.tapAt(boardTopLeft + const Offset(35, 35));
    expect(tapped, ManchSeat.red);
  });
  testWidgets('board renders token positions from a live game state',
      (tester) async {
    const engine = ManchEngine();
    final state = engine.newGame(
      playerCount: 2,
      profile: const ManchRuleProfile(),
    );
    final afterRoll = engine.roll(state, 6);
    final afterEntry = engine.move(afterRoll, 0);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              child: IranianManchBoard(
                gameState: afterEntry,
                showSampleTokens: false,
              ),
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.byType(IranianManchBoard), findsOneWidget);
  });

  test('the shared route contains 52 unique cells and fixed colour entries', () {
    expect(ManchBoardGeometry.trackCells, hasLength(52));
    expect(ManchBoardGeometry.trackCells.toSet(), hasLength(52));
    expect(ManchBoardGeometry.trackCells[0], (6, 0));
    expect(ManchBoardGeometry.trackCells[13], (0, 8));
    expect(ManchBoardGeometry.trackCells[26], (8, 14));
    expect(ManchBoardGeometry.trackCells[39], (14, 6));
  });

  for (final direction in TextDirection.values) {
    testWidgets('fixed board seat geometry is unchanged in $direction',
        (tester) async {
      final tapped = <ManchSeat>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: direction,
            child: Scaffold(
              body: Center(
                child: SizedBox(
                  width: 300,
                  child: IranianManchBoard(
                    onHomeTap: tapped.add,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      final origin = tester.getTopLeft(find.byType(IranianManchBoard));
      await tester.tapAt(origin + const Offset(35, 35));
      await tester.tapAt(origin + const Offset(265, 35));
      await tester.tapAt(origin + const Offset(265, 265));
      await tester.tapAt(origin + const Offset(35, 265));
      expect(tapped, [
        ManchSeat.red,
        ManchSeat.green,
        ManchSeat.yellow,
        ManchSeat.blue,
      ]);
    });
  }

}
