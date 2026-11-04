import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/services/hokm_service.dart';

void main() {
  test('Hokm service uses versioned authenticated API paths and payloads', () async {
    final calls = <Map<String, dynamic>>[];
    final api = HokmService(
      get: (path) async {
        calls.add({'method': 'GET', 'path': path});
        return {'roomId': 'room'};
      },
      post: (path, body) async {
        calls.add({'method': 'POST', 'path': path, 'body': body});
        return {'roomId': 'room', 'version': 2};
      },
    );

    await api.createRoom(matchTarget: 5, privateRoom: true);
    await api.joinRoom('room/with space', 2);
    await api.sendChatMessage('room', 'opponent', 'hello 👋', 'message-1', 3);
    await api.managerView('room');
    await api.reviewReport('room', 'report/1', 'checked', 4);
    await api.reviewAppeal('room', 'appeal-1', 'dismiss', 'reviewed', 5);

    expect(calls[0]['path'], '/api/v1/hokm/rooms');
    expect(calls[0]['body'], {'matchTarget': 5, 'privateRoom': true});
    expect(calls[1]['path'], '/api/v1/hokm/rooms/room%2Fwith%20space/join');
    expect((calls[1]['body'] as Map)['expectedVersion'], 2);
    expect(calls[2]['path'], '/api/v1/hokm/rooms/room/chat');
    expect((calls[2]['body'] as Map)['recipientUserId'], 'opponent');
    expect((calls[2]['body'] as Map)['text'], 'hello 👋');
    expect(calls[3]['path'], '/api/v1/hokm/rooms/room/manager');
    expect(calls[4]['path'], '/api/v1/hokm/rooms/room/manager/reports/report%2F1/review');
    expect(calls[5]['path'], '/api/v1/hokm/rooms/room/manager/appeals/appeal-1/review');
  });

  test('Hokm service propagates authorization and transport failures', () async {
    final api = HokmService(
      get: (_) async => throw Exception('Session expired'),
      post: (_, __) async => throw Exception('Network unavailable'),
    );
    await expectLater(api.viewRoom('room'), throwsA(isA<Exception>()));
    await expectLater(api.startMatch('room', 1), throwsA(isA<Exception>()));
  });

  test('Hokm service decodes authenticated SSE room events', () async {
    final api = HokmService(
      eventStream: (path) {
        expect(path, '/api/v1/hokm/rooms/room/events');
        return Stream.value(jsonEncode({'roomId': 'room', 'version': 9, 'status': 'playing'}));
      },
    );
    final update = await api.watchRoom('room').single;
    expect(update['roomId'], 'room');
    expect(update['version'], 9);
    expect(update['status'], 'playing');
  });

}
