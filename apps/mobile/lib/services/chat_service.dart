import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'auth_service.dart';

class ChatService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const Duration _requestTimeout = Duration(seconds: 15);

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
    String path, {
    Map<String, dynamic>? body,
  }) async {
    AuthService.ensureConfigured();
    final base = AuthService.baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base$path');
    final headers = await _headers();
    late final http.Response response;

    try {
      response = await (body == null
              ? http.get(uri, headers: headers)
              : http.post(uri, headers: headers, body: jsonEncode(body)))
          .timeout(_requestTimeout);
    } on TimeoutException {
      throw Exception('پاسخ سرور بیش از حد طول کشید. لطفاً دوباره تلاش کنید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید.');
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw Exception('پاسخ سرور نامعتبر است.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        decoded['error']?.toString() ?? 'درخواست ناموفق بود (${response.statusCode}).',
      );
    }
    return decoded;
  }

  static Future<List<dynamic>> conversations() async =>
      (await _request('/api/v1/chat/conversations'))['conversations']
          as List<dynamic>? ??
      [];

  static Future<List<dynamic>> messages(String userId) async =>
      (await _request('/api/v1/chat/$userId/messages'))['messages']
          as List<dynamic>? ??
      [];

  static Future<Map<String, dynamic>> report(
    String userId,
    String reason,
  ) async =>
      _request('/api/v1/users/$userId/report', body: {'reason': reason});

  static Future<void> send(String userId, String body) async {
    await _request('/api/v1/chat/$userId/messages', body: {'body': body});
  }
}
