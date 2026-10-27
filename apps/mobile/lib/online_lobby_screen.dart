import 'dart:async';
import 'package:flutter/material.dart';
import 'profile_avatar.dart';
import 'services/match_service.dart';
import 'online_match_screen.dart';
import 'spectator_match_screen.dart';
import 'leaderboard_screen.dart';

const _gold = Color(0xFFD8B45A);
const _navy = Color(0xFF10182B);

class OnlineLobbyScreen extends StatefulWidget {
  const OnlineLobbyScreen({super.key});
  @override
  State<OnlineLobbyScreen> createState() => _OnlineLobbyScreenState();
}

class _OnlineLobbyScreenState extends State<OnlineLobbyScreen> {
  List<Map<String, dynamic>> _matches = [];
  List<Map<String, dynamic>> _history = [];
  List<Map<String, dynamic>> _liveMatches = [];
  List<Map<String, dynamic>> _invites = [];
  Map<String, dynamic>? _created;
  bool _loading = false;
  String? _error;
  Timer? _lobbyPoller;
  Timer? _inviteExpiryTimer;
  bool _silentRefreshing = false;
  final Set<String> _shownInviteIds = <String>{};
  String? _popupInviteId;

  @override
  void initState() {
    super.initState();
    _refresh();
    _lobbyPoller = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _refreshOpenRoomsSilently(),
    );
    _inviteExpiryTimer = Timer.periodic(const Duration(seconds: 1), (_) => _expireStaleInvites());
  }

  @override
  void dispose() {
    _lobbyPoller?.cancel();
    _inviteExpiryTimer?.cancel();
    super.dispose();
  }

  bool _isInviteExpired(Map<String, dynamic> invite) {
    final raw = invite['expiresAt']?.toString();
    final expiry = raw == null ? null : DateTime.tryParse(raw);
    return expiry != null && !DateTime.now().isBefore(expiry.toLocal());
  }

  Future<void> _expireStaleInvites() async {
    final expired = _invites.where(_isInviteExpired).toList();
    if (expired.isEmpty || _silentRefreshing || _loading) return;
    if (mounted) setState(() => _invites.removeWhere(_isInviteExpired));
    // The authenticated endpoint also physically deletes expired rooms and their
    // invitations from the database (the invite table cascades on room deletion).
    await _refreshOpenRoomsSilently();
  }

  Future<void> _showNewInvite(Map<String, dynamic> invite) async {
    final id = invite['id']?.toString();
    if (!mounted || id == null || _popupInviteId != null || !_shownInviteIds.add(id)) return;
    _popupInviteId = id;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final timeout = Timer(const Duration(seconds: 10), () {
      if (mounted && _popupInviteId == id) {
        Navigator.of(context, rootNavigator: true).pop('expired');
      }
    });
    final result = await showDialog<String>(
      context: context,
      barrierDismissible: true,
      builder: (dialogContext) => AlertDialog(
        title: Text(isEnglish ? 'Backgammon invitation' : 'دعوت بازی تخته‌نرد'),
        content: Text(isEnglish
            ? '@${invite['inviterUsername'] ?? 'friend'} invited you to play. This invitation expires in 10 seconds.'
            : '@${invite['inviterUsername'] ?? 'دوست'} شما را به بازی دعوت کرده است. این دعوت تا ۱۰ ثانیه دیگر منقضی می‌شود.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop('decline'), child: Text(isEnglish ? 'Decline' : 'رد دعوت')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop('accept'), child: Text(isEnglish ? 'Accept & join' : 'پذیرش و ورود')),
        ],
      ),
    );
    timeout.cancel();
    _popupInviteId = null;
    if (!mounted) return;
    final matching = _invites.where((item) => item['id']?.toString() == id).toList();
    if ((result == 'accept' || result == 'decline') && matching.isNotEmpty) {
      await _respondToInvite(matching.first, accept: result == 'accept');
    }
  }

  void _notifyNewInvites(List<Map<String, dynamic>> invites, Set<String> previousIds) {
    final fresh = invites.where((invite) {
      final id = invite['id']?.toString();
      return id != null && !previousIds.contains(id) && !_shownInviteIds.contains(id);
    }).toList();
    if (fresh.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future<void>.delayed(const Duration(milliseconds: 250), () {
          if (mounted) _showNewInvite(fresh.first);
        });
      });
    }
  }

  Future<void> _refreshOpenRoomsSilently() async {
    if (_loading || _silentRefreshing) return;
    _silentRefreshing = true;
    try {
      final results = await Future.wait([MatchService.listOpen(), MatchService.listLive(), MatchService.pendingInvites()]);
      if (mounted) {
        final previousIds = _invites.map((invite) => invite['id']?.toString()).whereType<String>().toSet();
        final freshInvites = results[3].where((invite) => !_isInviteExpired(invite)).toList();
        setState(() { _matches = results[0]; _liveMatches = results[1]; _invites = freshInvites; });
        _notifyNewInvites(freshInvites, previousIds);
      }
    } catch (_) {
      // Keep the current room list; the next interval retries automatically.
    } finally {
      _silentRefreshing = false;
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _refresh() => _run(() async {
    final results = await Future.wait([MatchService.listOpen(), MatchService.history(), MatchService.listLive(), MatchService.pendingInvites()]);
    if (mounted) {
      final previousIds = _invites.map((invite) => invite['id']?.toString()).whereType<String>().toSet();
      final freshInvites = results[2].where((invite) => !_isInviteExpired(invite)).toList();
      setState(() { _matches = results[0]; _history = results[1]; _liveMatches = results[2]; _invites = freshInvites; });
      _notifyNewInvites(freshInvites, previousIds);
    }
  });

  Future<String?> _chooseFriendToInvite() async {
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final friends = await MatchService.friends();
    if (!mounted || friends.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(isEnglish ? 'Accept a friend request first, or share the room code.' : 'برای دعوت مستقیم، ابتدا باید دوستی پذیرفته‌شده داشته باشید. می‌توانید کد اتاق را هم به اشتراک بگذارید.')),
        );
      }
      return null;
    }
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
        child: AlertDialog(
          backgroundColor: Theme.of(context).colorScheme.surface,
          title: Text(isEnglish ? 'Invite a friend' : 'دعوت از دوست', style: const TextStyle(color: _gold)),
          content: SizedBox(
            width: 360,
            child: ListView(
              shrinkWrap: true,
              children: friends.map((friend) => ListTile(
                leading: RoyalAvatar(dataUrl: friend['avatarDataUrl']?.toString(), radius: 20),
                title: Text('@${friend['username'] ?? ''}', style: const TextStyle(color: Colors.white)),
                subtitle: Text('@${friend['username'] ?? ''}', style: const TextStyle(color: Colors.white54)),
                onTap: () => Navigator.of(dialogContext).pop(friend['userId'].toString()),
              )).toList(),
            ),
          ),
          actions: [TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: Text(isEnglish ? 'Later' : 'بعداً'))],
        ),
      ),
    );
  }

  Future<void> _create() => _run(() async {
    final match = await MatchService.create();
    if (!mounted) return;
    setState(() => _created = match);
    final friendId = await _chooseFriendToInvite();
    if (friendId != null) await MatchService.inviteFriend(match['id'].toString(), friendId);
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OnlineMatchScreen(match: match),
    ));
    final results = await Future.wait([MatchService.listOpen(), MatchService.pendingInvites()]);
    if (mounted) setState(() { _matches = results[0]; _invites = results[1]; });
  });

  Future<void> _respondToInvite(Map<String, dynamic> invite, {required bool accept}) => _run(() async {
    final navigator = Navigator.of(context);
    final response = await MatchService.respondToInvite(invite['id'].toString(), accept: accept);
    if (!mounted) return;
    if (accept && response['match'] is Map) {
      final match = Map<String, dynamic>.from(response['match'] as Map);
      await navigator.push(MaterialPageRoute<void>(
        builder: (_) => OnlineMatchScreen(match: match),
      ));
    }
    final results = await Future.wait([MatchService.listOpen(), MatchService.pendingInvites()]);
    if (mounted) setState(() { _matches = results[0]; _invites = results[1]; });
  });

  Future<void> _join(Map<String, dynamic> room) => _run(() async {
    final match = await MatchService.join(room['id'].toString());
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OnlineMatchScreen(match: match),
    ));
    final rows = await MatchService.listOpen();
    if (mounted) setState(() => _matches = rows);
  });

  Future<void> _cancelCreated() => _run(() async {
    final id = _created?['id'];
    if (id == null) return;
    await MatchService.cancel(id.toString());
    if (mounted) setState(() => _created = null);
  });

  @override
  Widget build(BuildContext context) {
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    return Directionality(
    textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
    child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(title: Text(isEnglish ? 'Online backgammon' : 'بازی آنلاین'), backgroundColor: Theme.of(context).scaffoldBackgroundColor, foregroundColor: Theme.of(context).colorScheme.primary,
        actions: [
          IconButton(
            onPressed: _loading ? null : () {
              Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => const LeaderboardScreen(),
              ));
            },
            icon: const Icon(Icons.leaderboard_outlined),
            tooltip: isEnglish ? 'Leaderboard' : 'رتبه‌بندی',
          ),
          IconButton(onPressed: _loading ? null : _refresh, icon: const Icon(Icons.refresh), tooltip: isEnglish ? 'Refresh' : 'به‌روزرسانی'),
        ]),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        Text(isEnglish ? 'Backgammon rooms' : 'اتاق‌های تخته‌نرد', style: TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(isEnglish ? 'Create a room or join an opponent through the secure game service.' : 'ساخت اتاق و پیوستن به حریف از طریق API احراز هویت‌شده انجام می‌شود.', style: TextStyle(color: Colors.white70, height: 1.5)),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _loading ? null : _create, icon: const Icon(Icons.add), label: Text(isEnglish ? 'Create room' : 'ساخت اتاق جدید'),
          style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary, padding: const EdgeInsets.all(14))),
        if (_created != null) Card(color: Theme.of(context).colorScheme.surface, child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(isEnglish ? 'Your room is ready' : 'اتاق شما ساخته شد', style: TextStyle(color: _gold, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text(isEnglish ? 'Code: ${_created!['roomCode'] ?? '—'}' : 'کد: ${_created!['roomCode'] ?? '—'}', style: const TextStyle(color: Colors.white)),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: _loading ? null : _cancelCreated, icon: const Icon(Icons.cancel_outlined), label: Text(isEnglish ? 'Cancel waiting room' : 'لغو اتاق در انتظار')),
        ]))),
        if (_error != null) Container(margin: const EdgeInsets.only(top: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.red.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
        if (_loading) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(color: _gold))),
        if (_invites.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(isEnglish ? 'Incoming invitations' : 'دعوت‌های دریافتی', style: TextStyle(color: _gold, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ..._invites.map((invite) => Card(
            color: Theme.of(context).colorScheme.surface,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: RoyalAvatar(dataUrl: invite['inviterAvatarDataUrl']?.toString(), radius: 22),
                  title: Text('@${invite['inviterUsername'] ?? ''}', style: const TextStyle(color: Colors.white)),
                  subtitle: Text(isEnglish ? 'Invited you to backgammon · Room ${invite['roomCode'] ?? invite['matchId']}' : 'شما را به تخته‌نرد دعوت کرده · اتاق ${invite['roomCode'] ?? invite['matchId']}', style: const TextStyle(color: Colors.white70)),
                ),
                Row(children: [
                  Expanded(child: OutlinedButton(onPressed: _loading ? null : () => _respondToInvite(invite, accept: false), child: Text(isEnglish ? 'Decline' : 'رد دعوت'))),
                  const SizedBox(width: 8),
                  Expanded(child: FilledButton(onPressed: _loading ? null : () => _respondToInvite(invite, accept: true), style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: _navy), child: Text(isEnglish ? 'Accept and join' : 'پذیرش و ورود'))),
                ]),
              ]),
            ),
          )),
        ],
        const SizedBox(height: 20),
        Text(isEnglish ? 'Available rooms' : 'اتاق‌های قابل پیوستن', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (!_loading && _matches.isEmpty) Padding(padding: const EdgeInsets.all(18), child: Text(isEnglish ? 'No open rooms are available right now.' : 'در حال حاضر اتاق بازی آزادی وجود ندارد.', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60))),
        ..._matches.map((room) => Card(color: Theme.of(context).colorScheme.surface, child: ListTile(
          leading: RoyalAvatar(dataUrl: room['hostAvatarDataUrl']?.toString(), radius: 22),
          title: Text(isEnglish ? 'Room ${room['roomCode'] ?? room['id']}' : 'اتاق ${room['roomCode'] ?? room['id']}', style: const TextStyle(color: Colors.white)),
          subtitle: Text(isEnglish ? 'Host: @${room['hostName'] ?? 'player'}' : 'میزبان: @${room['hostName'] ?? 'بازیکن'}', style: const TextStyle(color: Colors.white70)),
          trailing: FilledButton(onPressed: _loading ? null : () => _join(room), style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: _navy), child: Text(isEnglish ? 'Join' : 'پیوستن')),
        ))),
        const SizedBox(height: 24),
        Row(
          children: [
            const Icon(Icons.visibility_outlined, color: _gold),
            const SizedBox(width: 8),
            Expanded(child: Text(isEnglish ? 'Live games to watch' : 'بازی‌های زنده برای تماشا',
              style: const TextStyle(color: _gold, fontSize: 18, fontWeight: FontWeight.bold))),
            if (_liveMatches.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: Colors.redAccent.withValues(alpha: .15), borderRadius: BorderRadius.circular(12)),
                child: Text('${_liveMatches.length}', style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (!_loading && _liveMatches.isEmpty)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              isEnglish ? 'No live games are available to you. Only games enabled by a host and shared with accepted friends appear here.'
                  : 'بازی زنده‌ای برای تماشای شما موجود نیست. فقط بازی‌هایی نمایش داده می‌شوند که میزبان اجازه تماشا داده و شما با یکی از بازیکنان دوست پذیرفته‌شده باشید.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white60),
            ),
          ),
        ..._liveMatches.map((game) => Card(
          color: Theme.of(context).colorScheme.surface,
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Colors.redAccent,
              child: Icon(Icons.visibility, color: Colors.white),
            ),
            title: Text(
              isEnglish
                  ? '@${game['hostName'] ?? 'player'} vs @${game['guestName'] ?? 'player'}'
                  : '@${game['hostName'] ?? 'بازیکن'} در برابر @${game['guestName'] ?? 'بازیکن'}',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              isEnglish ? 'Room ${game['roomCode'] ?? game['id']} · Live'
                  : 'اتاق ${game['roomCode'] ?? game['id']} · زنده',
              style: const TextStyle(color: Colors.white70),
            ),
            trailing: FilledButton(
              onPressed: _loading ? null : () {
                Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => SpectatorMatchScreen(match: game),
                ));
              },
              style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: _navy),
              child: Text(isEnglish ? 'Watch' : 'تماشا'),
            ),
          ),
        )),
        const SizedBox(height: 24),
        Text(isEnglish ? 'Recent results' : 'نتایج بازی‌های اخیر', style: TextStyle(color: _gold, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (!_loading && _history.isEmpty)
          Padding(padding: const EdgeInsets.all(12), child: Text(isEnglish ? 'No completed games yet.' : 'هنوز بازی پایان‌یافته‌ای ثبت نشده است.', style: const TextStyle(color: Colors.white60))),
        ..._history.map((game) {
          final result = game['result']?.toString() ?? 'unknown';
          final won = result == 'win';
          final resultLabel = isEnglish ? (won ? 'Win' : result == 'loss' ? 'Loss' : 'Unknown result') : (won ? 'پیروزی' : result == 'loss' ? 'شکست' : 'نتیجه نامشخص');
          return Card(
            color: Theme.of(context).colorScheme.surface,
            child: ListTile(
              leading: RoyalAvatar(dataUrl: game['opponentAvatarDataUrl']?.toString(), radius: 22),
              title: Text(resultLabel, style: TextStyle(color: won ? _gold : Colors.white)),
              subtitle: Text(isEnglish ? 'Opponent: @${game['opponentName'] ?? 'player'} • Room ${game['roomCode'] ?? game['id']}' : 'حریف: @${game['opponentName'] ?? 'بازیکن'} • اتاق ${game['roomCode'] ?? game['id']}',
                style: const TextStyle(color: Colors.white70)),
              trailing: Icon(won ? Icons.emoji_events_outlined : Icons.history, color: won ? _gold : Colors.white38),
            ),
          );
        }),
      ])),
    ),
  );
  }
}
