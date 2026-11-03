import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_online_version_guard.dart';

void main() {
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
