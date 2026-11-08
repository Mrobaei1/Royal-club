import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_game_screen.dart';
import 'package:royal_club_chess/chess_board.dart';

const _fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
class _PersianMaterialLocalizationsDelegate extends LocalizationsDelegate<MaterialLocalizations> {
  const _PersianMaterialLocalizationsDelegate();
  @override bool isSupported(Locale locale) => locale.languageCode == 'fa';
  @override Future<MaterialLocalizations> load(Locale locale) => GlobalMaterialLocalizations.delegate.load(const Locale('en'));
  @override bool shouldReload(_PersianMaterialLocalizationsDelegate old) => false;
}
class _PersianCupertinoLocalizationsDelegate extends LocalizationsDelegate<CupertinoLocalizations> {
  const _PersianCupertinoLocalizationsDelegate();
  @override bool isSupported(Locale locale) => locale.languageCode == 'fa';
  @override Future<CupertinoLocalizations> load(Locale locale) => GlobalCupertinoLocalizations.delegate.load(const Locale('en'));
  @override bool shouldReload(_PersianCupertinoLocalizationsDelegate old) => false;
}

Widget _screen({
  VoidCallback? onOfferDraw,
  VoidCallback? onResign,
  VoidCallback? onClaimDraw,
  bool drawClaimable = false,
  String? pendingDrawOfferId,
  bool drawOfferedByOpponent = false,
  ValueChanged<bool>? onRespondToDraw,
  String? activeSide,
  bool isHost = false,
  String gameStatus = 'active',
  Locale? locale,
  ValueChanged<String>? onSendMessage,
}) => MaterialApp(
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('fa')],
  localizationsDelegates: [...GlobalMaterialLocalizations.delegates, const _PersianMaterialLocalizationsDelegate(), const _PersianCupertinoLocalizationsDelegate()],
  home: Directionality(
    textDirection: locale?.languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
    child: Scaffold(
    body: ChessGameScreen(
      fen: _fen,
      legalMoves: const [],
      whiteUsername: 'white_player',
      blackUsername: 'black_player',
      whiteClock: const Duration(minutes: 5),
      blackClock: const Duration(minutes: 5),
      onMove: (_) {},
      messages: const [],
      onSendMessage: onSendMessage ?? (_) {},
      onOfferDraw: onOfferDraw,
      onResign: onResign,
      onClaimDraw: onClaimDraw,
      drawClaimable: drawClaimable,
      pendingDrawOfferId: pendingDrawOfferId,
      drawOfferedByOpponent: drawOfferedByOpponent,
      onRespondToDraw: onRespondToDraw,
      activeSide: activeSide,
      isHost: isHost,
      gameStatus: gameStatus,
    ),
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

  testWidgets('claim draw action appears only when server marks the position claimable', (tester) async {
    var claimed = false;
    await tester.pumpWidget(_screen(
      drawClaimable: true,
      onClaimDraw: () => claimed = true,
    ));
    expect(find.text('Claim draw'), findsOneWidget);
    await tester.tap(find.text('Claim draw'));
    expect(claimed, isTrue);
    await tester.pumpWidget(_screen(onClaimDraw: () => claimed = true));
    expect(find.text('Claim draw'), findsNothing);
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

  testWidgets('clock stops interpolating when the game becomes terminal', (tester) async {
    await tester.pumpWidget(_screen(activeSide: 'white'));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('04:59'), findsOneWidget);
    await tester.pumpWidget(_screen(activeSide: 'white', gameStatus: 'black_win'));
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('04:59'), findsOneWidget);
  });

  testWidgets('finished game displays result and hides active-game actions', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ChessGameScreen(
          fen: _fen,
          legalMoves: const ['e2e4'],
          whiteUsername: 'white_player',
          blackUsername: 'black_player',
          whiteClock: const Duration(minutes: 4),
          blackClock: const Duration(minutes: 5),
          onMove: (_) {},
          messages: const [],
          onSendMessage: (_) {},
          onOfferDraw: () {},
          onResign: () {},
          gameStatus: 'white_win',
        ),
      ),
    ));
    expect(find.text('White won'), findsOneWidget);
    expect(find.text('Offer draw'), findsNothing);
    expect(find.text('Resign'), findsNothing);
    expect(tester.widget<ChessBoard>(find.byType(ChessBoard)).interactive, isFalse);
  });

  testWidgets('finished game disables chat composer and rejects submitted text', (tester) async {
    final sent = <String>[];
    await tester.pumpWidget(_screen(gameStatus: 'white_win', onSendMessage: sent.add));
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.enabled, isFalse);
    expect(field.decoration?.hintText, 'Chat is closed after the game ends');
    final sendButtonFinder = find.byWidgetPredicate((widget) => widget is IconButton && widget.tooltip == 'Send message');
    final sendButton = tester.widget<IconButton>(sendButtonFinder);
    expect(sendButton.onPressed, isNull);
    field.onSubmitted?.call('late message');
    expect(sent, isEmpty);
  });

  testWidgets('chat sends trimmed non-empty text and ignores whitespace', (tester) async {
    final sent = <String>[];
    await tester.pumpWidget(_screen(onSendMessage: sent.add));
    await tester.enterText(find.byType(TextField), '   hello chess   ');
    await tester.tap(find.byTooltip('Send message'));
    expect(sent, ['hello chess']);
    await tester.enterText(find.byType(TextField), '   ');
    await tester.tap(find.byTooltip('Send message'));
    expect(sent, ['hello chess']);
  });

  testWidgets('English game screen fits a phone viewport in LTR and landscape', (tester) async {
    tester.view.physicalSize = const Size(2400, 1080);
    tester.view.devicePixelRatio = 3;
    await tester.pumpWidget(_screen(locale: const Locale('en'), activeSide: 'white'));
    expect(Directionality.of(tester.element(find.byType(ChessGameScreen))), TextDirection.ltr);
    expect(find.byType(ChessBoard), findsOneWidget);
    expect(tester.takeException(), isNull);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  testWidgets('Persian game screen uses RTL and renders Persian controls on a phone viewport', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    await tester.pumpWidget(_screen(
      locale: const Locale('fa'),
      activeSide: 'white',
      onOfferDraw: () {},
    ));
    expect(find.text('پیشنهاد مساوی'), findsOneWidget);
    expect(find.byTooltip('ارسال پیام'), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(ChessGameScreen))), TextDirection.rtl);
    expect(tester.takeException(), isNull);
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}
