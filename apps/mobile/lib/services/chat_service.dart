import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class ChatService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String path, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    final response = body == null
        ? await http.get(Uri.parse('${AuthService.baseUrl}$path'), headers: headers)
        : await http.post(Uri.parse('${AuthService.baseUrl}$path'), headers: headers, body: jsonEncode(body));
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<List<dynamic>> conversations() async =>
      (await _request('/api/v1/chat/conversations'))['conversations'] as List<dynamic>? ?? [];
  static Future<List<dynamic>> messages(String userId) async =>
      (await _request('/api/v1/chat/$userId/messages'))['messages'] as List<dynamic>? ?? [];
  static Future<Map<String, dynamic>> report(String userId, String reason) async =>
      await _request('/api/v1/users/$userId/report', body: {'reason': reason});

  static Future<void> send(String userId, String body) async {
    await _request('/api/v1/chat/$userId/messages', body: {'body': body});
  }
}
