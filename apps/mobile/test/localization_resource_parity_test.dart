import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Persian and English ARB resources have identical message keys', () {
    final fa = jsonDecode(File('lib/l10n/app_fa.arb').readAsStringSync())
        as Map<String, dynamic>;
    final en = jsonDecode(File('lib/l10n/app_en.arb').readAsStringSync())
        as Map<String, dynamic>;

    expect(fa['@@locale'], 'fa');
    expect(en['@@locale'], 'en');

    final faKeys = fa.keys.where((key) => !key.startsWith('@')).toSet();
    final enKeys = en.keys.where((key) => !key.startsWith('@')).toSet();

    expect(faKeys.difference(enKeys), isEmpty,
        reason: 'Persian-only message keys must be translated into English.');
    expect(enKeys.difference(faKeys), isEmpty,
        reason: 'English-only message keys must be translated into Persian.');
    expect(faKeys, containsAll([
      'appTitle',
      'comingSoon',
      'strategyTagline',
      'playWithHonour',
    ]));
  });
}
