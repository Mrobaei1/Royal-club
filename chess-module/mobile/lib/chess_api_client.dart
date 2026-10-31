import 'dart:convert';
import 'dart:io';

/// Authenticated HTTP/WebSocket client for the standalone chess API.
class ChessApiException implements Exception {
  const ChessApiException(this.statusCode, this.code);
  final int statusCode;
  final String code;
  @override
  String toString() => 'ChessApiException($statusCode, $code)';
}

class ChessApiClient {
  ChessApiClient({
    required this.baseUri,
    required this.accessToken,
    HttpClient? httpClient,
  }) : _http = httpClient ?? HttpClient();

  final Uri baseUri;
  final String accessToken;
  final HttpClient _http;
  bool _disposed = false;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = baseUri.toString().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    if (_disposed) throw StateError('chess_api_client_disposed');
    final request = await _http.openUrl(method, _uri(path, query));
    request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode(body));
    }
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded is Map ? (decoded['error'] ?? 'request_failed') : 'request_failed';
      throw ChessApiException(response.statusCode, error.toString());
    }
    if (decoded is! Map<String, dynamic>) throw const FormatException('invalid_chess_api_response');
    return decoded;
  }

  Future<List<Map<String, dynamic>>> timeControls() async =>
      (await _request('GET', '/chess/time-controls'))['timeControls']
          .cast<Map<String, dynamic>>();

  Future<Map<String, dynamic>> createRoom({
    required String timeControlId,
    int minOpponentLevel = 1,
    bool chatEnabled = true,
    bool voiceEnabled = false,
  }) => _request('POST', '/chess/rooms', body: {
        'timeControlId': timeControlId,
        'minOpponentLevel': minOpponentLevel,
        'chatEnabled': chatEnabled,
        'voiceEnabled': voiceEnabled,
      });

  Future<Map<String, dynamic>> joinRoom(String roomCode) =>
      _request('POST', '/chess/rooms/${Uri.encodeComponent(roomCode)}/join');

  Future<void> cancelRoom(String roomCode) async {
    await _request('DELETE', '/chess/rooms/${Uri.encodeComponent(roomCode)}');
  }

  Future<Map<String, dynamic>> joinMatchmaking({
    required String timeControlId,
    int minOpponentLevel = 1,
  }) => _request('POST', '/chess/matchmaking/join', body: {
        'timeControlId': timeControlId,
        'minOpponentLevel': minOpponentLevel,
      });

  Future<Map<String, dynamic>> matchmakingStatus() =>
      _request('GET', '/chess/matchmaking/status');

  Future<void> cancelMatchmaking() async {
    await _request('DELETE', '/chess/matchmaking/queue');
  }

  Future<Map<String, dynamic>> game(String gameId) =>
      _request('GET', '/chess/games/${Uri.encodeComponent(gameId)}');

  Future<Map<String, dynamic>> gameHistory(String gameId, {int afterPly = 0}) =>
      _request('GET', '/chess/games/${Uri.encodeComponent(gameId)}/history',
          query: {'afterPly': '$afterPly'});

  Future<Map<String, dynamic>> submitMove(
    String gameId, {
    required String from,
    required String to,
    String? promotion,
  }) => _request('POST', '/chess/games/${Uri.encodeComponent(gameId)}/moves',
        body: {'from': from, 'to': to, if (promotion != null) 'promotion': promotion});

  Future<Map<String, dynamic>> sendChat(String gameId, String message) =>
      _request('POST', '/chess/games/${Uri.encodeComponent(gameId)}/chat',
          body: {'message': message});

  Future<List<Map<String, dynamic>>> chatHistory(String gameId, {String afterId = '0'}) async {
    final response = await _request('GET', '/chess/games/${Uri.encodeComponent(gameId)}/chat',
        query: {'afterId': afterId});
    return (response['messages'] as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> resign(String gameId) =>
      _request('POST', '/chess/games/${Uri.encodeComponent(gameId)}/resign');

  Future<Map<String, dynamic>> pendingDrawOffer(String gameId) =>
      _request('GET', '/chess/games/${Uri.encodeComponent(gameId)}/draw-offers');

  Future<Map<String, dynamic>> offerDraw(String gameId) =>
      _request('POST', '/chess/games/${Uri.encodeComponent(gameId)}/draw-offers');

  Future<Map<String, dynamic>> respondToDraw(
    String gameId,
    String offerId, {
    required bool accept,
  }) => _request('POST',
        '/chess/games/${Uri.encodeComponent(gameId)}/draw-offers/${Uri.encodeComponent(offerId)}/respond',
        body: {'accept': accept});

  Future<Map<String, dynamic>> playerProfile(String userId) =>
      _request('GET', '/chess/players/${Uri.encodeComponent(userId)}/profile');

  Future<List<Map<String, dynamic>>> adminAudit({int limit = 50}) async {
    final response = await _request('GET', '/chess/admin/audit', query: {'limit': '$limit'});
    return (response['events'] as List).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> setTimeControl({
    required String id,
    required String displayName,
    required int baseMs,
    required int incrementMs,
    required bool enabled,
  }) => _request('PUT', '/chess/admin/time-controls', body: {
        'id': id,
        'displayName': displayName,
        'baseMs': baseMs,
        'incrementMs': incrementMs,
        'enabled': enabled,
      });

  Future<void> deleteTimeControl(String id) async {
    await _request('DELETE', '/chess/admin/time-controls/${Uri.encodeComponent(id)}');
  }

  Future<void> setVoiceEnabled(String gameId, bool enabled) async {
    await _request('POST', '/chess/games/${Uri.encodeComponent(gameId)}/voice/${enabled ? 'enable' : 'disable'}');
  }

  Future<WebSocket> connectGameSocket(String gameId) async {
    if (_disposed) throw StateError('chess_api_client_disposed');
    final base = baseUri.toString().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/chess/ws').replace(
      scheme: baseUri.scheme == 'https' ? 'wss' : 'ws',
      queryParameters: {'gameId': gameId},
    );
    return WebSocket.connect(uri.toString(), headers: {
      HttpHeaders.authorizationHeader: 'Bearer $accessToken',
    });
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _http.close(force: true);
  }
}
