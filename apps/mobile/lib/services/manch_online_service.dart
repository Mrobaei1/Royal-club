import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'auth_service.dart';

class ManchOnlineService {
  static const _storage = FlutterSecureStorage();
  static const _baseUrl = AuthService.baseUrl;

  static Uri _uri(String path) {
    AuthService.ensureConfigured();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/api/v1/manch/matches$path');
  }

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    return {
      'Authorization': 'Bearer $token',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final headers = await _headers();
    final uri = _uri(path);
    late final http.Response response;
    try {
      switch (method) {
        case 'POST':
          response = await http.post(
            uri,
            headers: headers,
            body: jsonEncode(body ?? <String, dynamic>{}),
          ).timeout(const Duration(seconds: 12));
          break;
        case 'DELETE':
          response = await http.delete(uri, headers: headers)
              .timeout(const Duration(seconds: 12));
          break;
        default:
          response = await http.get(uri, headers: headers)
              .timeout(const Duration(seconds: 12));
      }
    } on TimeoutException {
      throw Exception('پاسخ سرور بیش از حد طول کشید؛ دوباره تلاش کنید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور برقرار نشد؛ اینترنت و آدرس API را بررسی کنید.');
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw Exception('پاسخ سرور نامعتبر است.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        '${decoded['error']?.toString() ?? 'خطای سرور'} (HTTP ${response.statusCode})',
      );
    }
    return decoded;
  }

  static String _requireId(Object? raw) {
    final id = raw?.toString().trim() ?? '';
    if (!RegExp(r'^[1-9][0-9]*$').hasMatch(id)) {
      throw Exception('سرور شناسه معتبر اتاق منچ را برنگرداند.');
    }
    return id;
  }

  static Future<String> currentUserId() async {
    final profile = await AuthService.me();
    final user = profile['user'];
    if (user is! Map<String, dynamic>) {
      throw Exception('اطلاعات حساب کاربری قابل دریافت نیست.');
    }
    return _requireId(user['id']);
  }

  static Future<Map<String, dynamic>?> mine() async {
    final payload = await _request('GET', '/mine');
    final raw = payload['match'];
    if (raw == null) return null;
    if (raw is! Map) {
      throw Exception('اطلاعات بازی قبلی منچ نامعتبر است.');
    }
    final match = Map<String, dynamic>.from(raw);
    match['id'] = _requireId(match['id']);
    return match;
  }

  static Future<List<Map<String, dynamic>>> listOpen() async {
    final payload = await _request('GET', '');
    return ((payload['matches'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .where((match) => RegExp(r'^[1-9][0-9]*$').hasMatch((match['id'] ?? '').toString()))
        .toList();
  }

  static Future<Map<String, dynamic>> create({required int playerCount}) async {
    if (playerCount < 2 || playerCount > 4) {
      throw ArgumentError.value(playerCount, 'playerCount');
    }
    final payload = await _request(
      'POST',
      '',
      body: {'playerCount': playerCount},
    );
    if (payload['match'] is! Map) {
      throw Exception('پاسخ ایجاد اتاق منچ ناقص است.');
    }
    final match = Map<String, dynamic>.from(payload['match'] as Map);
    match['id'] = _requireId(match['id']);
    return match;
  }

  static Future<Map<String, dynamic>> join(String id) async {
    final cleanId = _requireId(id);
    final payload = await _request('POST', '/$cleanId/join');
    if (payload['match'] is! Map) {
      throw Exception('پاسخ پیوستن به اتاق منچ ناقص است.');
    }
    final match = Map<String, dynamic>.from(payload['match'] as Map);
    match['id'] = _requireId(match['id']);
    return match;
  }

  static Future<Map<String, dynamic>> get(String id) async {
    final cleanId = _requireId(id);
    final payload = await _request('GET', '/$cleanId');
    if (payload['match'] is! Map) {
      throw Exception('اطلاعات اتاق منچ ناقص است.');
    }
    final match = Map<String, dynamic>.from(payload['match'] as Map);
    match['id'] = _requireId(match['id']);
    return match;
  }

  static Future<Map<String, dynamic>> roll(
    String id, {
    required int expectedStateVersion,
  }) async =>
      _request(
        'POST',
        '/${_requireId(id)}/roll',
        body: {'expectedStateVersion': expectedStateVersion},
      );

  static Future<Map<String, dynamic>> move(
    String id, {
    required int tokenIndex,
    required int expectedStateVersion,
  }) async =>
      _request(
        'POST',
        '/${_requireId(id)}/move',
        body: {
          'tokenIndex': tokenIndex,
          'expectedStateVersion': expectedStateVersion,
        },
      );

  static Future<Map<String, dynamic>> forfeit(String id) async =>
      _request('POST', '/${_requireId(id)}/forfeit');

  static Future<void> cancel(String id) async {
    await _request('DELETE', '/${_requireId(id)}');
  }
}
