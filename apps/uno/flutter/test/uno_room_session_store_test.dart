import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:royal_club_uno/uno_room_session_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('stores a normalized room code for process-restart recovery', () async {
    final store = UnoRoomSessionStore();
    await store.saveRoomCode('  ab12cd  ');
    expect(await store.readRoomCode(), 'AB12CD');
  });

  test('clears the saved room code after leaving or receiving an empty code', () async {
    final store = UnoRoomSessionStore();
    await store.saveRoomCode('AB12CD');
    await store.clearRoomCode();
    expect(await store.readRoomCode(), isNull);
    await store.saveRoomCode('AB12CD');
    await store.saveRoomCode(' ');
    expect(await store.readRoomCode(), isNull);
  });
}
