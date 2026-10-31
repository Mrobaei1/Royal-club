import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/services/api_transport.dart';

void main() {
  tearDown(ApiTransport.resetForTesting);

  test('uses one normalized origin for every API path', () {
    ApiTransport.setVerifiedOrigin('https://api.royalclub.example/');

    expect(ApiTransport.baseUrl, 'https://api.royalclub.example');
    expect(
      ApiTransport.uri('/api/v1/me').toString(),
      'https://api.royalclub.example/api/v1/me',
    );
    expect(
      ApiTransport.uri('api/v1/wallet').toString(),
      'https://api.royalclub.example/api/v1/wallet',
    );
  });

  test('rejects insecure non-local HTTP origins', () {
    expect(
      () => ApiTransport.setVerifiedOrigin('http://api.royalclub.example'),
      throwsArgumentError,
    );
  });

  test('allows HTTP only for local development endpoints', () {
    ApiTransport.setVerifiedOrigin('http://10.0.2.2:8080/');
    expect(ApiTransport.baseUrl, 'http://10.0.2.2:8080');
  });

  test('rejects credentials, paths, queries and fragments in an origin', () {
    for (final value in [
      'https://user:secret@api.royalclub.example',
      'https://api.royalclub.example/v1',
      'https://api.royalclub.example?debug=true',
      'https://api.royalclub.example#fragment',
    ]) {
      expect(
        () => ApiTransport.setVerifiedOrigin(value),
        throwsArgumentError,
        reason: 'Rejected unsafe API origin: $value',
      );
    }
  });

  test('requires a configured origin before resolving requests', () {
    expect(() => ApiTransport.uri('/api/v1/me'), throwsException);
  });
}
