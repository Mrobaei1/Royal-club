/// The single source of truth for the public Royal Club API origin.
///
/// The build-time value is a bootstrap fallback. A future signed-network-config
/// verifier may call [setVerifiedOrigin] only after validating the complete
/// signed payload, schema, expiry and monotonic configuration version.
class ApiTransport {
  ApiTransport._();

  static const String buildTimeOrigin =
      String.fromEnvironment('API_BASE_URL', defaultValue: '');

  static String? _verifiedRuntimeOrigin;

  static String get baseUrl =>
      _verifiedRuntimeOrigin ?? _normalizeOriginOrEmpty(buildTimeOrigin);

  /// Resolves a relative API path against the one active public API origin.
  static Uri uri(String path) {
    ensureConfigured();
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalizedPath');
  }

  /// Must only be called by the future signed configuration verifier after
  /// signature, schema, expiry and monotonic-version checks have succeeded.
  static void setVerifiedOrigin(String origin) {
    _verifiedRuntimeOrigin = _normalizeOrigin(origin);
  }

  /// Validates the active origin or an explicitly supplied candidate.
  static void ensureConfigured({String? configuredBaseUrl}) {
    final candidate = (configuredBaseUrl ?? baseUrl).trim();
    if (candidate.isEmpty) {
      throw Exception(
        'سرور Royal Club هنوز تنظیم نشده است. ابتدا سرویس API را راه‌اندازی کنید.',
      );
    }
    _normalizeOrigin(candidate);
  }

  static String _normalizeOriginOrEmpty(String value) {
    if (value.trim().isEmpty) return '';
    return _normalizeOrigin(value);
  }

  static String _normalizeOrigin(String value) {
    final trimmed = value.trim();
    final uri = Uri.tryParse(trimmed);
    if (uri == null || uri.host.isEmpty || uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty || uri.fragment.isNotEmpty ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      throw ArgumentError.value(value, 'origin', 'Expected a public API origin without credentials, path, query or fragment.');
    }

    final isLocalDevelopmentHost = const {
      'localhost',
      '127.0.0.1',
      '10.0.2.2',
      '::1',
    }.contains(uri.host.toLowerCase());
    final isHttps = uri.scheme.toLowerCase() == 'https';
    final isLocalHttp = uri.scheme.toLowerCase() == 'http' && isLocalDevelopmentHost;
    if (!isHttps && !isLocalHttp) {
      throw ArgumentError.value(value, 'origin', 'HTTPS is required except for local development hosts.');
    }

    return uri.replace(path: '', query: null, fragment: null).toString().replaceFirst(RegExp(r'/+$'), '');
  }

  /// Test-only reset. Production code must never clear a verified origin as
  /// an incident-recovery shortcut; use a signed, higher-version config instead.
  static void resetForTesting() {
    _verifiedRuntimeOrigin = null;
  }
}
