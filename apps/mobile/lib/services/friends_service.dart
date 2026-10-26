import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class FriendsService {
  static const _storage = FlutterSecureStorage();
  static const _baseUrl = AuthService.baseUrl;

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    return {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path,
  ) async {
    AuthService.ensureConfigured();
    final headers = await _headers();
    final base = _baseUrl.trim().replaceFirst(RegExp(r'/+
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw Exception('پاسخ سرور نامعتبر است.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> list() =>
      _request('GET', '/api/v1/friends');

  static Future<List<Map<String, dynamic>>> searchByUsername(String username) async {
    final result = await _request(
      'GET',
      '/api/v1/users/search?username=${Uri.encodeQueryComponent(username.trim().replaceFirst(RegExp(r'^@'), ''))}',
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
), '');
    final uri = Uri.parse('$base$path');
    late http.Response response;
    try {
      switch (method) {
        case 'POST':
          response = await http.post(uri, headers: headers).timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          response = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 15));
          break;
        default:
          response = await http.get(uri, headers: headers).timeout(const Duration(seconds: 15));
      }
    } on Exception {
      rethrow;
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
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> list() =>
      _request('GET', '/api/v1/friends');

  static Future<List<Map<String, dynamic>>> searchByUsername(String username) async {
    final result = await _request(
      'GET',
      '/api/v1/users/search?username=${Uri.encodeQueryComponent(username.trim().replaceFirst(RegExp(r'^@'), ''))}',
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
