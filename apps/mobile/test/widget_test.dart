import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/l10n/app_localizations.dart';
import 'package:royal_club/main.dart';

Widget _localizedHome() => MaterialApp(
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const HomeScreen(),
    );

void main() {
  testWidgets('app starts through the authentication gate', (tester) async {
    await tester.pumpWidget(const RoyalClubApp());

    expect(find.byType(AuthGate), findsOneWidget);
    expect(find.text('ROYAL CLUB'), findsWidgets);
  });

  testWidgets('home menu exposes account, friends, and notifications', (tester) async {
    await tester.pumpWidget(
      _localizedHome(),
    );

    await tester.tap(find.byTooltip('منو و تنظیمات'));
    await tester.pumpAndSettle();

    for (final label in [
      'دوستان',
      'اعلان‌ها',
      'حساب کاربری',
      'گفت‌وگوهای خصوصی',
      'پنل مدیریت',
      'کیف پول و اشتراک',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
  });

  testWidgets('home screen keeps all game cards', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HomeScreen()),
    );

    expect(find.text('تخته‌نرد'), findsOneWidget);
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
