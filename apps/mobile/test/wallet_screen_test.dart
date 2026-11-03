import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/wallet_screen.dart';

void main() {
  test('monthly premium subscription uses English copy in English locale', () {
    expect(
      localizedSubscriptionPlanName(
        languageCode: 'en',
        planCode: 'vip_monthly',
        fallbackName: 'اشتراک ویژه یک‌ماهه',
      ),
      'One-Month Premium Subscription',
    );
  });

  test('monthly premium subscription preserves Persian copy in Persian locale', () {
    expect(
      localizedSubscriptionPlanName(
        languageCode: 'fa',
        planCode: 'vip_monthly',
        fallbackName: 'اشتراک ویژه یک‌ماهه',
      ),
      'اشتراک ویژه یک‌ماهه',
    );
  });

  test('unknown subscription plans preserve their server-provided name', () {
    expect(
      localizedSubscriptionPlanName(
        languageCode: 'en',
        planCode: 'future_plan',
        fallbackName: 'Future plan',
      ),
      'Future plan',
    );
  });
}
