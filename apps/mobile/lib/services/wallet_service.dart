import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'api_transport.dart';

class WalletService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String path, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    final response = body == null
        ? await http.get(ApiTransport.uri(path), headers: headers)
        : await http.post(ApiTransport.uri(path), headers: headers, body: jsonEncode(body));
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> wallet() => _request('/api/v1/wallet');
  static Future<Map<String, dynamic>> plans() => _request('/api/v1/subscriptions/plans');
  static Future<Map<String, dynamic>> currentSubscription() => _request('/api/v1/subscriptions/me');
  static Future<Map<String, dynamic>> activate(String code) =>
      _request('/api/v1/subscriptions/activate', body: {'planCode': code});
}
