import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class MatchService {
  static const _storage = FlutterSecureStorage();
  static const _baseUrl = AuthService.baseUrl;
  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }
  static Future<Map<String, dynamic>> _request(String method, String path) async {
    final headers = await _headers();
    final uri = Uri.parse('$_baseUrl/api/v1/matches$path');
    late http.Response response;
    switch (method) {
      case 'POST': response = await http.post(uri, headers: headers); break;
      case 'DELETE': response = await http.delete(uri, headers: headers); break;
      default: response = await http.get(uri, headers: headers);
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
  static Future<Map<String, dynamic>> create() async =>
      Map<String, dynamic>.from((await _request('POST', ''))['match'] as Map);
  static Future<Map<String, dynamic>> join(String id) async =>
      Map<String, dynamic>.from((await _request('POST', '/$id/join'))['match'] as Map);
  static Future<void> cancel(String id) async { await _request('DELETE', '/$id'); }
  static Future<Map<String, dynamic>> get(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id'))['match'] as Map);

  static Future<Map<String, dynamic>> getState(String id) async =>
      Map<String, dynamic>.from((await _request('GET', '/$id/state'))['state'] as Map);

  static Future<Map<String, dynamic>> move(
    String id, {required int? from, required int? to, required int die, required int expectedVersion}
  ) async {
    final headers = await _headers();
    final response = await http.post(
      Uri.parse('$_baseUrl/api/v1/matches/$id/moves'),
      headers: headers,
      body: jsonEncode({'from': from, 'to': to, 'die': die, 'expectedVersion': expectedVersion}),
    );
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
      Uri.parse('$_baseUrl/api/v1/matches/$id/roll'),
      headers: headers,
      body: jsonEncode({'expectedVersion': expectedVersion}),
    );
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
}
