import 'dart:async';

import 'package:flutter/material.dart';

import 'l10n/app_text.dart';
import 'match_activity_state.dart';
import 'online_match_screen.dart';
import 'services/match_service.dart';

/// Polls the authenticated invitation inbox globally and presents invitations
/// sequentially. Live matches suppress dialogs but do not stop queue collection.
class IncomingMatchInvites extends StatefulWidget {
  const IncomingMatchInvites({super.key, required this.child});

  final Widget child;

  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  @override
  State<IncomingMatchInvites> createState() => _IncomingMatchInvitesState();
}

class _IncomingMatchInvitesState extends State<IncomingMatchInvites> {
  Timer? _poller;
  bool _refreshing = false;
  bool _showing = false;
  final Map<String, Map<String, dynamic>> _queued = <String, Map<String, dynamic>>{};
  final Set<String> _handled = <String>{};

  @override
  void initState() {
    super.initState();
    MatchActivityState.authenticated.addListener(_onEligibilityChanged);
    MatchActivityState.activelyPlaying.addListener(_onEligibilityChanged);
    _poller = Timer.periodic(const Duration(milliseconds: 500), (_) => _refreshInvites());
    _refreshInvites();
  }

  @override
  void dispose() {
    _poller?.cancel();
    MatchActivityState.authenticated.removeListener(_onEligibilityChanged);
    MatchActivityState.activelyPlaying.removeListener(_onEligibilityChanged);
    super.dispose();
  }

  void _onEligibilityChanged() {
    if (!MatchActivityState.authenticated.value) {
      _queued.clear();
      _handled.clear();
      return;
    }
    if (!MatchActivityState.activelyPlaying.value) _showNextInvite();
  }

  bool _isValid(Map<String, dynamic> invite) {
    final raw = invite['expiresAt']?.toString();
    final expiresAt = raw == null ? null : DateTime.tryParse(raw);
    return expiresAt != null && DateTime.now().isBefore(expiresAt.toLocal());
  }

  Future<void> _refreshInvites() async {
    if (!MatchActivityState.authenticated.value || _refreshing) return;
    _refreshing = true;
    try {
      final invites = await MatchService.pendingInvites();
      for (final invite in invites) {
        final id = invite['id']?.toString();
        if (id == null || id.isEmpty || _handled.contains(id) || !_isValid(invite)) {
          continue;
        }
        _queued.putIfAbsent(id, () => Map<String, dynamic>.from(invite));
      }
      _queued.removeWhere((_, invite) => !_isValid(invite));
      _showNextInvite();
    } catch (_) {
      // A transient network failure leaves the queue intact; the next poll retries.
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _showNextInvite() async {
    if (!mounted ||
        _showing ||
        !MatchActivityState.authenticated.value ||
        MatchActivityState.activelyPlaying.value ||
        _queued.isEmpty) {
      return;
    }

    final ordered = _queued.entries.toList()
      ..sort((a, b) {
        final aDate = DateTime.tryParse(a.value['createdAt']?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = DateTime.tryParse(b.value['createdAt']?.toString() ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        return aDate.compareTo(bDate);
      });

    MapEntry<String, Map<String, dynamic>>? next;
    for (final entry in ordered) {
      if (_isValid(entry.value)) {
        next = entry;
        break;
      }
      _queued.remove(entry.key);
      _handled.add(entry.key);
    }
    if (next == null) return;

    final navigator = IncomingMatchInvites.navigatorKey.currentState;
    final dialogContext = navigator?.overlay?.context;
    if (navigator == null || dialogContext == null) return;

    _showing = true;
    final invite = next.value;
    final remaining = DateTime.parse(invite['expiresAt'].toString())
        .toLocal()
        .difference(DateTime.now());
    final isEnglish = Localizations.localeOf(dialogContext).languageCode == 'en';

    String? result;
    final expiryTimer = Timer(
      remaining.isNegative ? Duration.zero : remaining,
      () {
        if (dialogContext.mounted) {
          Navigator.of(dialogContext, rootNavigator: true).pop('expired');
        }
      },
    );
    try {
      result = await showDialog<String>(
        context: dialogContext,
        useRootNavigator: true,
        barrierDismissible: false,
        builder: (context) => Directionality(
          textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
          child: AlertDialog(
            title: Text(appText(context, 'دعوت بازی تخته‌نرد', 'Backgammon invitation')),
            content: Text(isEnglish
                ? '@${invite['inviterUsername'] ?? 'friend'} invited you to play. The invitation expires in ${remaining.inSeconds.clamp(1, 60)} seconds.'
                : '@${invite['inviterUsername'] ?? 'دوست'} شما را به بازی دعوت کرده است. این دعوت تا ${remaining.inSeconds.clamp(1, 60)} ثانیه دیگر معتبر است.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop('decline'),
                child: Text(appText(context, 'رد دعوت', 'Decline')),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop('accept'),
                child: Text(appText(context, 'پذیرش و ورود', 'Accept & join')),
              ),
            ],
          ),
        ),
      );
    } catch (_) {
      result = 'expired';
    } finally {
      expiryTimer.cancel();
    }

    _queued.remove(next.key);
    _showing = false;

    if (!mounted || !MatchActivityState.authenticated.value) return;
    if (result != 'accept' && result != 'decline') _handled.add(next.key);
    if (result == 'accept' || result == 'decline') {
      try {
        final response = await MatchService.respondToInvite(
          next.key,
          accept: result == 'accept',
        );
        _handled.add(next.key);
        if (result == 'accept' && response['match'] is Map) {
          final match = Map<String, dynamic>.from(response['match'] as Map);
          await IncomingMatchInvites.navigatorKey.currentState?.push(
            MaterialPageRoute<void>(
              builder: (_) => OnlineMatchScreen(match: match),
            ),
          );
        }
      } catch (_) {
        // Leave failed responses eligible for the next poll so the invitation
        // can be retried instead of silently disappearing from the queue.
      }
    }
    if (mounted) {
      await Future<void>.delayed(const Duration(milliseconds: 150));
      _showNextInvite();
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
