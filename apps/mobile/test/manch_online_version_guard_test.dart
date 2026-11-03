import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_online_version_guard.dart';

void main() {
  group('parseManchOnlineStateVersion', () {
    test('accepts a non-negative integer version', () {
      expect(parseManchOnlineStateVersion(0), 0);
      expect(parseManchOnlineStateVersion(7), 7);
    });

    test('accepts an exactly integral numeric JSON value', () {
      expect(parseManchOnlineStateVersion(7.0), 7);
    });

    test('rejects missing, string, negative, fractional and non-finite versions', () {
      expect(parseManchOnlineStateVersion(null), isNull);
      expect(parseManchOnlineStateVersion('7'), isNull);
      expect(parseManchOnlineStateVersion(-1), isNull);
      expect(parseManchOnlineStateVersion(7.5), isNull);
      expect(parseManchOnlineStateVersion(double.infinity), isNull);
      expect(parseManchOnlineStateVersion(double.nan), isNull);
    });
  });

  group('shouldAcceptManchOnlineVersion', () {
    test('accepts a newer response', () {
      expect(shouldAcceptManchOnlineVersion(incomingVersion: 8, currentVersion: 7), isTrue);
    });

    test('accepts an equal version response', () {
      expect(shouldAcceptManchOnlineVersion(incomingVersion: 7, currentVersion: 7), isTrue);
    });

    test('rejects a delayed response older than the current state', () {
      expect(shouldAcceptManchOnlineVersion(incomingVersion: 6, currentVersion: 7), isFalse);
    });
  });
}
