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

  test('concurrent activation requests for the same account and plan share one operation', () async {
    var operationCount = 0;
    final completer = Completer<Map<String, dynamic>>();
    final first = WalletService.coalescePurchaseRequest('101', 'vip_monthly', () {
      operationCount++;
      return completer.future;
    });
    final second = WalletService.coalescePurchaseRequest('101', 'vip_monthly', () {
      operationCount++;
      return Future.value({'unexpected': true});
    });

    expect(identical(first, second), isTrue);
    expect(operationCount, 1);
    completer.complete({'subscriptionId': 7});
    expect(await first, {'subscriptionId': 7});
    expect(await second, {'subscriptionId': 7});

    final retry = WalletService.coalescePurchaseRequest(
      '101', 'vip_monthly', () async {
        operationCount++;
        return {'subscriptionId': 8};
      },
    );
    expect(await retry, {'subscriptionId': 8});
    expect(operationCount, 2);
  });

  test('concurrent activation requests remain isolated by account and plan', () async {
    final a = Completer<Map<String, dynamic>>();
    final b = Completer<Map<String, dynamic>>();
    final accountA = WalletService.coalescePurchaseRequest('101', 'vip_monthly', () => a.future);
    final accountB = WalletService.coalescePurchaseRequest('202', 'vip_monthly', () => b.future);
    final anotherPlan = WalletService.coalescePurchaseRequest(
      '101', 'vip_weekly', () async => {'plan': 'weekly'},
    );

    expect(identical(accountA, accountB), isFalse);
    expect(identical(accountA, anotherPlan), isFalse);
    a.complete({'account': '101'});
    b.complete({'account': '202'});
    expect(await accountA, {'account': '101'});
    expect(await accountB, {'account': '202'});
    expect(await anotherPlan, {'plan': 'weekly'});
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
