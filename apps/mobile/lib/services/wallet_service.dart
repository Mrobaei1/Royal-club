import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
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

  static Future<Map<String, dynamic>> _request(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    final requestHeaders = headers ?? await _headers();
    late final http.Response response;
    try {
      response = body == null
          ? await http.get(ApiTransport.uri(path), headers: requestHeaders).timeout(_requestTimeout)
          : await http.post(ApiTransport.uri(path), headers: requestHeaders, body: jsonEncode(body)).timeout(_requestTimeout);
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

  static final Map<String, Future<Map<String, dynamic>>> _purchaseFlights = {};

  /// Coalesces simultaneous activation taps for the same account and plan.
  /// Backend idempotency remains authoritative across retries and devices.
  @visibleForTesting
  static Future<Map<String, dynamic>> coalescePurchaseRequest(
    String accountId,
    String code,
    Future<Map<String, dynamic>> Function() operation,
  ) {
    final flightKey = pendingPurchaseStorageKey(accountId, code);
    final existing = _purchaseFlights[flightKey];
    if (existing != null) return existing;
    late final Future<Map<String, dynamic>> shared;
    shared = Future<Map<String, dynamic>>.sync(operation).whenComplete(() {
      if (identical(_purchaseFlights[flightKey], shared)) {
        _purchaseFlights.remove(flightKey);
      }
    });
    _purchaseFlights[flightKey] = shared;
    return shared;
  }


  /// Extracts the stable account subject from the signed-in JWT for local
  /// storage partitioning only. Authorization is always enforced by the API.
  @visibleForTesting
  static String accountIdFromAccessToken(String token) {
    final parts = token.split('.');
    if (parts.length != 3 || parts[1].isEmpty) {
      throw const FormatException('Invalid access token.');
    }
    final payloadBytes = base64Url.decode(base64Url.normalize(parts[1]));
    final payload = jsonDecode(utf8.decode(payloadBytes));
    if (payload is! Map<String, dynamic>) {
      throw const FormatException('Invalid access token payload.');
    }
    final subject = payload['sub']?.toString().trim();
    if (subject == null || subject.isEmpty) {
      throw const FormatException('Access token has no account subject.');
    }
    return subject;
  }

  @visibleForTesting
  static String pendingPurchaseStorageKey(String accountId, String code) =>
      '$accountId:$code';

  static Future<String> _pendingPurchaseKey(String code, String accountId) async {
    final storageKey = pendingPurchaseStorageKey(accountId, code);
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
    final existing = pending[storageKey];
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
    pending[storageKey] = key;
    await _storage.write(key: _pendingPurchaseKeysStorage, value: jsonEncode(pending));
    return key;
  }

  static Future<void> _clearPendingPurchaseKey(String code, String accountId, String key) async {
    final storageKey = pendingPurchaseStorageKey(accountId, code);
    final raw = await _storage.read(key: _pendingPurchaseKeysStorage);
    if (raw == null) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic> || decoded[storageKey] != key) return;
      decoded.remove(storageKey);
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
    // Bind identity, idempotency key and HTTP authorization to the same token
    // so an account switch cannot cross-consume another user's pending key.
    final token = await _storage.read(key: 'royal_club_token');
    if (token == null || token.isEmpty) {
      throw Exception('ابتدا وارد حساب شوید.');
    }
    final accountId = accountIdFromAccessToken(token);
    return coalescePurchaseRequest(accountId, code, () async {
      final key = await _pendingPurchaseKey(code, accountId);
      final result = await _request(
        '/api/v1/subscriptions/activate',
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: {'planCode': code, 'idempotencyKey': key},
      );
      await _clearPendingPurchaseKey(code, accountId, key);
      return result;
    });
  }
}
