import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:royal_club_chess/chess_board.dart';

void main() {
  testWidgets('renders white at bottom and emits only server-approved UCI moves', (tester) async {
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
    expect(find.bySemanticsLabel('e1 ♔'), findsOneWidget);
    expect(find.bySemanticsLabel('e8 ♚'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('e2 ♙'));
    await tester.pump();
    await tester.tap(find.bySemanticsLabel('e4 empty'));
    await tester.pump();
    expect(submitted, 'e2e4');
  });

  testWidgets('non-interactive board ignores taps', (tester) async {
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
    await tester.tap(find.bySemanticsLabel('e2 ♙'));
    await tester.pump();
    await tester.tap(find.bySemanticsLabel('e4 empty'));
    await tester.pump();
    expect(submitted, isNull);
  });
}
