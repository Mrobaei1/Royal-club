import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class AdminService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب شوید.');
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String method, String path, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    final uri = Uri.parse('${AuthService.baseUrl}$path');
    final response = switch (method) {
      'GET' => await http.get(uri, headers: headers),
      'POST' => await http.post(uri, headers: headers, body: jsonEncode(body ?? {})),
      'PATCH' => await http.patch(uri, headers: headers, body: jsonEncode(body ?? {})),
      _ => throw ArgumentError('Unsupported request method'),
    };
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<bool> isOwner() async => (await _request('GET', '/api/v1/admin/status'))['isOwner'] == true;
  static Future<List<dynamic>> plans() async => (await _request('GET', '/api/v1/admin/subscription-plans'))['plans'] as List<dynamic>? ?? [];
  static Future<List<dynamic>> findUser(String email) async =>
      (await _request('GET', '/api/v1/users/search?email=${Uri.encodeQueryComponent(email.trim())}'))['users'] as List<dynamic>? ?? [];
  static Future<void> credit(String userId, int amount, String description) async {
    await _request('POST', '/api/v1/admin/wallet/credit', body: {'userId': userId, 'amount': amount, 'description': description});
  }
  static Future<void> updatePlan(String code, {String? name, int? durationDays, int? priceCredits, bool? active}) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (durationDays != null) body['durationDays'] = durationDays;
    if (priceCredits != null) body['priceCredits'] = priceCredits;
    if (active != null) body['active'] = active;
    await _request('PATCH', '/api/v1/admin/subscription-plans/$code', body: body);
  }
}
