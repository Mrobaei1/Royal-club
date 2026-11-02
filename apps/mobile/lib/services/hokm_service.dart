import 'auth_service.dart';

abstract class HokmApi {
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom});
  Future<Map<String, dynamic>> viewRoom(String roomId);
  Future<Map<String, dynamic>> joinRoom(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion);
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion);
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion);
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion);
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion);
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion);
}

class HokmService implements HokmApi {
  String _roomPath(String roomId) => '/api/v1/hokm/rooms/${Uri.encodeComponent(roomId)}';

  @override
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom}) =>
      AuthService.authenticatedPost('/api/v1/hokm/rooms', {
        'matchTarget': matchTarget,
        'privateRoom': privateRoom,
      });

  @override
  Future<Map<String, dynamic>> viewRoom(String roomId) =>
      AuthService.authenticatedGet(_roomPath(roomId));

  @override
  Future<Map<String, dynamic>> joinRoom(String roomId, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/join', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/ready', {
        'ready': ready,
        'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/start', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/command', {
        'command': command,
        'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/cancel-vote', {
        'approve': approve,
        'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/leave', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/reports', {
        'reportedUserId': reportedUserId,
        'reason': reason,
        'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion) =>
      AuthService.authenticatedPost('${_roomPath(roomId)}/appeals', {
        'reason': reason,
        'expectedVersion': expectedVersion,
      });
}
