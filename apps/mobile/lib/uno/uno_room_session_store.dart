import 'package:shared_preferences/shared_preferences.dart';

/// Persists only the last room code for each public player ID.
/// Access tokens and private game state are never written to local storage.
///
/// Per-player keys prevent delayed reads/writes from a previous account from
/// overwriting or clearing the current account's room recovery state.
class UnoRoomSessionStore {
  static String _roomCodeKey(String playerId) =>
      'royal_club_uno.last_room_code.${Uri.encodeComponent(playerId.trim())}';

  Future<String?> readRoomCode(String playerId) async {
    final normalizedPlayerId = playerId.trim();
    if (normalizedPlayerId.isEmpty) return null;
    final preferences = await SharedPreferences.getInstance();
    final code = preferences.getString(_roomCodeKey(normalizedPlayerId));
    final normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode == null || normalizedCode.isEmpty) {
      return null;
    }
    return normalizedCode;
  }

  Future<void> saveRoomCode(String code, {required String playerId}) async {
    final normalizedPlayerId = playerId.trim();
    if (normalizedPlayerId.isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    final key = _roomCodeKey(normalizedPlayerId);
    final normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.isEmpty) {
      await preferences.remove(key);
      return;
    }
    await preferences.setString(key, normalizedCode);
  }

  Future<void> clearRoomCode({required String playerId}) async {
    final normalizedPlayerId = playerId.trim();
    if (normalizedPlayerId.isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_roomCodeKey(normalizedPlayerId));
  }
}
