import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/services/wallet_service.dart';

String tokenFor(String accountId) {
  final payload = base64Url
      .encode(utf8.encode(jsonEncode({'sub': accountId})))
      .replaceAll('=', '');
  return 'header.$payload.signature';
}

void main() {
  test('pending purchase storage namespace is isolated per account and plan', () {
    final accountA = WalletService.pendingPurchaseStorageKey('101', 'vip_monthly');
    final accountB = WalletService.pendingPurchaseStorageKey('202', 'vip_monthly');
    final anotherPlan = WalletService.pendingPurchaseStorageKey('101', 'vip_weekly');

    expect(accountA, isNot(accountB));
    expect(accountA, isNot(anotherPlan));
    expect(accountA, '101:vip_monthly');
  });

  test('account identity is read from the stable JWT subject', () {
    expect(WalletService.accountIdFromAccessToken(tokenFor('101')), '101');
    expect(WalletService.accountIdFromAccessToken(tokenFor('202')), '202');
  });

  test('invalid access tokens fail closed for purchase key scoping', () {
    expect(
      () => WalletService.accountIdFromAccessToken('not-a-jwt'),
      throwsA(isA<FormatException>()),
    );
    expect(
      () => WalletService.accountIdFromAccessToken(tokenFor('')),
      throwsA(isA<FormatException>()),
    );
  });
}
