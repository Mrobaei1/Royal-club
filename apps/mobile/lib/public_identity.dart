/// Public-facing labels must be derived only from the public username field.
/// Legacy rows with missing/blank usernames use a neutral localized fallback;
/// private full-name, email and phone fields are intentionally not accepted here.
String? normalizedPublicUsername(Object? value) {
  if (value is! String) return null;
  final username = value.trim();
  return username.isEmpty ? null : username;
}

String publicUsernameLabel(
  Object? value, {
  required String fallback,
  bool prefixAt = true,
}) {
  final username = normalizedPublicUsername(value);
  if (username == null) return fallback;
  return prefixAt ? '@$username' : username;
}
