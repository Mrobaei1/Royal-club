import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class MatchService {
  static const _storage = FlutterSecureStorage();
  static const _baseUrl = AuthService.baseUrl;

  // Normalize the configured API URL in one place so a trailing slash cannot
  // create a double-slash route, and fail clearly when the API is not configured.
  static Uri _uri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1/matches$path');
  }

  static Future<http.Response> _getWithRetry(Uri uri, Map<String, String> headers) async {
    Object? lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        return await http.get(uri, headers: headers).timeout(const Duration(seconds: 12));
      } catch (error) {
        lastError = error;
        if (attempt < 2) await Future<void>.delayed(Duration(milliseconds: 350 * (attempt + 1)));
      }
    }
    throw Exception('اتصال به سرور ناپایدار است؛ وضعیت اتصال را بررسی و دوباره تلاش کنید. ($lastError)');
  }
  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }
  static Future<Map<String, dynamic>> _request(String method, String path) async {
    final headers = await _headers();
    final uri = _uri(path);
    late http.Response response;
    switch (method) {
      case 'POST': response = await http.post(uri, headers: headers, body: jsonEncode(<String, dynamic>{})).timeout(const Duration(seconds: 12)); break;
      case 'DELETE': response = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 12)); break;
      default: response = await _getWithRetry(uri, headers);
    }
    dynamic decoded;
    try { decoded = jsonDecode(response.body); } catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست. آدرس API و دسترسی Codespaces را بررسی کنید.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }
  // The API uses positive numeric database IDs. Normalize legacy aliases and
  // reject malformed payloads before a screen can call /matches/null or /matches/undefined.
  static Map<String, dynamic> _requireMatchId(Map<String, dynamic> match, {String source = 'server'}) {
    final rawId = match['id'] ?? match['matchId'] ?? match['match_id'];
    final id = rawId?.toString().trim() ?? '';
    if (!RegExp(r'^[1-9][0-9]*
      ((await _request('GET', '/open'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<List<Map<String, dynamic>>> listLive() async =>
      ((await _request('GET', '/live'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  static Future<List<Map<String, dynamic>>> history() async =>
      ((await _request('GET', '/history'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<Map<String, dynamic>> create() async {
    final payload = await _request('POST', '');
    if (payload['match'] is! Map) {
      throw Exception('پاسخ ساخت اتاق از سرور ناقص است.');
    }
    return _requireMatchId(Map<String, dynamic>.from(payload['match'] as Map));
  }
  static Future<Map<String, dynamic>> join(String id) async {
    final payload = await _request('POST', '/$id/join');
    if (payload['match'] is! Map) throw Exception('پاسخ پیوستن به اتاق از سرور ناقص است.');
    return _requireMatchId(Map<String, dynamic>.from(payload['match'] as Map));
  }
  static Future<void> cancel(String id) async { await _request('DELETE', '/$id'); }
  static Future<Map<String, dynamic>> get(String id) async {
    if (!RegExp(r'^[1-9][0-9]*

  static Future<Map<String, dynamic>> getState(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id/state'))['state'] as Map);

  static Future<Map<String, dynamic>> spectate(String id) async =>
      await _request('GET', '/$id/spectate');

  static Future<bool> setSpectatorsEnabled(String id, bool enabled) async =>
      ((await _postJson('/matches/$id/spectators', {'enabled': enabled}))['settings'] as Map)['spectatorsEnabled'] == true;

  static Future<Map<String, dynamic>> endTurn(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/end-turn'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> batchMove(
    String id, {required List<Map<String, int?>> moves, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves/batch'),
      headers: headers,
      body: jsonEncode({'moves': moves, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final rejected = decoded['rejectedMove'];
      final detail = rejected == null ? '' : ' (حرکت شماره $rejected)';
      throw Exception('${decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})'}$detail');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> move(
    String id, {required int? from, required int? to, required int die, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves'),
      headers: headers,
      body: jsonEncode({'from': from, 'to': to, 'die': die, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> roll(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/roll'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }
  static Uri _apiUri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1$path');
  }

  static Future<Map<String, dynamic>> _postJson(String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.post(
      _apiUri(path), headers: headers, body: jsonEncode(body),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }

  static Future<List<Map<String, dynamic>>> friends() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/friends'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ فهرست دوستان قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت فهرست دوستان ناموفق بود.');
    }
    return ((decoded['friends'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<List<Map<String, dynamic>>> pendingInvites() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/match-invites'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ دعوت‌های بازی قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت دعوت‌های بازی ناموفق بود.');
    }
    return ((decoded['invites'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<void> inviteFriend(String matchId, String friendId) async {
    await _postJson('/matches/$matchId/invites', {'inviteeId': friendId});
  }

  static Future<Map<String, dynamic>> respondToInvite(String inviteId, {required bool accept}) async {
    final payload = await _postJson('/match-invites/$inviteId/respond', {'accept': accept});
    if (accept && payload['match'] is Map) {
      payload['match'] = _requireMatchId(Map<String, dynamic>.from(payload['match'] as Map));
    }
    return payload;
  }

  static Future<Map<String, dynamic>> updateSetup(
    String id, {int? matchToWin, bool? acceptSettings, bool? ready}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/setup', <String, dynamic>{
      if (matchToWin != null) 'matchToWin': matchToWin,
      if (acceptSettings != null) 'acceptSettings': acceptSettings,
      if (ready != null) 'ready': ready,
    }))['setup'] as Map);
  }

  static Future<Map<String, dynamic>> proposeOrRespondCancellation(
    String id, {required bool accept}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/cancellation', {'accept': accept}))['cancellation'] as Map);
  }

  static Future<Map<String, dynamic>> resign(
    String id, {required String scope}
  ) async {
    if (scope != 'game' && scope != 'match') {
      throw ArgumentError.value(scope, 'scope', 'Expected game or match');
    }
    return Map<String, dynamic>.from(
      (await _postJson('/matches/$id/resign', {'scope': scope}))['result'] as Map,
    );
  }

}
).hasMatch(id)) {
      throw Exception(source == 'server'
          ? 'سرور شناسه معتبر اتاق بازی را برنگرداند. لطفاً دوباره تلاش کنید.'
          : 'شناسه اتاق بازی معتبر نیست. فهرست اتاق‌ها را تازه‌سازی کنید.');
    }
    return <String, dynamic>{...match, 'id': id};
  }

  static Future<List<Map<String, dynamic>>> listOpen() async =>
      ((await _request('GET', '/open'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<List<Map<String, dynamic>>> listLive() async =>
      ((await _request('GET', '/live'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  static Future<List<Map<String, dynamic>>> history() async =>
      ((await _request('GET', '/history'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<Map<String, dynamic>> create() async =>
      Map<String, dynamic>.from((await _request('POST', ''))['match'] as Map);
  static Future<Map<String, dynamic>> join(String id) async =>
      Map<String, dynamic>.from((await _request('POST', '/$id/join'))['match'] as Map);
  static Future<void> cancel(String id) async { await _request('DELETE', '/$id'); }
  static Future<Map<String, dynamic>> get(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id'))['match'] as Map);

  static Future<Map<String, dynamic>> getState(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id/state'))['state'] as Map);

  static Future<Map<String, dynamic>> spectate(String id) async =>
      await _request('GET', '/$id/spectate');

  static Future<bool> setSpectatorsEnabled(String id, bool enabled) async =>
      ((await _postJson('/matches/$id/spectators', {'enabled': enabled}))['settings'] as Map)['spectatorsEnabled'] == true;

  static Future<Map<String, dynamic>> endTurn(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/end-turn'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> batchMove(
    String id, {required List<Map<String, int?>> moves, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves/batch'),
      headers: headers,
      body: jsonEncode({'moves': moves, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final rejected = decoded['rejectedMove'];
      final detail = rejected == null ? '' : ' (حرکت شماره $rejected)';
      throw Exception('${decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})'}$detail');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> move(
    String id, {required int? from, required int? to, required int die, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves'),
      headers: headers,
      body: jsonEncode({'from': from, 'to': to, 'die': die, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> roll(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/roll'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }
  static Uri _apiUri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1$path');
  }

  static Future<Map<String, dynamic>> _postJson(String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.post(
      _apiUri(path), headers: headers, body: jsonEncode(body),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }

  static Future<List<Map<String, dynamic>>> friends() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/friends'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ فهرست دوستان قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت فهرست دوستان ناموفق بود.');
    }
    return ((decoded['friends'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<List<Map<String, dynamic>>> pendingInvites() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/match-invites'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ دعوت‌های بازی قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت دعوت‌های بازی ناموفق بود.');
    }
    return ((decoded['invites'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<void> inviteFriend(String matchId, String friendId) async {
    await _postJson('/matches/$matchId/invites', {'inviteeId': friendId});
  }

  static Future<Map<String, dynamic>> respondToInvite(String inviteId, {required bool accept}) async =>
      _postJson('/match-invites/$inviteId/respond', {'accept': accept});

  static Future<Map<String, dynamic>> updateSetup(
    String id, {int? matchToWin, bool? acceptSettings, bool? ready}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/setup', <String, dynamic>{
      if (matchToWin != null) 'matchToWin': matchToWin,
      if (acceptSettings != null) 'acceptSettings': acceptSettings,
      if (ready != null) 'ready': ready,
    }))['setup'] as Map);
  }

  static Future<Map<String, dynamic>> proposeOrRespondCancellation(
    String id, {required bool accept}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/cancellation', {'accept': accept}))['cancellation'] as Map);
  }

  static Future<Map<String, dynamic>> resign(
    String id, {required String scope}
  ) async {
    if (scope != 'game' && scope != 'match') {
      throw ArgumentError.value(scope, 'scope', 'Expected game or match');
    }
    return Map<String, dynamic>.from(
      (await _postJson('/matches/$id/resign', {'scope': scope}))['result'] as Map,
    );
  }

}
).hasMatch(id)) {
      throw Exception('شناسه اتاق بازی معتبر نیست.');
    }
    final payload = await _request('GET', '/$id');
    if (payload['match'] is! Map) throw Exception('اطلاعات اتاق از سرور ناقص است.');
    return _requireMatchId(Map<String, dynamic>.from(payload['match'] as Map));
  }

  static Future<Map<String, dynamic>> getState(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id/state'))['state'] as Map);

  static Future<Map<String, dynamic>> spectate(String id) async =>
      await _request('GET', '/$id/spectate');

  static Future<bool> setSpectatorsEnabled(String id, bool enabled) async =>
      ((await _postJson('/matches/$id/spectators', {'enabled': enabled}))['settings'] as Map)['spectatorsEnabled'] == true;

  static Future<Map<String, dynamic>> endTurn(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/end-turn'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> batchMove(
    String id, {required List<Map<String, int?>> moves, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves/batch'),
      headers: headers,
      body: jsonEncode({'moves': moves, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final rejected = decoded['rejectedMove'];
      final detail = rejected == null ? '' : ' (حرکت شماره $rejected)';
      throw Exception('${decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})'}$detail');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> move(
    String id, {required int? from, required int? to, required int die, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves'),
      headers: headers,
      body: jsonEncode({'from': from, 'to': to, 'die': die, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> roll(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/roll'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }
  static Uri _apiUri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1$path');
  }

  static Future<Map<String, dynamic>> _postJson(String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.post(
      _apiUri(path), headers: headers, body: jsonEncode(body),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }

  static Future<List<Map<String, dynamic>>> friends() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/friends'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ فهرست دوستان قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت فهرست دوستان ناموفق بود.');
    }
    return ((decoded['friends'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<List<Map<String, dynamic>>> pendingInvites() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/match-invites'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ دعوت‌های بازی قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت دعوت‌های بازی ناموفق بود.');
    }
    return ((decoded['invites'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<void> inviteFriend(String matchId, String friendId) async {
    await _postJson('/matches/$matchId/invites', {'inviteeId': friendId});
  }

  static Future<Map<String, dynamic>> respondToInvite(String inviteId, {required bool accept}) async =>
      _postJson('/match-invites/$inviteId/respond', {'accept': accept});

  static Future<Map<String, dynamic>> updateSetup(
    String id, {int? matchToWin, bool? acceptSettings, bool? ready}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/setup', <String, dynamic>{
      if (matchToWin != null) 'matchToWin': matchToWin,
      if (acceptSettings != null) 'acceptSettings': acceptSettings,
      if (ready != null) 'ready': ready,
    }))['setup'] as Map);
  }

  static Future<Map<String, dynamic>> proposeOrRespondCancellation(
    String id, {required bool accept}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/cancellation', {'accept': accept}))['cancellation'] as Map);
  }

  static Future<Map<String, dynamic>> resign(
    String id, {required String scope}
  ) async {
    if (scope != 'game' && scope != 'match') {
      throw ArgumentError.value(scope, 'scope', 'Expected game or match');
    }
    return Map<String, dynamic>.from(
      (await _postJson('/matches/$id/resign', {'scope': scope}))['result'] as Map,
    );
  }

}
).hasMatch(id)) {
      throw Exception(source == 'server'
          ? 'سرور شناسه معتبر اتاق بازی را برنگرداند. لطفاً دوباره تلاش کنید.'
          : 'شناسه اتاق بازی معتبر نیست. فهرست اتاق‌ها را تازه‌سازی کنید.');
    }
    return <String, dynamic>{...match, 'id': id};
  }

  static Future<List<Map<String, dynamic>>> listOpen() async =>
      ((await _request('GET', '/open'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<List<Map<String, dynamic>>> listLive() async =>
      ((await _request('GET', '/live'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  static Future<List<Map<String, dynamic>>> history() async =>
      ((await _request('GET', '/history'))['matches'] as List? ?? const [])
          .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  static Future<Map<String, dynamic>> create() async =>
      Map<String, dynamic>.from((await _request('POST', ''))['match'] as Map);
  static Future<Map<String, dynamic>> join(String id) async =>
      Map<String, dynamic>.from((await _request('POST', '/$id/join'))['match'] as Map);
  static Future<void> cancel(String id) async { await _request('DELETE', '/$id'); }
  static Future<Map<String, dynamic>> get(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id'))['match'] as Map);

  static Future<Map<String, dynamic>> getState(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id/state'))['state'] as Map);

  static Future<Map<String, dynamic>> spectate(String id) async =>
      await _request('GET', '/$id/spectate');

  static Future<bool> setSpectatorsEnabled(String id, bool enabled) async =>
      ((await _postJson('/matches/$id/spectators', {'enabled': enabled}))['settings'] as Map)['spectatorsEnabled'] == true;

  static Future<Map<String, dynamic>> endTurn(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/end-turn'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> batchMove(
    String id, {required List<Map<String, int?>> moves, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves/batch'),
      headers: headers,
      body: jsonEncode({'moves': moves, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final rejected = decoded['rejectedMove'];
      final detail = rejected == null ? '' : ' (حرکت شماره $rejected)';
      throw Exception('${decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})'}$detail');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> move(
    String id, {required int? from, required int? to, required int die, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/moves'),
      headers: headers,
      body: jsonEncode({'from': from, 'to': to, 'die': die, 'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }

  static Future<Map<String, dynamic>> roll(String id, int expectedVersion) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/roll'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['state'] as Map);
  }
  static Uri _apiUri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1$path');
  }

  static Future<Map<String, dynamic>> _postJson(String path, Map<String, dynamic> body) async {
    final headers = await _headers();
    final response = await http.post(
      _apiUri(path), headers: headers, body: jsonEncode(body),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }

  static Future<List<Map<String, dynamic>>> friends() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/friends'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ فهرست دوستان قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت فهرست دوستان ناموفق بود.');
    }
    return ((decoded['friends'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<List<Map<String, dynamic>>> pendingInvites() async {
    final headers = await _headers();
    final response = await _getWithRetry(_apiUri('/match-invites'), headers);
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ دعوت‌های بازی قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic> || response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('دریافت دعوت‌های بازی ناموفق بود.');
    }
    return ((decoded['invites'] as List?) ?? const [])
        .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<void> inviteFriend(String matchId, String friendId) async {
    await _postJson('/matches/$matchId/invites', {'inviteeId': friendId});
  }

  static Future<Map<String, dynamic>> respondToInvite(String inviteId, {required bool accept}) async =>
      _postJson('/match-invites/$inviteId/respond', {'accept': accept});

  static Future<Map<String, dynamic>> updateSetup(
    String id, {int? matchToWin, bool? acceptSettings, bool? ready}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/setup', <String, dynamic>{
      if (matchToWin != null) 'matchToWin': matchToWin,
      if (acceptSettings != null) 'acceptSettings': acceptSettings,
      if (ready != null) 'ready': ready,
    }))['setup'] as Map);
  }

  static Future<Map<String, dynamic>> proposeOrRespondCancellation(
    String id, {required bool accept}
  ) async {
    return Map<String, dynamic>.from((await _postJson('/matches/$id/cancellation', {'accept': accept}))['cancellation'] as Map);
  }

  static Future<Map<String, dynamic>> resign(
    String id, {required String scope}
  ) async {
    if (scope != 'game' && scope != 'match') {
      throw ArgumentError.value(scope, 'scope', 'Expected game or match');
    }
    return Map<String, dynamic>.from(
      (await _postJson('/matches/$id/resign', {'scope': scope}))['result'] as Map,
    );
  }

}
