import 'auth_service.dart';

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
  Future<Map<String, dynamic>> managerView(String roomId);
  Future<Map<String, dynamic>> reviewReport(String roomId, String reportId, String notes, int expectedVersion);
  Future<Map<String, dynamic>> reviewAppeal(String roomId, String appealId, String decision, String notes, int expectedVersion);
}

typedef HokmGet = Future<Map<String, dynamic>> Function(String path);
typedef HokmPost = Future<Map<String, dynamic>> Function(String path, Map<String, dynamic> body);

/// Authenticated adapter for the existing Royal Club API session.
/// The injectable functions keep the client testable without exposing tokens.
class HokmService implements HokmApi {
  final HokmGet _get;
  final HokmPost _post;

  HokmService({HokmGet? get, HokmPost? post})
      : _get = get ?? AuthService.authenticatedGet,
        _post = post ?? AuthService.authenticatedPost;

  String _roomPath(String roomId) => '/api/v1/hokm/rooms/${Uri.encodeComponent(roomId)}';

  @override
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom}) =>
      _post('/api/v1/hokm/rooms', {'matchTarget': matchTarget, 'privateRoom': privateRoom});

  @override
  Future<Map<String, dynamic>> viewRoom(String roomId) => _get(_roomPath(roomId));

  @override
  Future<Map<String, dynamic>> joinRoom(String roomId, [int? expectedVersion]) =>
      _post('${_roomPath(roomId)}/join', {if (expectedVersion != null) 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion) =>
      _post('${_roomPath(roomId)}/ready', {'ready': ready, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/start', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> startNextRound(String roomId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/next-round', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion) =>
      _post('${_roomPath(roomId)}/command', {'command': command, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion) =>
      _post('${_roomPath(roomId)}/cancel-vote', {'approve': approve, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/leave', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> disconnect(String roomId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/disconnect', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> reconnect(String roomId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/reconnect', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion) =>
      _post('${_roomPath(roomId)}/reports', {
        'reportedUserId': reportedUserId, 'reason': reason, 'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion) =>
      _post('${_roomPath(roomId)}/appeals', {'reason': reason, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> sendChatMessage(String roomId, String recipientUserId, String text, String messageId, int expectedVersion) =>
      _post('${_roomPath(roomId)}/chat', {
        'recipientUserId': recipientUserId, 'text': text, 'messageId': messageId, 'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> managerView(String roomId) => _get('${_roomPath(roomId)}/manager');

  @override
  Future<Map<String, dynamic>> reviewReport(String roomId, String reportId, String notes, int expectedVersion) =>
      _post('${_roomPath(roomId)}/manager/reports/${Uri.encodeComponent(reportId)}/review', {
        'notes': notes, 'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> reviewAppeal(String roomId, String appealId, String decision, String notes, int expectedVersion) =>
      _post('${_roomPath(roomId)}/manager/appeals/${Uri.encodeComponent(appealId)}/review', {
        'decision': decision, 'notes': notes, 'expectedVersion': expectedVersion,
      });
}
