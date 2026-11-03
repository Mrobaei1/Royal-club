abstract class HokmApi {
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom});
  Future<Map<String, dynamic>> viewRoom(String roomId);
  Future<Map<String, dynamic>> joinRoom(String roomId, [int? expectedVersion]);
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion);
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> startNextRound(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion);
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion);
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> disconnect(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> reconnect(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion);
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion);
  Future<Map<String, dynamic>> sendChatMessage(String roomId, String recipientUserId, String text, String messageId, int expectedVersion);
}
