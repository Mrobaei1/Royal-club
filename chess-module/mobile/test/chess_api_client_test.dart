import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_api_client.dart';

Future<HttpServer> _serve(Future<void> Function(HttpRequest) handler) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) {
    handler(request);
  });
  return server;
  test('API client aborts a request that exceeds its configured timeout', () async {
    final server = await _serve((request) async {
      await Future<void>.delayed(const Duration(seconds: 2));
      if (!request.response.headersSent) {
        await _json(request, HttpStatus.ok, {'status': 'late'});
      }
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}'),
      accessToken: 'test-token',
      requestTimeout: const Duration(milliseconds: 100),
    );

    try {
      await expectLater(client.game('123'), throwsA(isA<TimeoutException>()));
    } finally {
      client.dispose();
      await server.close(force: true);
    }
  });

}

Future<void> _json(HttpRequest request, int status, Object body) async {
  request.response
    ..statusCode = status
    ..headers.contentType = ContentType.json
    ..write(jsonEncode(body));
  await request.response.close();
}

void main() {
  test('authenticated API client sends bearer token and decodes a valid response', () async {
    late String authorization;
    final server = await _serve((request) async {
      authorization = request.headers.value(HttpHeaders.authorizationHeader) ?? '';
      expect(request.method, 'GET');
      expect(request.uri.path, '/chess/time-controls');
      await _json(request, HttpStatus.ok, {
        'timeControls': [
          {'id': 'rapid', 'baseMs': 300000, 'incrementMs': 0},
        ],
      });
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}/'),
      accessToken: 'test-access-token',
    );

    try {
      final controls = await client.timeControls();
      expect(authorization, 'Bearer test-access-token');
      expect(controls, hasLength(1));
      expect(controls.single['id'], 'rapid');
    } finally {
      client.dispose();
      await server.close(force: true);
    }
  });

  test('API client converts non-success responses into typed API exceptions', () async {
    final server = await _serve((request) async {
      await _json(request, HttpStatus.unauthorized, {'error': 'invalid_token'});
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}'),
      accessToken: 'expired-token',
    );

    try {
      await expectLater(
        client.game('123'),
        throwsA(isA<ChessApiException>()
            .having((error) => error.statusCode, 'statusCode', 401)
            .having((error) => error.code, 'code', 'invalid_token')),
      );
    } finally {
      client.dispose();
      await server.close(force: true);
    }
  });

  test('API client rejects non-object success payloads', () async {
    final server = await _serve((request) async {
      request.response
        ..statusCode = HttpStatus.ok
        ..headers.contentType = ContentType.json
        ..write(jsonEncode(['unexpected', 'array']));
      await request.response.close();
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}'),
      accessToken: 'test-token',
    );

    try {
      await expectLater(client.game('123'), throwsA(isA<FormatException>()));
    } finally {
      client.dispose();
      await server.close(force: true);
    }
  });

  test('disposed API client rejects subsequent requests', () async {
    final server = await _serve((request) async {
      await _json(request, HttpStatus.ok, {'status': 'active'});
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}'),
      accessToken: 'test-token',
    );
    client.dispose();

    try {
      await expectLater(client.game('123'), throwsA(isA<StateError>()));
    } finally {
      await server.close(force: true);
    }
  });
}
