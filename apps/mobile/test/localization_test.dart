import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/l10n/app_text.dart';

Widget _localizedApp(Locale locale, String Function(BuildContext) text) {
  return MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('fa'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: Builder(builder: (context) => Text(text(context))),
  );
}

void main() {
  test('Persian and English ARB resources have matching translation keys', () {
    final english = jsonDecode(File('lib/l10n/app_en.arb').readAsStringSync())
        as Map<String, dynamic>;
    final persian = jsonDecode(File('lib/l10n/app_fa.arb').readAsStringSync())
        as Map<String, dynamic>;

    expect(english['@@locale'], 'en');
    expect(persian['@@locale'], 'fa');
    final englishKeys = english.keys.where((key) => !key.startsWith('@')).toSet();
    final persianKeys = persian.keys.where((key) => !key.startsWith('@')).toSet();
    expect(persianKeys, equals(englishKeys));
    expect(englishKeys, containsAll(['appTitle', 'login', 'register', 'save']));
  });

  testWidgets('shared UI text follows English app locale', (tester) async {
    await tester.pumpWidget(
      _localizedApp(const Locale('en'), (context) {
        return appText(context, 'ذخیره', 'Save');
      }),
    );

    expect(find.text('Save'), findsOneWidget);
    expect(find.text('ذخیره'), findsNothing);
  });

  testWidgets('shared UI text follows Persian app locale', (tester) async {
    await tester.pumpWidget(
      _localizedApp(const Locale('fa'), (context) {
        return appText(context, 'ذخیره', 'Save');
      }),
    );

    expect(find.text('ذخیره'), findsOneWidget);
    expect(find.text('Save'), findsNothing);
  });

  testWidgets('Persian locale uses RTL direction and English uses LTR', (tester) async {
    await tester.pumpWidget(
      _localizedApp(const Locale('fa'), (context) => appText(context, 'تخته‌نرد', 'Backgammon')),
    );
    expect(
      Directionality.of(tester.element(find.text('تخته‌نرد'))),
      TextDirection.rtl,
    );

    await tester.pumpWidget(
      _localizedApp(const Locale('en'), (context) => appText(context, 'تخته‌نرد', 'Backgammon')),
    );
    expect(
      Directionality.of(tester.element(find.text('Backgammon'))),
      TextDirection.ltr,
    );
  });

  test('match and UNO setup errors are translated into English', () {
    final errors = <String, String>{
      'شناسه اتاق بازی معتبر نیست. از فهرست بازی‌های آنلاین دوباره وارد شوید.':
          'Invalid match ID. Reopen the room from the online lobby.',
      'ابتدا وارد حساب Royal Club شوید.':
          'Please sign in to Royal Club first.',
      'شناسه کاربر از سرور Royal Club دریافت نشد.':
          'Could not obtain the user ID from the Royal Club server.',
      'تنظیمات سرویس بازی از سرور دریافت نشد.':
          'Could not load game-service configuration from the server.',
      'امضای تنظیمات مرکزی سرویس بازی معتبر نیست.':
          'The central game-service configuration signature is invalid.',
      'امضای تنظیمات مرکزی سرویس بازی تأیید نشد.':
          'The central game-service configuration signature could not be verified.',
      'سرویس آنلاین اونو هنوز در پنل زیرساخت تنظیم نشده است.':
          'The online UNO service is not configured in the infrastructure panel yet.',
      'آدرس سرویس اونو معتبر نیست.':
          'The UNO service address is invalid.',
    };
    for (final entry in errors.entries) {
      expect(appErrorForLanguage('en', Exception(entry.key)), entry.value);
      expect(appErrorForLanguage('fa', Exception(entry.key)), entry.key);
    }
  });

  testWidgets('common Persian service errors are translated in English', (tester) async {
    await tester.pumpWidget(
      _localizedApp(const Locale('en'), (context) {
        return appError(context, Exception('اتصال به سرور برقرار نشد. ممکن است سرویس API خاموش باشد یا آدرس آن تغییر کرده باشد.'));
      }),
    );

    expect(
      find.text('Could not connect to the server. The API may be offline or its address may have changed.'),
      findsOneWidget,
    );
  });
}
