import 'package:shared_preferences/shared_preferences.dart';

/// Stores only the last UNO room code so an authenticated player can resume
/// after the Flutter process is restarted. Access tokens are never persisted.
class UnoRoomSessionStore {
  static const _roomCodeKey = 'royal_club_uno.last_room_code';

  Future<String?> readRoomCode() async {
    final preferences = await SharedPreferences.getInstance();
    final code = preferences.getString(_roomCodeKey)?.trim().toUpperCase();
    if (code == null || code.isEmpty) return null;
    return code;
  }

  Future<void> saveRoomCode(String code) async {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty) {
      await clearRoomCode();
      return;
    }
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_roomCodeKey, normalized);
  }

  Future<void> clearRoomCode() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_roomCodeKey);
  }
}
