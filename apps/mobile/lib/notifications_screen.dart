import 'package:flutter/material.dart';
import 'services/notifications_service.dart';

const _noticeGold = Color(0xFFD8B45A);
const _noticePanel = Color(0xFF17243A);

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

  int get _unread => _items.where((item) => item['readAt'] == null).length;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await NotificationsService.list();
      if (mounted) {
        setState(() => _items = items);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) {
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
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
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
        title: Text(isEnglish ? 'Delete all notifications?' : 'همه اعلان‌ها پاک شوند؟'),
        content: Text(isEnglish
            ? 'This action cannot be undone.'
            : 'این کار قابل بازگشت نیست.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(isEnglish ? 'Cancel' : 'انصراف'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(isEnglish ? 'Delete all' : 'پاک کردن همه'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await NotificationsService.deleteAll();
      if (mounted) setState(() => _items = []);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (_busy || item['readAt'] != null) return;
    setState(() => _busy = true);
    try {
      await NotificationsService.markRead(item['id'].toString());
      if (mounted) {
        setState(() {
          final id = item['id'].toString();
          _items = _items.map((entry) => entry['id'].toString() == id
              ? {...entry, 'readAt': DateTime.now().toIso8601String()}
              : entry).toList();
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
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
            title: Text(Localizations.localeOf(context).languageCode == 'en' ? 'Notifications${_unread > 0 ? ' ($_unread)' : ''}' : 'اعلان‌ها${_unread > 0 ? ' ($_unread)' : ''}'),
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            foregroundColor: Theme.of(context).colorScheme.primary,
            actions: [
              IconButton(
                onPressed: _loading ? null : _refresh,
                icon: const Icon(Icons.refresh),
                tooltip: 'به‌روزرسانی',
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
                          label: Text(Localizations.localeOf(context).languageCode == 'en' ? 'Mark all read' : 'خواندن همه'),
                          style: TextButton.styleFrom(foregroundColor: _noticeGold),
                        ),
                        if (_items.isNotEmpty) TextButton.icon(
                          onPressed: _busy ? null : _deleteAll,
                          icon: const Icon(Icons.delete_sweep_outlined),
                          label: Text(Localizations.localeOf(context).languageCode == 'en' ? 'Delete all' : 'پاک کردن همه'),
                          style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
                        ),
                      ],
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(_error!,
                        style: const TextStyle(color: Colors.redAccent)),
                  ),
                Expanded(
                  child: _loading
                      ? const Center(
                          child: CircularProgressIndicator(color: _noticeGold))
                      : _items.isEmpty
                          ? const Center(
                              child: Text(Localizations.localeOf(context).languageCode == 'en' ? 'No notifications yet.' : 'فعلاً اعلانی ندارید.',
                                  style: TextStyle(color: Colors.white70)))
                          : ListView.builder(
                              padding: const EdgeInsets.all(14),
                              itemCount: _items.length,
                              itemBuilder: (context, index) {
                                final item = _items[index];
                                final unread = item['readAt'] == null;
                                return Card(
                                  color: unread
                                      ? const Color(0xFF26334A)
                                      : _noticePanel,
                                  child: ListTile(
                                    onTap: _busy ? null : () => _markRead(item),
                                    leading: Icon(
                                      unread
                                          ? Icons.notifications_active_outlined
                                          : Icons.notifications_none_rounded,
                                      color: _noticeGold,
                                    ),
                                    title: Text(
                                      item['title']?.toString() ?? 'اعلان',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: unread
                                            ? FontWeight.bold
                                            : FontWeight.normal,
                                      ),
                                    ),
                                    subtitle: Padding(
                                      padding: const EdgeInsets.only(top: 5),
                                      child: Text(
                                        item['body']?.toString() ?? '',
                                        style: const TextStyle(
                                            color: Colors.white70, height: 1.5),
                                      ),
                                    ),
                                    trailing: unread
                                        ? const Icon(Icons.circle,
                                            color: _noticeGold, size: 9)
                                        : const Icon(Icons.check,
                                            color: Colors.white38),
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
