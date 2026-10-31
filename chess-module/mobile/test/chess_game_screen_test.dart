import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_game_screen.dart';

const _fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

Widget _screen({
  VoidCallback? onOfferDraw,
  VoidCallback? onResign,
  String? pendingDrawOfferId,
  bool drawOfferedByOpponent = false,
  ValueChanged<bool>? onRespondToDraw,
  String? activeSide,
}) => MaterialApp(
  home: Scaffold(
    body: ChessGameScreen(
      fen: _fen,
      legalMoves: const [],
      whiteUsername: 'white_player',
      blackUsername: 'black_player',
      whiteClock: const Duration(minutes: 5),
      blackClock: const Duration(minutes: 5),
      onMove: (_) {},
      messages: const [],
      onSendMessage: (_) {},
      onVoicePressed: () {},
      onVoiceReleased: () {},
      voiceEnabled: false,
      speakingUsername: null,
      onOfferDraw: onOfferDraw,
      onResign: onResign,
      pendingDrawOfferId: pendingDrawOfferId,
      drawOfferedByOpponent: drawOfferedByOpponent,
      onRespondToDraw: onRespondToDraw,
      activeSide: activeSide,
    ),
  ),
);

void main() {
  testWidgets('draw offer button calls its action', (tester) async {
    var offered = false;
    await tester.pumpWidget(_screen(onOfferDraw: () => offered = true));
    await tester.tap(find.text('Offer draw'));
    expect(offered, isTrue);
  });

  testWidgets('resignation requires confirmation', (tester) async {
    var resigned = false;
    await tester.pumpWidget(_screen(onResign: () => resigned = true));
    await tester.tap(find.text('Resign'));
    await tester.pumpAndSettle();
    expect(resigned, isFalse);
    await tester.tap(find.text('Resign').last);
    await tester.pumpAndSettle();
    expect(resigned, isTrue);
  });

  testWidgets('opponent draw offer exposes accept and decline actions', (tester) async {
    bool? response;
    await tester.pumpWidget(_screen(
      pendingDrawOfferId: '44',
      drawOfferedByOpponent: true,
      onRespondToDraw: (accept) => response = accept,
    ));
    await tester.tap(find.text('Accept'));
    expect(response, isTrue);
  });
  testWidgets('active server clock interpolates between authoritative updates', (tester) async {
    await tester.pumpWidget(_screen(activeSide: 'white'));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('04:59'), findsOneWidget);
  });

}
