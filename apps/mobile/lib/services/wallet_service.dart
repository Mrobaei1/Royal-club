import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'api_transport.dart';

class WalletService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();
  static const Duration _requestTimeout = Duration(seconds: 15);

  static Future<Map<String, String>> _headers() async {
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    return {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'};
  }

  static Future<Map<String, dynamic>> _request(String path, {Map<String, dynamic>? body}) async {
    final headers = await _headers();
    late final http.Response response;
    try {
      response = body == null
          ? await http.get(ApiTransport.uri(path), headers: headers).timeout(_requestTimeout)
          : await http.post(ApiTransport.uri(path), headers: headers, body: jsonEncode(body)).timeout(_requestTimeout);
    } on TimeoutException {
      throw Exception('پاسخ سرور کیف پول بیش از حد طول کشید.');
    } on http.ClientException {
      throw Exception('اتصال به سرور کیف پول برقرار نشد.');
    }
    dynamic decoded;
    try { decoded = jsonDecode(response.body); }
    on FormatException { throw Exception('پاسخ سرور کیف پول قابل‌خواندن نیست.'); }
    if (decoded is! Map<String, dynamic>) throw Exception('پاسخ سرور نامعتبر است.');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(decoded['error']?.toString() ?? 'درخواست ناموفق بود.');
    }
    return decoded;
  }

  static Future<Map<String, dynamic>> wallet() => _request('/api/v1/wallet');
  static Future<Map<String, dynamic>> plans() => _request('/api/v1/subscriptions/plans');
  static Future<Map<String, dynamic>> currentSubscription() => _request('/api/v1/subscriptions/me');
  static const String _pendingPurchaseKeysStorage = 'royal_club_pending_subscription_purchase_keys';

  static Future<String> _pendingPurchaseKey(String code) async {
    final raw = await _storage.read(key: _pendingPurchaseKeysStorage);
    final pending = <String, dynamic>{};
    if (raw != null) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) pending.addAll(decoded);
      } on FormatException {
        // Replace malformed local retry metadata with a fresh key.
      }
    }
    final existing = pending[code];
    if (existing is String &&
        existing.length >= 8 && existing.length <= 100 &&
        existing.codeUnits.every((unit) =>
            (unit >= 48 && unit <= 57) ||
            (unit >= 65 && unit <= 90) ||
            (unit >= 97 && unit <= 122) ||
            unit == 46 || unit == 58 || unit == 95 || unit == 45)) {
      return existing;
    }
    final random = Random.secure();
    final key = base64UrlEncode(
      List<int>.generate(24, (_) => random.nextInt(256)),
    ).replaceAll('=', '');
    pending[code] = key;
    await _storage.write(key: _pendingPurchaseKeysStorage, value: jsonEncode(pending));
    return key;
  }

  static Future<void> _clearPendingPurchaseKey(String code, String key) async {
    final raw = await _storage.read(key: _pendingPurchaseKeysStorage);
    if (raw == null) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic> || decoded[code] != key) return;
      decoded.remove(code);
      if (decoded.isEmpty) {
        await _storage.delete(key: _pendingPurchaseKeysStorage);
      } else {
        await _storage.write(key: _pendingPurchaseKeysStorage, value: jsonEncode(decoded));
      }
    } on FormatException {
      await _storage.delete(key: _pendingPurchaseKeysStorage);
    }
  }

  static Future<Map<String, dynamic>> activate(String code) async {
    final key = await _pendingPurchaseKey(code);
    final result = await _request(
      '/api/v1/subscriptions/activate',
      body: {'planCode': code, 'idempotencyKey': key},
    );
    await _clearPendingPurchaseKey(code, key);
    return result;
  }
}
