import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/l10n/app_localizations.dart';
import 'package:royal_club/main.dart';

Widget _testApp(Widget home, {Locale locale = const Locale('fa')}) => MaterialApp(
      locale: locale,
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: home,
    );

void main() {
  testWidgets('app starts through the authentication gate', (tester) async {
    await tester.pumpWidget(const RoyalClubApp());

    expect(find.byType(AuthGate), findsOneWidget);
    expect(find.text('ROYAL CLUB'), findsWidgets);
  });

  testWidgets('home menu exposes account, friends, and notifications', (tester) async {
    await tester.pumpWidget(_testApp(const HomeScreen()));

    await tester.tap(find.byTooltip('تنظیمات'));
    await tester.pumpAndSettle();

    for (final label in [
      'دوستان',
      'اعلان‌ها',
      'حساب کاربری',
      'گفت‌وگوهای خصوصی',
      'پنل مدیریت',
      'کیف پول',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
  });

  testWidgets('English locale renders translated home game cards', (tester) async {
    await tester.pumpWidget(_testApp(const HomeScreen(), locale: const Locale('en')));

    expect(find.text('Backgammon'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Chess'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Chess'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Card games'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Card games'), findsOneWidget);
  });

  testWidgets('home screen keeps all game cards', (tester) async {
    await tester.pumpWidget(_testApp(const HomeScreen()));

    final context = tester.element(find.byType(HomeScreen));
    final l10n = AppLocalizations.of(context);

    expect(find.text(l10n.backgammon), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('شطرنج'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('شطرنج'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('بازی‌های کارتی'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('بازی‌های کارتی'), findsOneWidget);
  });
}
