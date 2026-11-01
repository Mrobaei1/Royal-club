import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_game_state.dart';
import 'package:royal_club/games/manch/manch_offline_game_screen.dart';
import 'package:royal_club/games/manch/manch_save_store.dart';

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

    await tester.ensureVisible(find.text('انداختن تاس'));
    await tester.ensureVisible(find.text('انداختن تاس'));
    await tester.tap(find.text('انداختن تاس'));
    await tester.pumpAndSettle();

    expect(find.text('حرکت‌های مجاز'), findsOneWidget);
    expect(find.textContaining('مهره 1:'), findsOneWidget);

    await tester.ensureVisible(find.textContaining('مهره 1:'));
    await tester.tap(find.textContaining('مهره 1:'));
    await tester.pumpAndSettle();

    expect(find.textContaining('مسیر 1 از 52'), findsWidgets);
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

    await tester.ensureVisible(find.text('انداختن تاس'));
    await tester.tap(find.text('انداختن تاس'));
    await tester.pumpAndSettle();

    expect(find.text('نوبت بازیکن زرد'), findsOneWidget);
    expect(find.text('حرکت قانونی نداشتی؛ نوبت بازیکن بعدی است.'),
        findsOneWidget);
    expect(find.text('انداختن تاس'), findsOneWidget);
  });

  testWidgets('offline game saves and restores its complete state',
      (tester) async {
    final store = _MemoryManchSaveStore();
    await tester.pumpWidget(
      MaterialApp(
        home: ManchOfflineGameScreen(
          diceRoller: _six,
          saveStore: store,
        ),
      ),
    );

    await tester.ensureVisible(find.text('انداختن تاس'));
    await tester.tap(find.text('انداختن تاس'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.textContaining('مهره 1:'));
    await tester.tap(find.textContaining('مهره 1:'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('ذخیره'));
    await tester.tap(find.text('ذخیره'));
    await tester.pumpAndSettle();
    expect(store.saved, isNotNull);

    await tester.tap(find.byTooltip('شروع دوباره'));
    await tester.pumpAndSettle();
    expect(find.textContaining('حیاط'), findsWidgets);

    await tester.ensureVisible(find.text('بازیابی'));
    await tester.tap(find.text('بازیابی'));
    await tester.pumpAndSettle();
    expect(find.textContaining('مسیر 1 از 52'), findsWidgets);
    expect(find.text('بازی ذخیره‌شده بازیابی شد.'), findsOneWidget);
  });

  testWidgets('configured bot plays its turn and returns control to human',
      (tester) async {
    var rollCount = 0;
    int diceRoller() => rollCount++ == 0 ? 6 : 1;
    final store = _MemoryManchSaveStore();

    await tester.pumpWidget(
      MaterialApp(
        home: ManchOfflineGameScreen(
          botPlayers: const {ManchColour.red},
          diceRoller: diceRoller,
          saveStore: store,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('نوبت بازیکن زرد'), findsOneWidget);
    await tester.ensureVisible(find.text('ذخیره'));
    await tester.tap(find.text('ذخیره'));
    await tester.pumpAndSettle();
    expect(store.saved, isNotNull);
    expect(store.saved!.players[0].tokens[0], 0);
    expect(store.saved!.activePlayerIndex, 1);
    expect(find.text('انداختن تاس'), findsOneWidget);
  });
}

int _six() => 6;
int _one() => 1;

class _MemoryManchSaveStore implements ManchSaveStore {
  ManchGameState? saved;

  @override
  Future<void> save(ManchGameState state) async {
    saved = ManchGameState.fromJson(state.toJson());
  }

  @override
  Future<ManchGameState?> load() async => saved;
}
