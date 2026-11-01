import 'dart:async';
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'services/notifications_service.dart';
import 'services/match_service.dart';
import 'online_match_screen.dart';

String localizedNotificationTitle(Map<String, dynamic> item, bool isEnglish) {
  final data = item['data'] is Map
      ? Map<String, dynamic>.from(item['data'] as Map)
      : <String, dynamic>{};
  if (data.containsKey('inviteId')) {
    return isEnglish ? 'Backgammon invitation' : 'دعوت به تخته‌نرد';
  }
  switch (item['type']?.toString()) {
    case 'friend_request':
      return isEnglish ? 'New friend request' : 'درخواست دوستی جدید';
    case 'friend_accepted':
      final established = item['title']?.toString() == 'دوستی برقرار شد';
      if (isEnglish) return established ? 'Friend added' : 'Friend request accepted';
      return established ? 'دوستی برقرار شد' : 'درخواست دوستی پذیرفته شد';
    default:
      return item['title']?.toString() ?? (isEnglish ? 'Notification' : 'اعلان');
  }
}

String localizedNotificationBody(Map<String, dynamic> item, bool isEnglish) {
  final data = item['data'] is Map
      ? Map<String, dynamic>.from(item['data'] as Map)
      : <String, dynamic>{};
  if (data.containsKey('inviteId')) {
    return isEnglish
        ? 'A friend invited you to a backgammon match. Accept within 30 seconds to join.'
        : 'دوست شما را به مسابقه تخته‌نرد دعوت کرده است. برای ورود، تا ۳۰ ثانیه دعوت را بپذیرید.';
  }
  switch (item['type']?.toString()) {
    case 'friend_request':
      return isEnglish
          ? 'A user sent you a friend request.'
          : 'یک کاربر برای شما درخواست دوستی فرستاده است.';
    case 'friend_accepted':
      return isEnglish
          ? 'Your friend request was accepted.'
          : 'درخواست دوستی شما پذیرفته شد.';
    default:
      return item['body']?.toString() ?? '';
  }
}

class NotificationDetailsDialog extends StatelessWidget {
  const NotificationDetailsDialog({
    super.key,
    required this.title,
    required this.body,
    required this.closeLabel,
  });

  final String title;
  final String body;
  final String closeLabel;

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: SelectableText(body),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(closeLabel),
          ),
        ],
      );
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Timer? _inviteExpiryTimer;
  Timer? _notificationPoller;
  bool _refreshing = false;

  int get _unread => _items.where((item) => item['readAt'] == null).length;

  String _localizedTitle(Map<String, dynamic> item, bool isEnglish) =>
      localizedNotificationTitle(item, isEnglish);

  String _localizedBody(Map<String, dynamic> item, bool isEnglish) =>
      localizedNotificationBody(item, isEnglish);

  @override
  void initState() {
    super.initState();
    _refresh();
    // Keep this page live while it is open so invitations sent after entry
    // appear before their ten-second lifetime ends.
    _notificationPoller = Timer.periodic(
      const Duration(milliseconds: 500),
      (_) => _refresh(silent: true),
    );
  }

  @override
  void dispose() {
    _notificationPoller?.cancel();
    _inviteExpiryTimer?.cancel();
    super.dispose();
  }

  void _scheduleInviteExpiry() {
    _inviteExpiryTimer?.cancel();
    DateTime? nextExpiry;
    for (final item in _items) {
      final data = item['data'];
      if (data is! Map || !data.containsKey('inviteId')) continue;
      final createdAt = DateTime.tryParse(item['createdAt']?.toString() ?? '');
      if (createdAt == null) continue;
      final expiresAt = createdAt.add(const Duration(seconds: 30));
      if (nextExpiry == null || expiresAt.isBefore(nextExpiry)) nextExpiry = expiresAt;
    }
    if (nextExpiry == null) return;
    final remaining = nextExpiry.difference(DateTime.now());
    _inviteExpiryTimer = Timer(remaining.isNegative ? Duration.zero : remaining, () {
      if (mounted) _refresh(silent: true);
    });
  }

  Future<void> _refresh({bool silent = false}) async {
    if (_refreshing) return;
    _refreshing = true;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await NotificationsService.list();
      if (mounted) {
        setState(() => _items = items);
        _scheduleInviteExpiry();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = appError(context, error));
      }
    } finally {
      _refreshing = false;
      if (mounted && !silent) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _openNotification(Map<String, dynamic> item) async {
    if (_busy) return;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
        child: NotificationDetailsDialog(
          title: _localizedTitle(item, isEnglish),
          body: _localizedBody(item, isEnglish),
          closeLabel: appText(context, 'بستن اعلان', 'Close notification'),
        ),
      ),
    );
    if (mounted) await _markRead(item);
  }

  Future<void> _respondToInvite(Map<String, dynamic> item, {required bool accept}) async {
    if (_busy) return;
    final data = item['data'] is Map
        ? Map<String, dynamic>.from(item['data'] as Map)
        : <String, dynamic>{};
    final inviteId = data['inviteId']?.toString();
    if (inviteId == null || inviteId.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      final response = await MatchService.respondToInvite(inviteId, accept: accept);
      if (!mounted) return;
      setState(() {
        _items.removeWhere((entry) => entry['id']?.toString() == item['id']?.toString());
      });
      _scheduleInviteExpiry();
      if (accept && response['match'] is Map) {
        final match = Map<String, dynamic>.from(response['match'] as Map);
        await Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => OnlineMatchScreen(match: match),
        ));
      }
      await _refresh(silent: true);
    } catch (error) {
      if (mounted) {
        setState(() => _error = appError(context, error));
        await _refresh(silent: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markAllRead() async {
    if (_busy || _unread == 0) return;
    setState(() => _busy = true);
    try {
      await NotificationsService.markAllRead();
      if (mounted) {
        setState(() {
          _items = _items
              .map((item) => {...item, 'readAt': item['readAt'] ?? DateTime.now().toIso8601String()})
              .toList();
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = appError(context, error));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _deleteAll() async {
    if (_busy || _items.isEmpty) return;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(context, 'همه اعلان‌ها پاک شوند؟', 'Delete all notifications?')),
        content: Text(isEnglish
            ? 'This action cannot be undone.'
            : appText(context, 'این کار قابل بازگشت نیست.', 'This action cannot be undone.')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(appText(context, 'انصراف', 'Cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(appText(context, 'پاک کردن همه', 'Delete all')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await NotificationsService.deleteAll();
      if (mounted) {
        setState(() => _items = []);
        _scheduleInviteExpiry();
      }
    } catch (error) {
      if (mounted) setState(() => _error = appError(context, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (_busy || item['readAt'] != null) return;
    setState(() => _busy = true);
    try {
      final cleared = await NotificationsService.markRead(item['id'].toString());
      if (mounted) {
        setState(() {
          final id = item['id'].toString();
          _items = cleared
              ? _items.where((entry) => entry['id'].toString() != id).toList()
              : _items.map((entry) => entry['id'].toString() == id
                  ? {...entry, 'readAt': DateTime.now().toIso8601String()}
                  : entry).toList();
        });
        _scheduleInviteExpiry();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = appError(context, error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl,
        child: Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: Text('${appText(context, "اعلان‌ها", "Notifications")}${_unread > 0 ? " ($_unread)" : ""}'),
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            foregroundColor: Theme.of(context).colorScheme.primary,
            actions: [
              IconButton(
                onPressed: _loading ? null : _refresh,
                icon: const Icon(Icons.refresh),
                tooltip: appText(context, 'به‌روزرسانی', 'Refresh'),
              ),
            ],
          ),
          body: SafeArea(
            child: Column(
              children: [
                if (_unread > 0 || _items.isNotEmpty)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Wrap(
                      spacing: 8,
                      children: [
                        if (_unread > 0) TextButton.icon(
                          onPressed: _busy ? null : _markAllRead,
                          icon: const Icon(Icons.done_all),
                          label: Text(appText(context, 'خواندن همه', 'Mark all read')),
                          style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.primary),
                        ),
                        if (_items.isNotEmpty) TextButton.icon(
                          onPressed: _busy ? null : _deleteAll,
                          icon: const Icon(Icons.delete_sweep_outlined),
                          label: Text(appText(context, 'پاک کردن همه', 'Delete all')),
                          style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
                        ),
                      ],
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(appError(context, _error),
                        style: const TextStyle(color: Colors.redAccent)),
                  ),
                Expanded(
                  child: _loading
                      ? Center(
                          child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary))
                      : _items.isEmpty
                          ? Center(
                              child: Text(appText(context, 'فعلاً اعلانی ندارید.', 'No notifications yet.'),
                                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))))
                          : ListView.builder(
                              padding: const EdgeInsets.all(14),
                              itemCount: _items.length,
                              itemBuilder: (context, index) {
                                final item = _items[index];
                                final unread = item['readAt'] == null;
                                final data = item['data'] is Map
                                    ? Map<String, dynamic>.from(item['data'] as Map)
                                    : <String, dynamic>{};
                                final isInvite = data.containsKey('inviteId');
                                final isEnglish = Localizations.localeOf(context).languageCode == 'en';
                                return Card(
                                  color: unread
                                      ? Theme.of(context).colorScheme.surfaceContainerHighest
                                      : Theme.of(context).colorScheme.surface,
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(vertical: 4),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.stretch,
                                      children: [
                                        ListTile(
                                          onTap: _busy ? null : () => _openNotification(item),
                                          leading: Icon(
                                            unread
                                                ? Icons.notifications_active_outlined
                                                : Icons.notifications_none_rounded,
                                            color: Theme.of(context).colorScheme.primary,
                                          ),
                                          title: Text(
                                            _localizedTitle(item, isEnglish),
                                            style: TextStyle(
                                              color: Theme.of(context).colorScheme.onSurface,
                                              fontWeight: unread ? FontWeight.bold : FontWeight.normal,
                                            ),
                                          ),
                                          subtitle: Padding(
                                            padding: const EdgeInsets.only(top: 5),
                                            child: Text(
                                              _localizedBody(item, isEnglish),
                                              style: TextStyle(
                                                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                                                height: 1.5,
                                              ),
                                            ),
                                          ),
                                          trailing: unread
                                              ? Icon(Icons.circle, color: Theme.of(context).colorScheme.primary, size: 9)
                                              : Icon(Icons.check, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
                                        ),
                                        if (isInvite)
                                          Padding(
                                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                                            child: Row(
                                              children: [
                                                Expanded(
                                                  child: OutlinedButton(
                                                    onPressed: _busy ? null : () => _respondToInvite(item, accept: false),
                                                    child: Text(appText(context, 'رد دعوت', 'Decline invitation')),
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                Expanded(
                                                  child: FilledButton(
                                                    onPressed: _busy ? null : () => _respondToInvite(item, accept: true),
                                                    child: Text(appText(context, 'پذیرش دعوت', 'Accept invitation')),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                ),
              ],
            ),
          ),
        ),
      );
}
