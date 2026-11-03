import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_club_uno/uno_room_session_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('stores a normalized room code for the owning account', () async {
    final store = UnoRoomSessionStore();
    await store.saveRoomCode('  ab12cd  ', playerId: 'player-1');
    expect(await store.readRoomCode('player-1'), 'AB12CD');
  });

  test('does not restore another account room and clears stale session data', () async {
    final store = UnoRoomSessionStore();
    await store.saveRoomCode('AB12CD', playerId: 'player-1');
    expect(await store.readRoomCode('player-2'), isNull);
    expect(await store.readRoomCode('player-1'), isNull);
  });

  test('clears the saved room code after leaving or receiving an empty code', () async {
    final store = UnoRoomSessionStore();
    await store.saveRoomCode('AB12CD', playerId: 'player-1');
    await store.clearRoomCode();
    expect(await store.readRoomCode('player-1'), isNull);
    await store.saveRoomCode('AB12CD', playerId: 'player-1');
    await store.saveRoomCode(' ', playerId: 'player-1');
    expect(await store.readRoomCode('player-1'), isNull);
  });
}
