import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'api_transport.dart';

class AuthService {
  /// Compatibility facade; the active origin is owned by ApiTransport.
  static String get baseUrl => ApiTransport.baseUrl;
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static void ensureConfigured({String? configuredBaseUrl}) =>
      ApiTransport.ensureConfigured(configuredBaseUrl: configuredBaseUrl);
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
      throw Exception(decoded['error']?.toString() ??
          decoded['message']?.toString() ?? 'خطا در ارتباط با سرور');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> _post(
      String path, Map<String, dynamic> data) async {
    final response = await _send(() => http.post(
          ApiTransport.uri(path),
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

  static Future<Map<String, dynamic>> register(String email, String password,
          {required String fullName, required String phone, required String country}) =>
      _post('/api/v1/auth/register', {
        'email': email.trim(),
        'password': password,
        'fullName': fullName.trim(),
        'phone': phone.trim(),
        'country': country,
      });

  static Future<Map<String, dynamic>> login(String email, String password) =>
      _post('/api/v1/auth/login', {'email': email.trim(), 'password': password});

  static Future<Map<String, dynamic>> phoneOtpStatus() async {
    return _decode(await _send(
      () => http.get(ApiTransport.uri('/api/v1/auth/phone-otp/status')),
    ));
  }

  static Future<Map<String, dynamic>> requestPhoneOtp({
    required String phone,
    required String purpose,
  }) => _post('/api/v1/auth/phone-otp/request', {
        'phone': phone.trim(),
        'purpose': purpose,
      });

  static Future<Map<String, dynamic>> registerWithPhoneOtp({
    required String phone,
    required String code,
    required String email,
    required String password,
    required String fullName,
    String country = '',
  }) => _post('/api/v1/auth/phone-otp/register', {
        'phone': phone.trim(),
        'code': code.trim(),
        'email': email.trim(),
        'password': password,
        'fullName': fullName.trim(),
        'country': country.trim(),
      });

  static Future<Map<String, dynamic>> loginWithPhoneOtp({
    required String phone,
    required String code,
  }) => _post('/api/v1/auth/phone-otp/login', {
        'phone': phone.trim(),
        'code': code.trim(),
      });

  static Future<Map<String, dynamic>> linkPhoneWithOtp({
    required String phone,
    required String code,
  }) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.post(
      ApiTransport.uri('/api/v1/auth/phone-otp/link'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'phone': phone.trim(), 'code': code.trim()}),
    ));
    return _decode(response);
  }

  static Future<Map<String, dynamic>> me() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return _decode(await _send(() => http.get(
          ApiTransport.uri('/api/v1/me'),
          headers: {'Authorization': 'Bearer $token'},
        )));
  }

  static Future<Map<String, dynamic>> customizationPricing() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return _decode(await _send(() => http.get(
      ApiTransport.uri('/api/v1/account/customization-pricing'),
      headers: {'Authorization': 'Bearer $token'},
    )));
  }

  static Future<Map<String, dynamic>> resetPasswordWithPhoneOtp({
    required String phone,
    required String code,
    required String newPassword,
  }) async {
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    return _decode(await _send(() => http.post(
      ApiTransport.uri('/api/v1/auth/phone-otp/reset-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': phone.trim(), 'code': code.trim(), 'newPassword': newPassword}),
    )));
  }

  static Future<Map<String, dynamic>> updateUsername(String username) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.patch(
          ApiTransport.uri('/api/v1/me/username'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({'username': username.trim().replaceFirst(RegExp(r'^@'), '')}),
        ));
    return _decode(response);
  }

  static Future<Map<String, dynamic>> updateProfile({
    required String fullName,
    required String phone,
    required String country,
  }) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.patch(
          ApiTransport.uri('/api/v1/me/profile'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({
            'fullName': fullName.trim(),
            'phone': phone.trim(),
            'country': country.trim(),
          }),
        ));
    final decoded = await _decode(response);
    final user = decoded['user'];
    return user is Map<String, dynamic> ? user : decoded;
  }

  static Future<Map<String, dynamic>> updateAvatar(String avatarDataUrl) async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    final base = baseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final response = await _send(() => http.patch(
          ApiTransport.uri('/api/v1/me/avatar'),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': 'application/json'
          },
          body: jsonEncode({'avatarDataUrl': avatarDataUrl}),
        ));
    return _decode(response);
  }

  static Future<String?> rememberedEmail() =>
      _storage.read(key: 'royal_club_remembered_email');

  static Future<String?> rememberedPassword() =>
      _storage.read(key: 'royal_club_remembered_password');

  static Future<void> setRememberedCredentials(
      String email, String password, bool remember) async {
    if (remember) {
      await _storage.write(
          key: 'royal_club_remembered_email', value: email.trim());
      await _storage.write(
          key: 'royal_club_remembered_password', value: password);
    } else {
      await _storage.delete(key: 'royal_club_remembered_email');
      await _storage.delete(key: 'royal_club_remembered_password');
    }
  }

  // Kept for compatibility with older callers.
  static Future<void> setRememberedEmail(String email, bool remember) async {
    if (remember) {
      await _storage.write(key: 'royal_club_remembered_email', value: email.trim());
    } else {
      await _storage.delete(key: 'royal_club_remembered_email');
      await _storage.delete(key: 'royal_club_remembered_password');
    }
  }

  static Future<int?> readThemePreference() async {
    final value = await _storage.read(key: 'royal_club_theme');
    return value == null ? null : int.tryParse(value);
  }

  static Future<void> saveThemePreference(int index) =>
      _storage.write(key: 'royal_club_theme', value: index.toString());

  static Future<String?> readLanguagePreference() =>
      _storage.read(key: 'royal_club_language');

  static Future<void> saveLanguagePreference(String languageCode) =>
      _storage.write(key: 'royal_club_language', value: languageCode);

  static Future<void> logout() => _storage.delete(key: 'royal_club_token');
}
