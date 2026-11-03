import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_api_client.dart';

Future<HttpServer> _serve(Future<void> Function(HttpRequest) handler) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) => unawaited(handler(request)));
  return server;
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

  test('API client rejects malformed JSON success bodies', () async {
    final server = await _serve((request) async {
      request.response
        ..statusCode = HttpStatus.ok
        ..headers.contentType = ContentType.json
        ..write('{broken');
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

  test('API client enforces one deadline across a stalled response body', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) {
      unawaited(() async {
        request.response.headers.contentType = ContentType.json;
        await request.response.flush();
        await Future<void>.delayed(const Duration(seconds: 2));
        try {
          request.response.write(jsonEncode({'status': 'too_late'}));
          await request.response.close();
        } on HttpException {
          // The client has already aborted the timed-out response.
        }
      }());
    });
    final client = ChessApiClient(
      baseUri: Uri.parse('http://127.0.0.1:${server.port}'),
      accessToken: 'test-token',
      requestTimeout: const Duration(milliseconds: 500),
    );

    try {
      await expectLater(client.game('123'), throwsA(isA<TimeoutException>()));
    } finally {
      client.dispose();
      await server.close(force: true);
    }
  });

  test('API client rejects a non-positive request timeout', () {
    expect(
      () => ChessApiClient(
        baseUri: Uri.parse('http://127.0.0.1:8080'),
        accessToken: 'test-token',
        requestTimeout: Duration.zero,
      ),
      throwsArgumentError,
    );
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
