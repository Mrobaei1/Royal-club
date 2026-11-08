import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/public_identity.dart';

void main() {
  test('missing, blank and non-string legacy usernames use a neutral fallback', () {
    for (final value in <Object?>[null, '', '   ', 42]) {
      expect(normalizedPublicUsername(value), isNull);
      expect(publicUsernameLabel(value, fallback: 'Friend'), 'Friend');
    }
  });

  test('public labels use only the trimmed username and never require private fields', () {
    expect(normalizedPublicUsername('  royal_player  '), 'royal_player');
    expect(publicUsernameLabel('  royal_player  ', fallback: 'Friend'), '@royal_player');
    expect(publicUsernameLabel('  royal_player  ', fallback: 'Player', prefixAt: false), 'royal_player');
  });
}
