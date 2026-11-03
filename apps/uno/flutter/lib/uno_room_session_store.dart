import 'package:shared_preferences/shared_preferences.dart';

/// Persists only the last room code and its owning public player ID.
/// Access tokens and private game state are never written to local storage.
class UnoRoomSessionStore {
  static const _roomCodeKey = 'royal_club_uno.last_room_code';
  static const _playerIdKey = 'royal_club_uno.last_room_player_id';

  Future<String?> readRoomCode(String playerId) async {
    final preferences = await SharedPreferences.getInstance();
    final owner = preferences.getString(_playerIdKey);
    final code = preferences.getString(_roomCodeKey)?.trim().toUpperCase();
    if (owner != playerId || code == null || code.isEmpty) {
      await clearRoomCode();
      return null;
    }
    return code;
  }

  Future<void> saveRoomCode(String code, {required String playerId}) async {
    final normalized = code.trim().toUpperCase();
    if (normalized.isEmpty || playerId.trim().isEmpty) {
      await clearRoomCode();
      return;
    }
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_roomCodeKey, normalized);
    await preferences.setString(_playerIdKey, playerId);
  }

  Future<void> clearRoomCode() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_roomCodeKey);
    await preferences.remove(_playerIdKey);
  }
}
