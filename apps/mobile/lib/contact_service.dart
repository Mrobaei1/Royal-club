import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'services/auth_service.dart';

class ContactService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const Duration _requestTimeout = Duration(seconds: 15);

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body}) async {
    AuthService.ensureConfigured();
    final base = AuthService.baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final headers = await _headers();
    final uri = Uri.parse('$base$path');

    late final http.Response response;
    try {
      response = method == 'GET'
          ? await http.get(uri, headers: headers).timeout(_requestTimeout)
          : await http.patch(uri, headers: headers, body: jsonEncode(body ?? {})).timeout(_requestTimeout);
    } on TimeoutException {
      throw Exception('پاسخ سرور بیش از حد طول کشید؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور برقرار نشد؛ آدرس API و دسترسی اینترنت را بررسی کنید.');
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<List<dynamic>> list() async => (await _request('GET', '/api/v1/contact-methods'))['methods'] as List<dynamic>? ?? [];
  static Future<bool> isOwner() async => (await _request('GET', '/api/v1/admin/status'))['isOwner'] == true;
  static Future<void> save(List<Map<String, String>> methods) async {
    await _request('PATCH', '/api/v1/admin/contact-methods', body: {'methods': methods});
  }
}
