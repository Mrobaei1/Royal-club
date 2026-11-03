import 'dart:convert';

import 'package:http/http.dart' as http;

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

/// Standalone HTTP adapter. The host supplies the API base URI and a secure
/// access-token loader; this package never stores credentials itself.
class HokmHttpApi implements HokmApi {
  final Uri baseUri;
  final Future<String?> Function() accessTokenLoader;
  final http.Client _client;

  HokmHttpApi({
    required this.baseUri,
    required this.accessTokenLoader,
    http.Client? client,
  }) : _client = client ?? http.Client() {
    if (!baseUri.hasScheme || !baseUri.hasAuthority) {
      throw ArgumentError.value(baseUri, 'baseUri', 'An absolute HTTP(S) URI is required');
    }
    if (!['http', 'https'].contains(baseUri.scheme)) {
      throw ArgumentError.value(baseUri, 'baseUri', 'Only HTTP(S) is supported');
    }
  }

  String _roomPath(String roomId) => '/api/v1/hokm/rooms/${Uri.encodeComponent(roomId)}';

  Future<Map<String, dynamic>> _request(String method, String path, [Map<String, dynamic>? body]) async {
    final token = (await accessTokenLoader())?.trim();
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final uri = baseUri.resolve(path);
    final headers = <String, String>{
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
      if (body != null) 'Content-Type': 'application/json',
    };
    late http.Response response;
    switch (method) {
      case 'GET':
        response = await _client.get(uri, headers: headers);
        break;
      case 'POST':
        response = await _client.post(uri, headers: headers, body: body == null ? null : jsonEncode(body));
        break;
      default:
        throw ArgumentError.value(method, 'method', 'Unsupported HTTP method');
    }
    Map<String, dynamic> payload;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map) throw const FormatException('Expected a JSON object');
      payload = Map<String, dynamic>.from(decoded);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(payload['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return payload;
  }

  @override
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom}) =>
      _request('POST', '/api/v1/hokm/rooms', {'matchTarget': matchTarget, 'privateRoom': privateRoom});

  @override
  Future<Map<String, dynamic>> viewRoom(String roomId) => _request('GET', _roomPath(roomId));

  @override
  Future<Map<String, dynamic>> joinRoom(String roomId, [int? expectedVersion]) =>
      _request('POST', '${_roomPath(roomId)}/join', {
        if (expectedVersion != null) 'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/ready', {'ready': ready, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/start', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> startNextRound(String roomId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/next-round', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/command', {'command': command, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/cancel-vote', {'approve': approve, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/leave', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> disconnect(String roomId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/disconnect', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> reconnect(String roomId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/reconnect', {'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/reports', {
        'reportedUserId': reportedUserId, 'reason': reason, 'expectedVersion': expectedVersion,
      });

  @override
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/appeals', {'reason': reason, 'expectedVersion': expectedVersion});

  @override
  Future<Map<String, dynamic>> sendChatMessage(String roomId, String recipientUserId, String text, String messageId, int expectedVersion) =>
      _request('POST', '${_roomPath(roomId)}/chat', {
        'recipientUserId': recipientUserId, 'text': text, 'messageId': messageId, 'expectedVersion': expectedVersion,
      });

  void close() => _client.close();
}
