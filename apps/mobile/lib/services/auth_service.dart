import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AuthService {
  static const String baseUrl =
      'https://super-duper-palm-tree-4r9v56pv6gcj7rw-3000.app.github.dev';
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> data,
  ) async {
    final response = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    );

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw Exception('پاسخ سرور نامعتبر است.');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        decoded['message'] ?? decoded['error'] ?? 'خطا در ارتباط با سرور',
      );
    }

    final token = decoded['accessToken'] ?? decoded['token'];
    if (token is String && token.isNotEmpty) {
      await _storage.write(key: 'royal_club_token', value: token);
      decoded['token'] = token;
    }

    return decoded;
  }

  static Future<Map<String, dynamic>> register(
    String email,
    String password,
  ) =>
      _post('/api/v1/auth/register', {
        'email': email.trim(),
        'password': password,
      });

  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) =>
      _post('/api/v1/auth/login', {
        'email': email.trim(),
        'password': password,
      });

  static Future<Map<String, dynamic>> me() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }

    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/me'),
      headers: {'Authorization': 'Bearer $token'},
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
      throw Exception('دریافت اطلاعات حساب ناموفق بود.');
    }

    return decoded;
  }

  static Future<String?> rememberedEmail() =>
      _storage.read(key: 'royal_club_remembered_email');

  static Future<void> setRememberedEmail(String email, bool remember) async {
    if (remember) {
      await _storage.write(
        key: 'royal_club_remembered_email',
        value: email.trim(),
      );
    } else {
      await _storage.delete(key: 'royal_club_remembered_email');
    }
  }

  static Future<void> logout() => _storage.delete(key: 'royal_club_token');
}
