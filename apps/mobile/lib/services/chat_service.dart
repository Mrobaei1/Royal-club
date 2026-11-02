import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'api_transport.dart';

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
    String method = 'GET',
  }) async {
    ApiTransport.ensureConfigured();
    final uri = ApiTransport.uri(path);
    final headers = await _headers();
    late final http.Response response;

    try {
      final encodedBody = body == null ? null : jsonEncode(body);
      final request = switch (method) {
        'POST' => http.post(uri, headers: headers, body: encodedBody),
        'PATCH' => http.patch(uri, headers: headers, body: encodedBody),
        'DELETE' => http.delete(uri, headers: headers, body: encodedBody),
        _ => http.get(uri, headers: headers),
      };
      response = await request.timeout(_requestTimeout);
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
      _request('/api/v1/users/$userId/report', method: 'POST', body: {'reason': reason});

  static Future<void> send(String userId, String body) async {
    await _request('/api/v1/chat/$userId/messages', method: 'POST', body: {'body': body});
  }
  static Future<Map<String, dynamic>> edit(String userId, String messageId, String body) =>
      _request('/api/v1/chat/$userId/messages/$messageId', method: 'PATCH', body: {'body': body});

  static Future<Map<String, dynamic>> deleteMessages(String userId, List<String> messageIds, {required bool forBoth}) =>
      _request('/api/v1/chat/$userId/messages', method: 'DELETE', body: {
        'messageIds': messageIds,
        'scope': forBoth ? 'both' : 'me',
      });
}

