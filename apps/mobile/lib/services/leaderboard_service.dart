import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'auth_service.dart';

class LeaderboardService {
  static const _storage = FlutterSecureStorage();

  static Future<Map<String, dynamic>> fetch() async {
    AuthService.ensureConfigured();
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }

    final base = AuthService.baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    late http.Response response;
    try {
      response = await http.get(
        Uri.parse('$base/api/v1/leaderboard'),
        headers: {'Authorization': 'Bearer $token', 'Accept': 'application/json'},
      ).timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw Exception('پاسخ سرور رتبه‌بندی بیش از حد طول کشید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور رتبه‌بندی برقرار نشد.');
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور رتبه‌بندی قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) {
      throw Exception('پاسخ سرور رتبه‌بندی نامعتبر است.');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'خطای سرور (${response.statusCode})');
    }
    return decoded;
  }
}
