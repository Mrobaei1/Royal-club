import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';
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
  final _username = TextEditingController();
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
        setState(() => _message = error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refresh() => _run(() async {
        final data = await FriendsService.list();
        if (mounted) {
          setState(() => _data = data);
        }
      });

  Future<void> _search() => _run(() async {
        final results = await FriendsService.searchByUsername(_username.text);
        if (mounted) {
          setState(() {
            _results = results;
            _message = results.isEmpty ? AppLocalizations.of(context)!.usernameNotFound : null;
          });
        }
      });

  Future<void> _sendRequest(String id) => _run(() async {
        await FriendsService.requestFriend(id);
        _username.clear();
        if (mounted) {
          setState(() => _results = []);
        }
        final data = await FriendsService.list();
        if (mounted) {
          setState(() {
            _data = data;
            _message = AppLocalizations.of(context)!.friendRequestSent;
          });
        }
      });

  Future<void> _accept(String id) => _run(() async {
        await FriendsService.accept(id);
        final data = await FriendsService.list();
        if (mounted) {
          setState(() {
            _data = data;
            _message = AppLocalizations.of(context)!.requestAccepted;
          });
        }
      });

  Future<void> _remove(String id) => _run(() async {
        await FriendsService.remove(id);
        final data = await FriendsService.list();
        if (mounted) {
          setState(() {
            _data = data;
            _message = AppLocalizations.of(context)!.relationshipRemoved;
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
  }) {
    final name = user['name']?.toString().trim();
    final email = user['email']?.toString() ?? '';
    return Card(
      color: _friendsPanel,
      child: ListTile(
        leading: const CircleAvatar(
          backgroundColor: Color(0xFF283750),
          child: Icon(Icons.person_outline, color: _friendsGold),
        ),
        title: Text(name == null || name.isEmpty ? email : name,
            style: const TextStyle(color: Colors.white)),
        subtitle: Text(email, style: const TextStyle(color: Colors.white60)),
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
      textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        backgroundColor: _friendsNavy,
        appBar: AppBar(
          title: Text(AppLocalizations.of(context)!.friendsTitle),
          backgroundColor: _friendsNavy,
          foregroundColor: _friendsGold,
          actions: [
            IconButton(
              onPressed: _busy ? null : _refresh,
              icon: const Icon(Icons.refresh),
              tooltip: AppLocalizations.of(context)!.refresh,
            ),
          ],
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(AppLocalizations.of(context)!.addFriend,
                  style: TextStyle(
                      color: _friendsGold,
                      fontSize: 21,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text(
                AppLocalizations.of(context)!.friendInstructions,
                style: TextStyle(color: Colors.white70, height: 1.6),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _username,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(
                  labelText: AppLocalizations.of(context)!.username,
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
                label: Text(AppLocalizations.of(context)!.search),
                style: FilledButton.styleFrom(
                    backgroundColor: _friendsGold,
                    foregroundColor: _friendsNavy),
              ),
              if (_results.isNotEmpty) ...[
                const SizedBox(height: 8),
                ..._results.map((user) => _userTile(
                      {
                        ...user,
                        'name': user['fullName'] ?? user['name'],
                      },
                      trailing: IconButton(
                        onPressed: _busy
                            ? null
                            : () => _sendRequest(user['id'].toString()),
                        icon: const Icon(Icons.person_add_alt_1,
                            color: _friendsGold),
                        tooltip: AppLocalizations.of(context)!.sendRequest,
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
              _sectionTitle(AppLocalizations.of(context)!.incomingRequests, incoming.length),
              if (incoming.isEmpty)
                Text(AppLocalizations.of(context)!.noIncomingRequests,
                    style: TextStyle(color: Colors.white54)),
              ...incoming.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _accept(user['userId'].toString()),
                      icon: const Icon(Icons.check_circle_outline,
                          color: _friendsGold),
                      tooltip: AppLocalizations.of(context)!.acceptRequest,
                    ),
                  )),
              _sectionTitle(AppLocalizations.of(context)!.myFriends, friends.length),
              if (friends.isEmpty)
                Text(AppLocalizations.of(context)!.noFriendsYet,
                    style: TextStyle(color: Colors.white54)),
              ...friends.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _remove(user['userId'].toString()),
                      icon: const Icon(Icons.person_remove_alt_1,
                          color: Colors.white60),
                      tooltip: AppLocalizations.of(context)!.removeFriend,
                    ),
                  )),
              _sectionTitle(AppLocalizations.of(context)!.outgoingRequests, outgoing.length),
              if (outgoing.isEmpty)
                Text(AppLocalizations.of(context)!.noOutgoingRequests,
                    style: TextStyle(color: Colors.white54)),
              ...outgoing.map((user) => _userTile(
                    user,
                    trailing: IconButton(
                      onPressed: _busy
                          ? null
                          : () => _remove(user['userId'].toString()),
                      icon: const Icon(Icons.close, color: Colors.white60),
                      tooltip: AppLocalizations.of(context)!.cancelRequest,
                    ),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
