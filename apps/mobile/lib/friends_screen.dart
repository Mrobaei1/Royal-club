import 'package:flutter/material.dart';
import 'services/friends_service.dart';

const _friendsGold = Color(0xFFD8B45A);
const _friendsNavy = Color(0xFF10182B);
const _friendsPanel = Color(0xFF17243A);

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  final TextEditingController _username = TextEditingController();
  Map<String, dynamic> _data = {};
  List<Map<String, dynamic>> _results = [];
  bool _busy = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  @override
  void dispose() {
    _username.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) {
        setState(() {
          _message = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() => _run(() async {
        final data = await FriendsService.list();
        if (mounted) setState(() => _data = data);
      });

  Future<void> _search() => _run(() async {
        final query = _username.text.trim().replaceFirst(RegExp(r'^@'), '');
        if (query.isEmpty) {
          setState(() {
            _results = [];
            _message = 'نام کاربری را وارد کنید.';
          });
          return;
        }
        final results = await FriendsService.searchByUsername(query);
        if (mounted) {
          setState(() {
            _results = results;
            _message = results.isEmpty ? 'این نام کاربری پیدا نشد.' : null;
          });
        }
      });

  Future<void> _sendRequest(String id) => _run(() async {
        if (!RegExp(r'^[1-9]\d*$').hasMatch(id)) {
          throw Exception('شناسه کاربر معتبر نیست. لطفاً دوباره نام کاربری را جست‌وجو کنید.');
        }
        await FriendsService.requestFriend(id);
        if (!mounted) return;
        setState(() {
          _results.removeWhere((user) => user['id'].toString() == id);
          _message = 'درخواست دوستی ارسال شد.';
        });
        // Refresh is best-effort: a failed refresh must not hide a successful request.
        try {
          final data = await FriendsService.list();
          if (mounted) setState(() => _data = data);
        } catch (_) {}
      });

  Future<void> _accept(String id) => _run(() async {
        await FriendsService.accept(id);
        final data = await FriendsService.list();
        if (mounted) {
          setState(() {
            _data = data;
            _message = 'درخواست پذیرفته شد.';
          });
        }
      });

  Future<void> _remove(String id) => _run(() async {
        await FriendsService.remove(id);
        final data = await FriendsService.list();
        if (mounted) {
          setState(() {
            _data = data;
            _message = 'رابطه حذف شد.';
          });
        }
      });

  Widget _sectionTitle(String title, int count) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 8),
        child: Row(children: [
          Expanded(
            child: Text(title,
                style: const TextStyle(
                    color: _friendsGold,
                    fontSize: 17,
                    fontWeight: FontWeight.bold)),
          ),
          Text('$count', style: const TextStyle(color: Colors.white60)),
        ]),
      );

  Widget _userTile(
    Map<String, dynamic> user, {
    Widget? trailing,
    String? titleOverride,
    String? subtitleOverride,
  }) {
    final username = user['username']?.toString().trim() ?? '';
    final fullName = user['fullName']?.toString().trim() ?? '';
    final title = titleOverride ??
        (fullName.isNotEmpty ? fullName : (username.isNotEmpty ? '@$username' : 'کاربر'));
    final subtitle = subtitleOverride ??
        (username.isNotEmpty ? '@$username' : (user['email']?.toString() ?? ''));
    return Card(
      color: _friendsPanel,
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Color(0xFF283750),
          child: Icon(Icons.person_outline, color: _friendsGold),
        ),
        title: Text(title, style: const TextStyle(color: Colors.white)),
        subtitle: subtitle.isEmpty
            ? null
            : Text(subtitle, style: const TextStyle(color: Colors.white60)),
        trailing: trailing,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final friends = (_data['friends'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final incoming = (_data['incomingRequests'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final outgoing = (_data['outgoingRequests'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: _friendsNavy,
        appBar: AppBar(
          title: const Text('دوستان'),
          backgroundColor: _friendsNavy,
          foregroundColor: _friendsGold,
          actions: [
            IconButton(
              onPressed: _busy ? null : _refresh,
              icon: const Icon(Icons.refresh),
              tooltip: 'به‌روزرسانی',
            ),
          ],
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('افزودن دوست',
                  style: TextStyle(
                      color: _friendsGold,
                      fontSize: 21,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text(
                'نام کاربری دقیق دوستتان را وارد کنید؛ نیازی به دانستن ایمیل او نیست.',
                style: TextStyle(color: Colors.white70, height: 1.6),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _username,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(
                  labelText: 'نام کاربری',
                  hintText: 'royal_player7',
                  prefixIcon: Icon(Icons.alternate_email),
                  border: OutlineInputBorder(),
                ),
                onSubmitted: (_) => _search(),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _busy ? null : _search,
                icon: const Icon(Icons.search),
                label: const Text('جست‌وجو'),
                style: FilledButton.styleFrom(
                    backgroundColor: _friendsGold,
                    foregroundColor: _friendsNavy),
              ),
              if (_results.isNotEmpty) ...[
                const SizedBox(height: 8),
                ..._results.map((user) => _userTile(
                      user,
                      titleOverride: '@${user['username'] ?? ''}',
                      subtitleOverride: user['fullName']?.toString() ?? '',
                      trailing: IconButton(
                        onPressed: _busy
                            ? null
                            : () => _sendRequest(user['id'].toString()),
                        icon: const Icon(Icons.person_add_alt_1,
                            color: _friendsGold),
                        tooltip: 'ارسال درخواست',
                      ),
                    )),
              ],
              if (_busy)
                const Padding(
                  padding: EdgeInsets.all(12),
                  child: Center(
                      child: CircularProgressIndicator(color: _friendsGold)),
                ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_message!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: _friendsGold)),
                ),
              _sectionTitle('درخواست‌های دریافتی', incoming.length),
              if (incoming.isEmpty)
                const Text('درخواست تازه‌ای ندارید.',
                    style: TextStyle(color: Colors.white54)),
              ...incoming.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _accept(user['userId'].toString()),
                      icon: const Icon(Icons.check_circle_outline,
                          color: _friendsGold),
                      tooltip: 'پذیرش درخواست',
                    ),
                  )),
              _sectionTitle('دوستان من', friends.length),
              if (friends.isEmpty)
                const Text('هنوز دوستی اضافه نکرده‌اید.',
                    style: TextStyle(color: Colors.white54)),
              ...friends.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _remove(user['userId'].toString()),
                      icon: const Icon(Icons.person_remove_alt_1,
                          color: Colors.white60),
                      tooltip: 'حذف دوست',
                    ),
                  )),
              _sectionTitle('درخواست‌های ارسالی', outgoing.length),
              if (outgoing.isEmpty)
                const Text('درخواست در انتظاری ندارید.',
                    style: TextStyle(color: Colors.white54)),
              ...outgoing.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _remove(user['userId'].toString()),
                      icon: const Icon(Icons.close, color: Colors.white60),
                      tooltip: 'لغو درخواست',
                    ),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
