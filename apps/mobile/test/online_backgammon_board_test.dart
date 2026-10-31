import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/online_match_screen.dart';
import 'package:royal_club/royal_backgammon_board.dart';

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

  test('checker stacks stay on the outer side of each player, never the center band', () {
    const size = Size(900, 600);
    final middleTop = 600 * .455;
    final middleBottom = 600 * .545;
    for (var point = 0; point < 24; point++) {
      for (var stackIndex = 0; stackIndex < 6; stackIndex++) {
        final center = RoyalBackgammonBoard.checkerCenterForPoint(
          point: point,
          stackIndex: stackIndex,
          checkerCount: 15,
          boardSize: size,
        );
        if (point < 12) {
          expect(center.dy, lessThan(middleTop), reason: 'Top point $point must remain on the top player side.');
        } else {
          expect(center.dy, greaterThan(middleBottom), reason: 'Bottom point $point must remain on the bottom player side.');
        }
      }
    }
  });

  test('first checker is anchored near its own outer edge', () {
    const size = Size(900, 600);
    for (var point = 0; point < 12; point++) {
      final center = RoyalBackgammonBoard.checkerCenterForPoint(
        point: point, stackIndex: 0, checkerCount: 5, boardSize: size);
      expect(center.dy, lessThan(100), reason: 'Top checkers must anchor at the top player edge.');
    }
    for (var point = 12; point < 24; point++) {
      final center = RoyalBackgammonBoard.checkerCenterForPoint(
        point: point, stackIndex: 0, checkerCount: 5, boardSize: size);
      expect(center.dy, greaterThan(500), reason: 'Bottom checkers must anchor at the bottom player edge.');
    }
  });

  test('six visible checkers fill the point inward without crossing its tip', () {
    const size = Size(900, 600);
    final topFirst = RoyalBackgammonBoard.checkerCenterForPoint(
      point: 0, stackIndex: 0, checkerCount: 15, boardSize: size);
    final topLast = RoyalBackgammonBoard.checkerCenterForPoint(
      point: 0, stackIndex: 5, checkerCount: 15, boardSize: size);
    final bottomFirst = RoyalBackgammonBoard.checkerCenterForPoint(
      point: 12, stackIndex: 0, checkerCount: 15, boardSize: size);
    final bottomLast = RoyalBackgammonBoard.checkerCenterForPoint(
      point: 12, stackIndex: 5, checkerCount: 15, boardSize: size);

    const rowHeight = (600 - 44) / 2;
    const pointTip = rowHeight * .56;
    const bottomTip = rowHeight + 44 + rowHeight - pointTip;
    expect(topLast.dy - topFirst.dy, greaterThan(60));
    expect(topLast.dy, lessThan(pointTip));
    expect(bottomFirst.dy - bottomLast.dy, greaterThan(60));
    expect(bottomLast.dy, greaterThan(bottomTip));
  });

  test('visible checkers in one point never overlap at phone and tablet sizes', () {
    const boardSizes = <Size>[
      Size(360, 500),
      Size(640, 480),
      Size(900, 600),
      Size(1200, 700),
    ];
    for (final size in boardSizes) {
      for (var point = 0; point < 24; point++) {
        for (var count = 2; count <= 15; count++) {
          final visible = count < 6 ? count : 6;
          final radius = RoyalBackgammonBoard.checkerRadiusForPoint(
            point: point,
            checkerCount: count,
            boardSize: size,
          );
          final centers = List<Offset>.generate(
            visible,
            (index) => RoyalBackgammonBoard.checkerCenterForPoint(
              point: point,
              stackIndex: index,
              checkerCount: count,
              boardSize: size,
            ),
          );
          for (var index = 1; index < centers.length; index++) {
            expect(
              (centers[index] - centers[index - 1]).distance,
              greaterThan(2 * radius + 0.5),
              reason: 'Point $point, count $count, size $size: '
                  'checker discs must not overlap.',
            );
          }
        }
      }
    }
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

  testWidgets('online board shows the active-player turn clock and central roll control',
      (tester) async {
    var rolled = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: OnlineBackgammonBoard(
              points: List<num>.filled(24, 0),
              timerText: '17s',
              timerWhite: false,
              rollLabel: 'Roll',
              onRoll: () => rolled = true,
              onPointTap: (_) {},
            ),
          ),
        ),
      ),
    ));

    expect(find.text('17s'), findsOneWidget);
    expect(find.text('Roll'), findsOneWidget);
    await tester.tap(find.text('Roll'));
    await tester.pump();
    expect(rolled, isTrue);
    expect(tester.takeException(), isNull);
  });

}
