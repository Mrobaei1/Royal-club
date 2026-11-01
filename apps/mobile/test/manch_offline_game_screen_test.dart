import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_offline_game_screen.dart';

void main() {
  testWidgets('offline game enters a token on six and grants the extra roll',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ManchOfflineGameScreen(diceRoller: _six),
      ),
    );

    expect(find.text('منچ ایرانی — بازی آفلاین'), findsOneWidget);
    expect(find.text('نوبت بازیکن قرمز'), findsOneWidget);

    await tester.tap(find.text('انداختن تاس'));
    await tester.pumpAndSettle();

    expect(find.text('حرکت‌های مجاز'), findsOneWidget);
    expect(find.textContaining('مهره 1:'), findsOneWidget);

    await tester.tap(find.textContaining('مهره 1:'));
    await tester.pumpAndSettle();

    expect(find.text('مسیر 1 از 52'), findsWidgets);
    expect(find.text('حرکت انجام شد؛ نوبت اضافه داری.'), findsOneWidget);
    expect(find.text('انداختن تاس'), findsOneWidget);
  });

  testWidgets('offline game automatically advances when no legal move exists',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: ManchOfflineGameScreen(diceRoller: _one),
      ),
    );

    await tester.tap(find.text('انداختن تاس'));
    await tester.pumpAndSettle();

    expect(find.text('نوبت بازیکن زرد'), findsOneWidget);
    expect(find.text('حرکت قانونی نداشتی؛ نوبت بازیکن بعدی است.'),
        findsOneWidget);
    expect(find.text('انداختن تاس'), findsOneWidget);
  });
}

int _six() => 6;
int _one() => 1;
