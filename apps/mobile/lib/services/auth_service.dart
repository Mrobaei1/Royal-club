import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class AuthService {
  static const String baseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '');
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static void ensureConfigured({String? configuredBaseUrl}) {
    final value = (configuredBaseUrl ?? baseUrl).trim();
    final uri = Uri.tryParse(value);
    if (value.isEmpty || uri == null || (uri.scheme != 'https' && uri.scheme != 'http') || uri.host.isEmpty) {
      throw Exception('سرور Royal Club هنوز تنظیم نشده است. ابتدا سرویس API را راه‌اندازی کنید.');
    }
  }

  static Future<http.Response> _send(Future<http.Response> Function() request) async {
    ensureConfigured();
    try {
      return await request().timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw Exception('پاسخ سرور بیش از حد طول کشید. لطفاً دوباره تلاش کنید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور برقرار نشد. ممکن است سرویس API خاموش باشد یا آدرس آن تغییر کرده باشد.');
    }
  }

  static Future<Map<String, dynamic>> _decode(http.Response response) async {
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw Exception('پاسخ سرور قابل‌خواندن نیست.');
    }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? decoded['message']?.toString() ?? 'خطا در ارتباط با سرور');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> data) async {
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.post(
      Uri.parse('$base$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(data),
    ));
    final decoded = await _decode(response);
    final token = decoded['accessToken'] ?? decoded['token'];
    if (token is String && token.isNotEmpty) {
      await _storage.write(key: 'royal_club_token', value: token);
      decoded['token'] = token;
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> register(String email, String password, {
    required String fullName, required String phone, required String country,
  }) => _post('/api/v1/auth/register', {
    'email': email.trim(), 'password': password, 'fullName': fullName.trim(),
    'phone': phone.trim(), 'country': country,
  });

  static Future<Map<String, dynamic>> login(String email, String password) =>
      _post('/api/v1/auth/login', {'email': email.trim(), 'password': password});

  static Future<Map<String, dynamic>> me() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return _decode(await _send(() => http.get(
      Uri.parse('$base/api/v1/me'), headers: {'Authorization': 'Bearer $token'},
    )));
  }

  static Future<Map<String, dynamic>> updateUsername(String username) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.patch(
      Uri.parse('$base/api/v1/me/username'),
      headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
      body: jsonEncode({'username': username.trim().replaceFirst(RegExp(r'^@'), '')}),
    ));
    return _decode(response);
  }

  static Future<Map<String, dynamic>> updateAvatar(String avatarDataUrl) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.patch(
      Uri.parse('$base/api/v1/me/avatar'),
      headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
      body: jsonEncode({'avatarDataUrl': avatarDataUrl}),
    ));
    return _decode(response);
  }

  static Future<String?> rememberedEmail() => _storage.read(key: 'royal_club_remembered_email');

  static Future<void> setRememberedEmail(String email, bool remember) async {
    if (remember) {
      await _storage.write(key: 'royal_club_remembered_email', value: email.trim());
    } else {
      await _storage.delete(key: 'royal_club_remembered_email');
    }
  }

  static Future<void> logout() => _storage.delete(key: 'royal_club_token');
}
