import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'api_transport.dart';

class FriendsService {
  static const _storage = FlutterSecureStorage();
  

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    // Send JSON explicitly on action-only POSTs; some Fastify adapters reject
    // an empty body when Content-Type is application/json.
    return {
      'Authorization': 'Bearer $token',
      'Accept': 'application/json',
    };
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path,
  ) async {
    ApiTransport.ensureConfigured();
    final headers = await _headers();
    final uri = ApiTransport.uri(path);
    late http.Response response;
    try {
      switch (method) {
        case 'POST':
          // Send a valid, explicit JSON payload even for action-only endpoints.
          response = await http.post(
            uri,
            headers: {...headers, 'Content-Type': 'application/json'},
            body: jsonEncode(<String, dynamic>{}),
          ).timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          response = await http.delete(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
          break;
        default:
          response = await http.get(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
      }
    } on TimeoutException {
      throw Exception('پاسخ سرور بیش از حد طول کشید؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور برقرار نشد؛ آدرس API و دسترسی اینترنت را بررسی کنید.');
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
      final detail = decoded['error']?.toString() ?? decoded['message']?.toString() ?? 'خطای سرور';
      throw Exception('$detail (HTTP ${response.statusCode})');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> list() =>
      _request('GET', '/api/v1/friends');

  static Future<List<Map<String, dynamic>>> searchByUsername(
      String username) async {
    final cleanUsername =
        username.trim().replaceFirst(RegExp(r'^@'), '');
    final result = await _request(
      'GET',
      '/api/v1/users/search?username=${Uri.encodeQueryComponent(cleanUsername)}',
    );
    return (result['users'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  static Future<void> requestFriend(String id) async {
    await _request('POST', '/api/v1/friends/$id/request');
  }

  static Future<void> accept(String id) async {
    await _request('POST', '/api/v1/friends/$id/accept');
  }

  static Future<void> remove(String id) async {
    await _request('DELETE', '/api/v1/friends/$id');
  }
}
