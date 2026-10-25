import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/services/auth_service.dart';

void main() {
  test('missing API URL produces an actionable setup message', () {
    expect(
      () => AuthService.ensureConfigured(configuredBaseUrl: ''),
      throwsA(
        isA<Exception>().having(
          (error) => error.toString(),
          'message',
          contains('سرور Royal Club هنوز تنظیم نشده است'),
        ),
      ),
    );
  });

  test('rejects an API URL with an unsupported scheme', () {
    expect(
      () => AuthService.ensureConfigured(
        configuredBaseUrl: 'ftp://api.example.com',
      ),
      throwsA(isA<Exception>()),
    );
  });

  test('accepts a valid HTTPS API URL', () {
    expect(
      () => AuthService.ensureConfigured(
        configuredBaseUrl: 'https://api.example.com',
      ),
      returnsNormally,
    );
  });
}
