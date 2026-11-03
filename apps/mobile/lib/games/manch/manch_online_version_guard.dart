/// Parses the server's monotonic Manch state version.
/// Missing, fractional, non-finite and negative values are invalid: callers
/// must not invent a version for a response that cannot be ordered safely.
int? parseManchOnlineStateVersion(Object? raw) {
  if (raw is! num || !raw.isFinite) return null;
  final version = raw.toInt();
  if (raw != version || version < 0) return null;
  return version;
}

/// Returns whether a server response is safe to apply to the current UI state.
/// A lower version is stale and must never overwrite a newer snapshot.
bool shouldAcceptManchOnlineVersion({
  required int incomingVersion,
  required int currentVersion,
}) => incomingVersion >= currentVersion;
