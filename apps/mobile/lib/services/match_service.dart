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
  static Future<List<Map<String, dynamic>>> listOpen() async =>
      ((await _request('GET', '/open'))['matches'] as List? ?? const [])
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
  static Future<Map<String, dynamic>> updateSetup(
    String id, {int? matchToWin, bool? acceptSettings, bool? ready}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/setup'),
      headers: headers,
      body: jsonEncode(<String, dynamic>{
        if (matchToWin != null) 'matchToWin': matchToWin,
        if (acceptSettings != null) 'acceptSettings': acceptSettings,
        if (ready != null) 'ready': ready,
      }),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['setup'] as Map);
  }

  static Future<Map<String, dynamic>> proposeOrRespondCancellation(
    String id, {required bool accept}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      _uri('/$id/cancellation'),
      headers: headers,
      body: jsonEncode({'accept': accept}),
    ).timeout(const Duration(seconds: 12));
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    catch (_) { throw Exception('پاسخ سرور قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return Map<String, dynamic>.from(decoded['cancellation'] as Map);
  }

}
