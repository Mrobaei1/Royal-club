import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'api_transport.dart';

class NotificationsService {
  static const _storage = FlutterSecureStorage();

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

  static Future<Map<String, dynamic>> _send(String path) async {
    final response = await http.post(
      ApiTransport.uri(path),
      headers: await _headers(),
      body: jsonEncode(<String, dynamic>{}),
    );
    return _decode(response);
  }

  static Future<Map<String, dynamic>> _decode(http.Response response) async {
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

  static Future<List<Map<String, dynamic>>> list() async {
    final response = await http.get(
      ApiTransport.uri('/api/v1/notifications'),
      headers: await _headers(),
    );
    final result = await _decode(response);
    return (result['notifications'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  static Future<bool> markRead(String id) async {
    final result = await _send('/api/v1/notifications/$id/read');
    return result['cleared'] == true;
  }

  static Future<void> markAllRead() async {
    await _send('/api/v1/notifications/read-all');
  }

  static Future<void> deleteAll() async {
    final response = await http.delete(
      ApiTransport.uri('/api/v1/notifications'),
      headers: await _headers(),
    );
    await _decode(response);
  }
}
