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
      findsOneWidget,
    );
    expect(find.byType(GridView), findsNothing);
    await tester.tapAt(const Offset(10, 35));
    await tester.pump();
    expect(tapped, [11]);
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
}
