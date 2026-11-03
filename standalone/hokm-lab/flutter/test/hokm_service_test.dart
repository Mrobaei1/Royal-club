import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../lib/services/hokm_service.dart';

void main() {
  test('HTTP adapter binds verified bearer token and preserves CAS request fields', () async {
    late http.Request received;
    final client = MockClient((request) async {
      received = request;
      return http.Response(jsonEncode({'roomId': 'r1', 'version': 8}), 200,
          headers: {'content-type': 'application/json'});
    });
    final api = HokmHttpApi(
      baseUri: Uri.parse('https://example.test'),
      accessTokenLoader: () async => 'secure-token',
      client: client,
    );
    final result = await api.sendChatMessage('r 1', 'opponent', 'سلام 👋', 'msg-1', 7);
    expect(result['version'], 8);
    expect(received.method, 'POST');
    expect(received.url.toString(), 'https://example.test/api/v1/hokm/rooms/r%201/chat');
    expect(received.headers['authorization'], 'Bearer secure-token');
    expect(jsonDecode(received.body), {
      'recipientUserId': 'opponent',
      'text': 'سلام 👋',
      'messageId': 'msg-1',
      'expectedVersion': 7,
    });
    api.close();
  });

  test('HTTP adapter refuses to send a request without a session token', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests++;
      return http.Response('{}', 200);
    });
    final api = HokmHttpApi(
      baseUri: Uri.parse('https://example.test'),
      accessTokenLoader: () async => null,
      client: client,
    );
    await expectLater(api.viewRoom('r1'), throwsException);
    expect(requests, 0);
    api.close();
  });

  test('HTTP adapter rejects malformed server JSON and reports server errors', () async {
    final malformed = HokmHttpApi(
      baseUri: Uri.parse('https://example.test'),
      accessTokenLoader: () async => 'token',
      client: MockClient((request) async => http.Response('not-json', 200)),
    );
    await expectLater(malformed.viewRoom('r1'), throwsException);
    malformed.close();

    final rejected = HokmHttpApi(
      baseUri: Uri.parse('https://example.test'),
      accessTokenLoader: () async => 'token',
      client: MockClient((request) async =>
          http.Response(jsonEncode({'error': 'Stale room version'}), 409)),
    );
    await expectLater(rejected.viewRoom('r1'), throwsException);
    rejected.close();
  });
}


  test('HTTP adapter exposes authenticated manager review and appeal actions', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response(jsonEncode({'roomId': 'r1', 'version': 9}), 200,
          headers: {'content-type': 'application/json'});
    });
    final api = HokmHttpApi(
      baseUri: Uri.parse('https://example.test'),
      accessTokenLoader: () async => 'manager-token',
      client: client,
    );
    await api.managerView('r1');
    await api.reviewReport('r1', 'report-1', 'Checked', 7);
    await api.reviewAppeal('r1', 'appeal-1', 'dismissed', 'Evidence insufficient', 8);
    expect(requests.map((request) => request.method).toList(), ['GET', 'POST', 'POST']);
    expect(requests[0].url.path, '/api/v1/hokm/rooms/r1/manager');
    expect(requests[1].url.path, '/api/v1/hokm/rooms/r1/manager/reports/report-1/review');
    expect(jsonDecode(requests[1].body), {'notes': 'Checked', 'expectedVersion': 7});
    expect(requests[2].url.path, '/api/v1/hokm/rooms/r1/manager/appeals/appeal-1/review');
    expect(jsonDecode(requests[2].body), {
      'decision': 'dismissed',
      'notes': 'Evidence insufficient',
      'expectedVersion': 8,
    });
    expect(requests.every((request) => request.headers['authorization'] == 'Bearer manager-token'), true);
    api.close();
  });
