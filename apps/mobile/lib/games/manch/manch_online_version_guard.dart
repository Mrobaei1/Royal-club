/// Returns whether a server response is safe to apply to the current UI state.
/// A lower version is stale and must never overwrite a newer snapshot.
bool shouldAcceptManchOnlineVersion({
  required int incomingVersion,
  required int currentVersion,
}) => incomingVersion >= currentVersion;
