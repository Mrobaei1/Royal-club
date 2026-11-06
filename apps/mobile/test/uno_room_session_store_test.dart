import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_club/uno/uno_room_session_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late UnoRoomSessionStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    store = UnoRoomSessionStore();
  });

  test('saved room codes are isolated between Royal Club accounts', () async {
    await store.saveRoomCode('room-a', playerId: '101');
    await store.saveRoomCode('room-b', playerId: '202');

    expect(await store.readRoomCode('101'), 'ROOM-A');
    expect(await store.readRoomCode('202'), 'ROOM-B');
    expect(await store.readRoomCode('303'), isNull);
  });

  test('clearing one account room does not clear another account room', () async {
    await store.saveRoomCode('room-a', playerId: '101');
    await store.saveRoomCode('room-b', playerId: '202');

    await store.clearRoomCode(playerId: '101');

    expect(await store.readRoomCode('101'), isNull);
    expect(await store.readRoomCode('202'), 'ROOM-B');
  });

  test('empty room code removes only that account room', () async {
    await store.saveRoomCode('room-a', playerId: '101');
    await store.saveRoomCode('room-b', playerId: '202');

    await store.saveRoomCode('  ', playerId: '101');

    expect(await store.readRoomCode('101'), isNull);
    expect(await store.readRoomCode('202'), 'ROOM-B');
  });

  test('blank player IDs never read, write or clear another account key', () async {
    await store.saveRoomCode('room-a', playerId: '101');
    await store.saveRoomCode('room-b', playerId: ' ');

    expect(await store.readRoomCode(' '), isNull);
    await store.clearRoomCode(playerId: ' ');
    expect(await store.readRoomCode('101'), 'ROOM-A');
  });
}
