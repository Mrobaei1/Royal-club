import 'package:flutter/foundation.dart';

/// Shared app-level signals used to defer incoming invitations during live play.
class MatchActivityState {
  MatchActivityState._();

  static final ValueNotifier<bool> authenticated = ValueNotifier<bool>(false);
  static final ValueNotifier<bool> activelyPlaying = ValueNotifier<bool>(false);

  static void setAuthenticated(bool value) {
    authenticated.value = value;
    if (!value) activelyPlaying.value = false;
  }

  static void setActivelyPlaying(bool value) {
    activelyPlaying.value = value;
  }
}
