import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/online_match_screen.dart';

void main() {
  testWidgets('online board renders a real point board and maps taps to points',
      (tester) async {
    final tapped = <int>[];
    final points = List<num>.filled(24, 0)..[11] = 2..[0] = -3;

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: OnlineBackgammonBoard(
              points: points,
              onPointTap: tapped.add,
            ),
          ),
        ),
      ),
    ));

    expect(
      find.descendant(
        of: find.byType(OnlineBackgammonBoard),
        matching: find.byType(CustomPaint),
      ),
      findsWidgets,
    );
    expect(find.byType(GridView), findsNothing);
    final boardFinder = find.byType(OnlineBackgammonBoard);
    final boardTopLeft = tester.getTopLeft(boardFinder);
    await tester.tapAt(boardTopLeft + const Offset(42, 35));
    await tester.pump();
    expect(tapped, [11]);
  });

  testWidgets('standard opening position renders all 24 unique point hit targets',
      (tester) async {
    const opening = <num>[
      -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5,
      5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2,
    ];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: OnlineBackgammonBoard(
              points: opening,
              onPointTap: (_) {},
            ),
          ),
        ),
      ),
    ));

    for (var point = 0; point < 24; point++) {
      expect(find.byKey(ValueKey('backgammon-point-$point')), findsOneWidget,
          reason: 'Opening position point $point must have exactly one hit target.');
    }
    expect(
      find.descendant(
        of: find.byType(OnlineBackgammonBoard),
        matching: find.byType(CustomPaint),
      ),
      findsWidgets,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('selected point is repainted without losing the board',
      (tester) async {
    final points = List<num>.filled(24, 0)..[23] = -2;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: OnlineBackgammonBoard(
              points: points,
              selectedPoint: 23,
              onPointTap: (_) {},
            ),
          ),
        ),
      ),
    ));
    expect(find.byType(OnlineBackgammonBoard), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('bottom-row points 18 through 23 have unique hit targets',
      (tester) async {
    final tapped = <int>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: OnlineBackgammonBoard(
              points: List<num>.filled(24, 0),
              onPointTap: tapped.add,
            ),
          ),
        ),
      ),
    ));

    for (final point in [18, 23]) {
      final finder = find.byKey(ValueKey('backgammon-point-$point'));
      expect(finder, findsOneWidget);
      await tester.tapAt(tester.getCenter(finder));
      await tester.pump();
    }
    expect(tapped, [18, 23]);
    expect(tester.takeException(), isNull);
  });

}
