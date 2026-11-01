import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:royal_club_chess/chess_board.dart';

void main() {
  testWidgets('renders white at bottom and emits only server-approved UCI moves', (tester) async {
    final semantics = tester.ensureSemantics();
    String? submitted;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ChessBoard(
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          legalMoves: const ['e2e4'],
          onMove: (move) => submitted = move,
        ),
      ),
    ));
    expect(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e1 ')), findsOneWidget);
    expect(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e8 ')), findsOneWidget);
    await tester.tap(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e2 ')));
    await tester.pump();
    await tester.tap(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e4 ')));
    await tester.pump();
    expect(submitted, 'e2e4');
    semantics.dispose();
  });

  testWidgets('server position updates clear stale selected squares', (tester) async {
    final semantics = tester.ensureSemantics();
    Widget board(String fen, List<String> moves) => MaterialApp(
      home: Scaffold(body: ChessBoard(fen: fen, legalMoves: moves, onMove: (_) {})),
    );
    await tester.pumpWidget(board(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      const ['e2e4'],
    ));
    await tester.tap(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e2 ')));
    await tester.pump();
    Finder selectedSquares() => find.byWidgetPredicate((widget) =>
      widget is DecoratedBox && widget.decoration is BoxDecoration &&
      (widget.decoration as BoxDecoration).color == const Color(0xFFE8C547));
    expect(selectedSquares(), findsOneWidget);
    await tester.pumpWidget(board(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      const ['e7e5'],
    ));
    await tester.pump();
    expect(selectedSquares(), findsNothing);
    semantics.dispose();
  });

  testWidgets('non-interactive board ignores taps', (tester) async {
    final semantics = tester.ensureSemantics();
    String? submitted;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ChessBoard(
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          legalMoves: const ['e2e4'],
          onMove: (move) => submitted = move,
          interactive: false,
        ),
      ),
    ));
    await tester.tap(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e2 ')));
    await tester.pump();
    await tester.tap(find.byWidgetPredicate((widget) => widget is Semantics && (widget.properties.label ?? '').startsWith('e4 ')));
    await tester.pump();
    expect(submitted, isNull);
    semantics.dispose();
  });
}
