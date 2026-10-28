import 'dart:async';
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'services/notifications_service.dart';

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

  int get _unread => _items.where((item) => item['readAt'] == null).length;

  String _localizedTitle(Map<String, dynamic> item, bool isEnglish) {
    final data = item['data'] is Map ? Map<String, dynamic>.from(item['data'] as Map) : <String, dynamic>{};
    if (data.containsKey('inviteId')) return isEnglish ? 'Backgammon invitation' : 'دعوت به تخته‌نرد';
    return item['title']?.toString() ?? (isEnglish ? 'Notification' : 'اعلان');
  }

  String _localizedBody(Map<String, dynamic> item, bool isEnglish) {
    final data = item['data'] is Map ? Map<String, dynamic>.from(item['data'] as Map) : <String, dynamic>{};
    if (data.containsKey('inviteId')) return isEnglish ? 'A friend invited you to a backgammon match. Accept within 10 seconds to join.' : 'دوست شما را به مسابقه تخته‌نرد دعوت کرده است. برای ورود، تا ۱۰ ثانیه دعوت را بپذیرید.';
    return item['body']?.toString() ?? '';
  }

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
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
      final expiresAt = createdAt.add(const Duration(seconds: 10));
      if (nextExpiry == null || expiresAt.isBefore(nextExpiry)) nextExpiry = expiresAt;
    }
    if (nextExpiry == null) return;
    final remaining = nextExpiry.difference(DateTime.now());
    _inviteExpiryTimer = Timer(remaining.isNegative ? Duration.zero : remaining, () {
      if (mounted) _refresh(silent: true);
    });
  }

  Future<void> _refresh({bool silent = false}) async {
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
      if (mounted && !silent) {
        setState(() => _loading = false);
      }
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
                                return Card(
                                  color: unread
                                      ? Theme.of(context).colorScheme.surfaceContainerHighest
                                      : Theme.of(context).colorScheme.surface,
                                  child: ListTile(
                                    onTap: _busy ? null : () => _markRead(item),
                                    leading: Icon(
                                      unread
                                          ? Icons.notifications_active_outlined
                                          : Icons.notifications_none_rounded,
                                      color: Theme.of(context).colorScheme.primary,
                                    ),
                                    title: Text(
                                      _localizedTitle(item, Localizations.localeOf(context).languageCode == 'en'),
                                      style: TextStyle(
                                        color: Theme.of(context).colorScheme.onSurface,
                                        fontWeight: unread
                                            ? FontWeight.bold
                                            : FontWeight.normal,
                                      ),
                                    ),
                                    subtitle: Padding(
                                      padding: const EdgeInsets.only(top: 5),
                                      child: Text(
                                        _localizedBody(item, Localizations.localeOf(context).languageCode == 'en'),
                                        style: TextStyle(
                                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), height: 1.5),
                                      ),
                                    ),
                                    trailing: unread
                                        ? Icon(Icons.circle,
                                            color: Theme.of(context).colorScheme.primary, size: 9)
                                        : Icon(Icons.check,
                                            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
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
