import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/l10n/app_text.dart';

void main() {
  test('common Persian API validation errors are translated for English users', () {
    expect(
      appErrorForLanguage('en', 'نام، شماره تلفن معتبر و کشور را وارد کنید.'),
      'Enter a name, valid phone number, and country.',
    );
    expect(
      appErrorForLanguage('en', 'تصویر باید JPG یا PNG یا WebP و کمتر از 650 کیلوبایت باشد.'),
      'The image must be JPG, PNG, or WebP and smaller than 650 KB.',
    );
    expect(
      appErrorForLanguage('en', 'نام کاربری باید ۳ تا ۲۴ حرف و فقط شامل حروف انگلیسی، عدد، نقطه یا زیرخط باشد.'),
      'Username must be 3–24 characters and contain only English letters, numbers, dots, or underscores.',
    );
    expect(
      appErrorForLanguage('en', 'این نام کاربری قبلاً انتخاب شده است.'),
      'This username is already taken.',
    );
  });

  test('already-English errors are preserved and Persian users see original Persian text', () {
    expect(appErrorForLanguage('en', 'Invalid email or password.'), 'Invalid email or password.');
    expect(appErrorForLanguage('fa', 'این نام کاربری قبلاً انتخاب شده است.'), 'این نام کاربری قبلاً انتخاب شده است.');
  });
  testWidgets('appText selects Persian and English from the active locale', (tester) async {
    Widget localized(String language) => MaterialApp(
      locale: Locale(language),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(
        builder: (context) => Text(appText(context, 'آزمایش', 'Test')),
      ),
    );

    await tester.pumpWidget(localized('fa'));
    expect(find.text('آزمایش'), findsOneWidget);
    expect(find.text('Test'), findsNothing);

    await tester.pumpWidget(localized('en'));
    expect(find.text('Test'), findsOneWidget);
    expect(find.text('آزمایش'), findsNothing);
  });

  test('unknown errors are preserved instead of being silently replaced', () {
    expect(
      appErrorForLanguage('en', Exception('Unmapped backend error')),
      'Unmapped backend error',
    );
    expect(
      appErrorForLanguage('fa', Exception('خطای اختصاصی آزمون')),
      'خطای اختصاصی آزمون',
    );
  });

}
