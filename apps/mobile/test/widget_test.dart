import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/l10n/app_localizations.dart';
import 'package:royal_club/account_screen.dart';
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
    expect(find.byType(Divider), findsWidgets);

    await tester.tap(find.byTooltip('تنظیمات'));
    await tester.pumpAndSettle();

    for (final label in [
      'دوستان',
      'اعلان‌ها',
      'حساب کاربری',
      'گفت‌وگوهای خصوصی',
      'کیف پول',
    ]) {
      expect(find.text(label), findsOneWidget);
    }
  });

  testWidgets('non-owner home menu hides owner-only admin navigation', (tester) async {
    await tester.pumpWidget(_testApp(const HomeScreen()));
    await tester.tap(find.byTooltip('تنظیمات'));
    await tester.pumpAndSettle();

    expect(find.text('پنل مدیریت'), findsNothing);
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

  testWidgets('account screen exposes profile photo selection', (tester) async {
    const secureStorage = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorage, (call) async => null);
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(secureStorage, null);
    });

    await tester.pumpWidget(_testApp(AccountScreen(onLogout: () {})));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('انتخاب عکس پروفایل'), findsOneWidget);
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
