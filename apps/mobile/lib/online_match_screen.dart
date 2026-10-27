import 'dart:async';
import 'package:flutter/material.dart';
import 'profile_avatar.dart';
import 'services/match_service.dart';

class OnlineMatchScreen extends StatefulWidget {
  final Map<String, dynamic> match;
  const OnlineMatchScreen({super.key, required this.match});

  @override
  State<OnlineMatchScreen> createState() => _OnlineMatchScreenState();
}

class _OnlineMatchScreenState extends State<OnlineMatchScreen> {
  Timer? _poller;
  int _refreshSequence = 0;
  Map<String, dynamic>? _state;
  Map<String, dynamic> _matchDetails = {};
  bool _busy = false;
  bool _refreshing = false;
  bool _connectionLost = false;
  int? _selectedFrom;
  int? _selectedDie;
  bool _fromBar = false;
  bool _batchMode = false;
  final List<Map<String, int?>> _pendingMoves = [];
  String _matchStatus = 'waiting';
  String? _error;

  String get _id => widget.match['id'].toString();
  bool get _isEnglish => Localizations.localeOf(context).languageCode == 'en';

  @override
  void initState() {
    super.initState();
    _matchDetails = Map<String, dynamic>.from(widget.match);
    _refresh();
    _poller = Timer.periodic(const Duration(seconds: 3), (_) => _refresh(silent: true));
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if ((_busy && !silent) || _refreshing) return;
    _refreshing = true;
    final sequence = ++_refreshSequence;
    try {
      final match = await MatchService.get(_id);
      if (sequence != _refreshSequence) {
        return;
      }
      if (mounted) setState(() => _matchDetails = Map<String, dynamic>.from(match));
      if (match['status'] == 'active' || match['status'] == 'finished') {
        final state = await MatchService.getState(_id);
        if (sequence != _refreshSequence) {
          return;
        }
        if (mounted) {
          setState(() {
            _state = state;
            _matchStatus = match['status'].toString();
            _error = null;
            _connectionLost = false;
          });
        }
      } else if (mounted) {
        setState(() {
          _state = null;
          _matchStatus = match['status']?.toString() ?? 'waiting';
          _error = null;
          _connectionLost = false;
        });
      }
    } catch (e) {
      if (sequence == _refreshSequence && mounted) {
        setState(() {
          _connectionLost = true;
          if (!silent) _error = e.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _updateSetup({int? matchToWin, bool? acceptSettings, bool? ready}) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await MatchService.updateSetup(_id, matchToWin: matchToWin, acceptSettings: acceptSettings, ready: ready);
      await _refresh(silent: true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelOrRespond({required bool accept}) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      final result = await MatchService.proposeOrRespondCancellation(_id, accept: accept);
      if (mounted && result['status'] == 'cancelled') {
        setState(() => _matchStatus = 'cancelled');
      }
      await _refresh(silent: true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _inviteFriend() async {
    if (_busy || _matchStatus != 'waiting' || _matchDetails['isHost'] != true) return;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    try {
      final friends = await MatchService.friends();
      if (!mounted) return;
      if (friends.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isEnglish
              ? 'Add an accepted friend before sending an invitation.'
              : 'برای ارسال دعوت، ابتدا باید یک دوستی پذیرفته‌شده داشته باشید.'),
        ));
        return;
      }
      final friendId = await showDialog<String>(
        context: context,
        builder: (dialogContext) => Directionality(
          textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
          child: AlertDialog(
            title: Text(isEnglish ? 'Invite a friend' : 'دعوت از دوست'),
            content: SizedBox(
              width: 360,
              child: ListView(
                shrinkWrap: true,
                children: friends.map((friend) => ListTile(
                  leading: RoyalAvatar(dataUrl: friend['avatarDataUrl']?.toString(), radius: 20),
                  title: Text('@${friend['username'] ?? ''}'),
                  onTap: () => Navigator.of(dialogContext).pop(friend['userId'].toString()),
                )).toList(),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: Text(isEnglish ? 'Cancel' : 'انصراف'),
              ),
            ],
          ),
        ),
      );
      if (friendId == null || !mounted) return;
      setState(() { _busy = true; _error = null; });
      await MatchService.inviteFriend(_id, friendId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(isEnglish
              ? 'Invitation sent. It expires in 10 seconds; you can invite again afterward.'
              : 'دعوت ارسال شد. پس از ۱۰ ثانیه منقضی می‌شود و می‌توانید دوباره دعوت کنید.'),
        ));
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleSpectators(bool enabled) async {
    if (_busy || _matchDetails['isHost'] != true) return;
    setState(() { _busy = true; _error = null; });
    try {
      final saved = await MatchService.setSpectatorsEnabled(_id, enabled);
      if (mounted) setState(() => _matchDetails['spectatorsEnabled'] = saved);
      await _refresh(silent: true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showHeadToHeadSummary({required bool isHost}) {
    final isEnglish = _isEnglish;
    final myIsHost = _matchDetails['isHost'] == true;
    final hostName = _matchDetails['hostName']?.toString() ?? (isEnglish ? 'Host' : 'میزبان');
    final guestName = _matchDetails['guestName']?.toString() ?? (isEnglish ? 'Opponent' : 'حریف');
    final hostPoints = (_matchDetails['headToHeadHostPoints'] as num?)?.toInt() ?? 0;
    final guestPoints = (_matchDetails['headToHeadGuestPoints'] as num?)?.toInt() ?? 0;
    final hostWins = (_matchDetails['headToHeadHostWins'] as num?)?.toInt() ?? 0;
    final guestWins = (_matchDetails['headToHeadGuestWins'] as num?)?.toInt() ?? 0;
    final matches = (_matchDetails['headToHeadMatches'] as num?)?.toInt() ?? 0;
    final viewerName = myIsHost ? hostName : guestName;
    final opponentName = myIsHost ? guestName : hostName;
    final viewerPoints = myIsHost ? hostPoints : guestPoints;
    final opponentPoints = myIsHost ? guestPoints : hostPoints;
    final viewerWins = myIsHost ? hostWins : guestWins;
    final opponentWins = myIsHost ? guestWins : hostWins;
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: Theme.of(context).colorScheme.surface,
        title: Text(isEnglish ? 'Head-to-head stats' : 'آمار رودررو', style: TextStyle(color: Theme.of(context).colorScheme.primary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('$viewerName  $viewerPoints  -  $opponentPoints  $opponentName',
              textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold)),
            const SizedBox(height: 14),
            _headToHeadRow(isEnglish ? 'Matches played' : 'تعداد مسابقات رودررو', '$matches'),
            _headToHeadRow(isEnglish ? 'Match wins' : 'بردهای مسابقه', '$viewerWins - $opponentWins'),
            _headToHeadRow(isEnglish ? 'Game points' : 'امتیاز دست‌ها', '$viewerPoints - $opponentPoints'),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(isEnglish ? 'Close' : 'بستن'))],
      ),
    );
  }

  Widget _headToHeadRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(children: [
      Expanded(child: Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)))),
      Text(value, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
    ]),
  );

  Future<void> _resignMatch() async {
    if (_busy || _matchStatus != 'active') return;
    final isEnglish = _isEnglish;
    final scope = await showDialog<String>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: AlertDialog(
          title: Text(isEnglish ? 'Resign' : 'تسلیم'),
          content: Text(isEnglish ? 'Choose what to resign:' : 'نوع تسلیم را انتخاب کنید:'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(null),
              child: Text(isEnglish ? 'Cancel' : 'انصراف'),
            ),
            OutlinedButton(
              onPressed: () => Navigator.of(dialogContext).pop('game'),
              child: Text(isEnglish ? 'Resign this game' : 'قبول شکست این دست'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
              onPressed: () => Navigator.of(dialogContext).pop('match'),
              child: Text(isEnglish ? 'Resign the match' : 'قبول شکست مسابقه'),
            ),
          ],
        ),
      ),
    );
    if (scope == null || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: AlertDialog(
          title: Text(scope == 'game' ? (isEnglish ? 'Confirm game loss' : 'تأیید شکست این دست') : (isEnglish ? 'Confirm match loss' : 'تأیید شکست مسابقه')),
          content: Text(
            scope == 'game'
              ? (isEnglish ? 'This game will be awarded to your opponent. If they reach the target, the match ends.' : 'با تأیید، این دست به حریف واگذار می‌شود. اگر امتیاز حریف به حد نصاب مسابقه برسد، کل مسابقه پایان می‌یابد.')
              : (isEnglish ? 'The whole match will be awarded to your opponent and the result and rating will be recorded. This cannot be undone.' : 'با تأیید، کل مسابقه به حریف واگذار می‌شود و نتیجه و رتبه‌بندی ثبت خواهد شد. این کار قابل بازگشت نیست.'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: Text(isEnglish ? 'Back' : 'بازگشت'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: Text(isEnglish ? 'Confirm' : 'تأیید'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      final result = await MatchService.resign(_id, scope: scope);
      if (mounted) {
        setState(() => _matchStatus = result['status']?.toString() ?? _matchStatus);
      }
      await _refresh(silent: true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _roll() async {
    if (_busy || _state == null) return;
    setState(() { _busy = true; _error = null; });
    try {
      final next = await MatchService.roll(_id, (_state!['version'] as num).toInt());
      if (mounted) setState(() => _state = {...?_state, ...next});
      await _refresh(silent: true);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _endTurn() async {
    if (_busy || _state == null) return;
    setState(() { _busy = true; _error = null; });
    try {
      final next = await MatchService.endTurn(_id, (_state!['version'] as num).toInt());
      if (mounted) {
        setState(() {
          _state = {...?_state, ...next};
          _selectedFrom = null;
          _selectedDie = null;
          _fromBar = false;
        });
      }
      await _refresh(silent: true);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, dynamic> _previewGameState() {
    final board = ((_state?['board'] as List?)?.cast<num>() ?? const <num>[]).map((v) => v.toInt()).toList();
    final originalBar = (_state?['bar'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final bar = <String, int>{'host': (originalBar['host'] as num? ?? 0).toInt(), 'guest': (originalBar['guest'] as num? ?? 0).toInt()};
    final originalOff = (_state?['off'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};
    final off = <String, int>{'host': (originalOff['host'] as num? ?? 0).toInt(), 'guest': (originalOff['guest'] as num? ?? 0).toInt()};
    final hostTurn = _state?['isHost'] == true;
    final sign = hostTurn ? 1 : -1;
    final own = hostTurn ? 'host' : 'guest';
    final other = hostTurn ? 'guest' : 'host';
    for (final move in _pendingMoves) {
      final from = move['from'];
      final to = move['to'];
      final die = move['die'] ?? 0;
      if (from == null && to != null) {
        final target = hostTurn ? 24 - die : die - 1;
        if (target >= 0 && target < 24) {
          bar[own] = (bar[own] ?? 0) - 1;
          if (board[target] * sign < 0) { board[target] = 0; bar[other] = (bar[other] ?? 0) + 1; }
          board[target] += sign;
        }
      } else if (from != null && to == null && from >= 0 && from < 24) {
        board[from] -= sign;
        off[own] = (off[own] ?? 0) + 1;
      } else if (from != null && to != null && from >= 0 && from < 24 && to >= 0 && to < 24) {
        board[from] -= sign;
        if (board[to] * sign < 0) { board[to] = 0; bar[other] = (bar[other] ?? 0) + 1; }
        board[to] += sign;
      }
    }
    return {'board': board, 'bar': bar, 'off': off};
  }

  Future<void> _stageMove({required int? from, required int? to, required int die}) async {
    if (_state == null) return;
    final preview = _previewGameState();
    final board = (preview['board'] as List<int>);
    final bar = (preview['bar'] as Map<String, int>);
    final hostTurn = _state?['isHost'] == true;
    final sign = hostTurn ? 1 : -1;
    final ownBar = bar[hostTurn ? 'host' : 'guest'] ?? 0;
    if (ownBar > 0) {
      final expected = hostTurn ? 24 - die : die - 1;
      if (from != null || to != expected) { setState(() => _error = _isEnglish ? 'Enter a checker from the bar first using the selected die.' : 'ابتدا باید مهره را با تاس انتخاب‌شده از بار وارد کنید.'); return; }
      if (board[expected] * sign <= -2) { setState(() => _error = _isEnglish ? 'The entry point is blocked by two opponent checkers.' : 'خانهٔ ورود با دو مهرهٔ حریف بسته است.'); return; }
    } else if (from == null) {
      setState(() => _error = _isEnglish ? 'You have no checkers on the bar.' : 'مهره‌ای روی بار ندارید.'); return;
    } else if (to == null) {
      final inHome = hostTurn ? from <= 5 : from >= 18;
      final allHome = board.asMap().entries.every((e) => hostTurn ? e.key <= 5 || e.value <= 0 : e.key >= 18 || e.value >= 0);
      final distance = hostTurn ? from + 1 : 24 - from;
      final clear = hostTurn
          ? !board.asMap().entries.any((e) => e.key > from && e.key <= 5 && e.value > 0)
          : !board.asMap().entries.any((e) => e.key < from && e.key >= 18 && e.value < 0);
      if (board[from] * sign <= 0 || !inHome || !allHome || die < distance || (die > distance && !clear)) {
        setState(() => _error = _isEnglish ? 'This checker cannot be borne off with that die.' : 'این مهره با این تاس قابل خارج‌کردن نیست.'); return;
      }
    } else {
      final expected = hostTurn ? from - die : from + die;
      if (board[from] * sign <= 0 || expected != to || to < 0 || to > 23 || board[to] * sign <= -2) {
        setState(() => _error = _isEnglish ? 'That move is not legal for the selected die.' : 'این حرکت با تاس انتخاب‌شده قانونی نیست.'); return;
      }
    }
    setState(() {
      _pendingMoves.add({'from': from, 'to': to, 'die': die});
      _selectedFrom = null;
      _selectedDie = null;
      _fromBar = false;
      _error = null;
    });
  }

  Future<void> _submitBatch() async {
    if (_busy || _state == null || _pendingMoves.isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      final next = await MatchService.batchMove(
        _id,
        moves: List<Map<String, int?>>.from(_pendingMoves),
        expectedVersion: (_state!['version'] as num).toInt(),
      );
      if (mounted) {
        setState(() {
          _state = {...?_state, ...next};
          _pendingMoves.clear();
          _batchMode = false;
          _selectedFrom = null;
          _selectedDie = null;
          _fromBar = false;
        });
      }
      await _refresh(silent: true);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _cancelBatch() {
    setState(() {
      _pendingMoves.clear();
      _batchMode = false;
      _selectedFrom = null;
      _selectedDie = null;
      _fromBar = false;
      _error = null;
    });
  }

  Future<void> _tapPoint(int point, List<num> board, List<num> remaining, bool isMyTurn) async {
    if (!isMyTurn || _busy) return;
    if (_selectedDie == null || !remaining.contains(_selectedDie)) {
      setState(() => _error = _isEnglish ? 'Choose one of the remaining dice first.' : 'ابتدا یکی از تاس‌های باقی‌مانده را انتخاب کنید.');
      return;
    }
    if (_fromBar) {
      if (_batchMode) { await _stageMove(from: null, to: point, die: _selectedDie!); } else { await _submitMove(from: null, to: point, die: _selectedDie!); }
      return;
    }
    if (_selectedFrom == null) {
      final sign = _state?['isHost'] == true ? 1 : -1;
      if (board[point].toInt() * sign <= 0) {
        setState(() => _error = _isEnglish ? 'Select one of your own checkers.' : 'مهره‌ای از خودتان را انتخاب کنید.');
        return;
      }
      setState(() { _selectedFrom = point; _error = null; });
      return;
    }
    if (_selectedFrom == point) {
      setState(() { _selectedFrom = null; _error = null; });
      return;
    }
    if (_batchMode) { await _stageMove(from: _selectedFrom, to: point, die: _selectedDie!); } else { await _submitMove(from: _selectedFrom, to: point, die: _selectedDie!); }
  }

  Future<void> _submitMove({required int? from, required int? to, required int die}) async {
    if (_busy || _state == null) return;
    setState(() { _busy = true; _error = null; });
    try {
      final next = await MatchService.move(
        _id, from: from, to: to, die: die,
        expectedVersion: (_state!['version'] as num).toInt(),
      );
      if (mounted) {
        setState(() {
          _state = {...?_state, ...next};
          _selectedFrom = null;
          _selectedDie = null;
          _fromBar = false;
        });
      }
      await _refresh(silent: true);
    } catch (e) {
      final message = e.toString().replaceFirst('Exception: ', '');
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dice = (_state?['dice'] as List?)?.cast<num>() ?? const <num>[];
    final rawRemaining = (_state?['remainingDice'] as List?)?.cast<num>() ?? const <num>[];
    final preview = _previewGameState();
    final board = (preview['board'] as List<int>).map<num>((v) => v).toList();
    final remaining = [...rawRemaining];
    for (final move in _pendingMoves) {
      final die = move['die'];
      if (die != null) remaining.remove(die);
    }
    final isMyTurn = _state?['isMyTurn'] == true;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final bar = preview['bar'] as Map<String, int>;
    final ownBar = (bar[_state?['isHost'] == true ? 'host' : 'guest'] ?? 0);
    return Directionality(
      textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.primary,
          title: Text(isEnglish ? 'Room ${widget.match['roomCode'] ?? _id}' : 'اتاق ${widget.match['roomCode'] ?? _id}'),
          actions: [IconButton(onPressed: _busy ? null : _refresh, icon: const Icon(Icons.refresh))],
        ),
        body: SafeArea(child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_connectionLost) Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.red.withValues(alpha: .13), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.redAccent.withValues(alpha: .5))),
              child: Row(children: [
                const Icon(Icons.wifi_off_rounded, color: Colors.redAccent),
                const SizedBox(width: 10),
                Expanded(child: Text(isEnglish ? 'Server connection is unstable. Reconnecting…' : 'اتصال به سرور قطع یا ناپایدار است؛ تلاش برای اتصال مجدد ادامه دارد.', style: const TextStyle(color: Colors.redAccent))),
                IconButton(tooltip: isEnglish ? 'Retry' : 'تلاش دوباره', onPressed: _refreshing ? null : () => _refresh(), icon: const Icon(Icons.refresh, color: Colors.redAccent)),
              ]),
            ),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: .35))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(
                  _matchStatus == 'finished'
                      ? (isEnglish ? 'Game finished' : 'بازی پایان یافت')
                      : (_state == null
                          ? (isEnglish ? 'Waiting for opponent…' : 'در انتظار ورود حریف...')
                          : (isMyTurn ? (isEnglish ? 'Your turn' : 'نوبت شماست') : (isEnglish ? 'Waiting for opponent' : 'در انتظار حرکت حریف'))),
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 6),
                Text(isEnglish ? 'First to ${_matchDetails['matchToWin'] ?? 1} · Match score: ${_matchDetails['hostGameWins'] ?? 0} - ${_matchDetails['guestGameWins'] ?? 0}' : 'Match to Win: ${_matchDetails['matchToWin'] ?? 1} · امتیاز مسابقه: ${_matchDetails['hostGameWins'] ?? 0} - ${_matchDetails['guestGameWins'] ?? 0}',
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(_state == null ? (isEnglish ? 'Room status refreshes automatically.' : 'این صفحه به‌صورت خودکار هر ۳ ثانیه وضعیت اتاق را بررسی می‌کند.') : (isEnglish ? 'State version: ${_state!['version']}' : 'نسخه وضعیت: ${_state!['version']}'),
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.54), fontSize: 12)),
              ]),
            ),
            if (_matchStatus == 'waiting' && _matchDetails['isHost'] == true)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _inviteFriend,
                  icon: const Icon(Icons.person_add_alt_1),
                  label: Text(isEnglish ? 'Invite / invite again' : 'دعوت یا دعوت مجدد'),
                ),
              ),
            const SizedBox(height: 12),
            Card(
              color: Theme.of(context).colorScheme.surface,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => _showHeadToHeadSummary(isHost: true),
                      child: Column(children: [
                        RoyalAvatar(dataUrl: _matchDetails['hostAvatarDataUrl']?.toString(), radius: 25),
                        const SizedBox(height: 5),
                        Text(_matchDetails['hostName']?.toString() ?? (isEnglish ? 'Host' : 'میزبان'), textAlign: TextAlign.center,
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ]),
                    )),
                    Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text(isEnglish ? 'vs.' : 'در برابر', style: TextStyle(color: Theme.of(context).colorScheme.primary))),
                    Expanded(child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: _matchDetails['guestName'] == null ? null : () => _showHeadToHeadSummary(isHost: false),
                      child: Column(children: [
                        RoyalAvatar(dataUrl: _matchDetails['guestAvatarDataUrl']?.toString(), radius: 25),
                        const SizedBox(height: 5),
                        Text(_matchDetails['guestName']?.toString() ?? (isEnglish ? 'Waiting for opponent' : 'در انتظار حریف'), textAlign: TextAlign.center,
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ]),
                    )),
                  ],
                ),
              ),
            ),
            if (_matchDetails['guestName'] != null && _matchStatus == 'waiting') ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: .65))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(isEnglish ? 'Match setup' : 'تنظیم مسابقه', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  if (_matchDetails['isHost'] == true)
                    Row(children: [
                      Text(isEnglish ? 'Match length' : 'طول مسابقه', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                      const SizedBox(width: 12),
                      Expanded(child: DropdownButton<int>(
                        isExpanded: true,
                        value: [1, 3, 5].contains((_matchDetails['matchToWin'] as num?)?.toInt())
                            ? (_matchDetails['matchToWin'] as num).toInt() : 1,
                        items: [1, 3, 5].map((n) => DropdownMenuItem<int>(
                          value: n,
                          child: Text(isEnglish ? 'First to $n win${n == 1 ? '' : 's'}' : '$n برد'),
                        )).toList(),
                        onChanged: _busy ? null : (n) { if (n != null) _updateSetup(matchToWin: n); },
                      )),
                    ])
                  else
                    Text(
                      isEnglish ? 'Match: first to ${_matchDetails['matchToWin'] ?? 1} win${(_matchDetails['matchToWin'] ?? 1) == 1 ? '' : 's'}'
                        : 'خلاصه: ${_matchDetails['matchToWin'] ?? 1} برد',
                      style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                    ),
                  if (_matchDetails['isHost'] != true && _matchDetails['guestSettingsAccepted'] != true)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        onPressed: _busy ? null : () => _updateSetup(acceptSettings: true),
                        icon: const Icon(Icons.check_circle_outline),
                        label: Text(isEnglish ? 'Accept settings' : 'تأیید تنظیمات'),
                      ),
                    ),
                  const SizedBox(height: 4),
                  FilledButton.icon(
                    onPressed: _busy || (_matchDetails[_matchDetails['isHost'] == true ? 'hostSettingsAccepted' : 'guestSettingsAccepted'] != true)
                      ? null : () => _updateSetup(ready: _matchDetails[_matchDetails['isHost'] == true ? 'hostReady' : 'guestReady'] != true),
                    icon: Icon(_matchDetails[_matchDetails['isHost'] == true ? 'hostReady' : 'guestReady'] == true ? Icons.undo : Icons.play_arrow_rounded),
                    label: Text(_matchDetails[_matchDetails['isHost'] == true ? 'hostReady' : 'guestReady'] == true
                      ? (isEnglish ? 'Cancel ready' : 'لغو آمادگی')
                      : (isEnglish ? 'Ready to play' : 'آماده شروع بازی')),
                    style: FilledButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      foregroundColor: Theme.of(context).colorScheme.onPrimary,
                      minimumSize: const Size(0, 42),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                  ),
                ]),
              ),
            ],
            if (_matchDetails['isHost'] == true && ['waiting', 'active'].contains(_matchStatus)) ...[
              Card(
                color: Theme.of(context).colorScheme.surface,
                child: SwitchListTile(
                  value: _matchDetails['spectatorsEnabled'] == true,
                  onChanged: _busy ? null : _toggleSpectators,
                  activeThumbColor: Theme.of(context).colorScheme.primary,
                  title: Text(_isEnglish ? 'Allow live spectators' : 'اجازه تماشای زنده',
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    _isEnglish
                        ? 'Only accepted friends of either player can watch. Spectators are read-only.'
                        : 'فقط دوستان پذیرفته‌شدهٔ یکی از دو بازیکن می‌توانند تماشا کنند؛ تماشاگر فقط امکان مشاهده دارد.',
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6)),
                  ),
                ),
              ),
            ],
            if (_matchStatus == 'active') ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _busy ? null : _resignMatch,
                icon: const Icon(Icons.flag_rounded, size: 18, color: Colors.redAccent),
                label: Text(isEnglish ? 'Resign' : 'تسلیم'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  minimumSize: const Size(0, 40),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
            ],
            if (_matchDetails['guestName'] != null && ['waiting', 'active'].contains(_matchStatus)) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.redAccent.withValues(alpha: .45))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(isEnglish ? 'Cancel match by agreement' : 'لغو مسابقه با توافق طرفین', style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  if (_matchDetails['cancellationProposedBy'] == null)
                    OutlinedButton.icon(onPressed: _busy ? null : () => _cancelOrRespond(accept: false), icon: const Icon(Icons.handshake_outlined), label: Text(_isEnglish ? 'Propose cancellation' : 'پیشنهاد لغو مسابقه')),
                  if (_matchDetails['cancellationProposedBy'] != null && _matchDetails['cancellationProposedByMe'] == true)
                    Text(_isEnglish ? 'Your cancellation request is awaiting a response.' : 'پیشنهاد لغو شما در انتظار پاسخ حریف است.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                  if (_matchDetails['cancellationProposedBy'] != null && _matchDetails['cancellationProposedByMe'] != true) ...[
                    Text(_isEnglish ? 'Your opponent proposed cancelling the match. Do you agree?' : 'حریف پیشنهاد لغو داده است. آیا موافق هستید؟', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                    Row(children: [
                      Expanded(child: OutlinedButton(onPressed: _busy ? null : () => _cancelOrRespond(accept: false), child: Text(_isEnglish ? 'Decline' : 'رد پیشنهاد'))),
                      const SizedBox(width: 8),
                      Expanded(child: FilledButton(onPressed: _busy ? null : () => _cancelOrRespond(accept: true), child: Text(_isEnglish ? 'Accept cancellation' : 'تأیید لغو'))),
                    ]),
                  ],
                ]),
              ),
            ],
            if (_state != null) ...[
              const SizedBox(height: 16),
              if (isMyTurn && remaining.isNotEmpty) OutlinedButton.icon(
                onPressed: _busy ? null : () => setState(() {
                  _batchMode = !_batchMode;
                  _pendingMoves.clear();
                  _selectedFrom = null;
                  _selectedDie = null;
                  _fromBar = false;
                  _error = null;
                }),
                icon: Icon(_batchMode ? Icons.playlist_remove : Icons.playlist_add),
                label: Text(_batchMode ? (isEnglish ? 'Exit batch move' : 'لغو حالت حرکت ترکیبی') : (isEnglish ? 'Plan multiple moves' : 'ثبت چند حرکت با یک تأیید')),
              ),
              if (_batchMode) Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Theme.of(context).colorScheme.primary)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(isEnglish ? 'Planned moves: ${_pendingMoves.length} — preview only, not yet submitted.' : 'حرکت‌های آماده: ${_pendingMoves.length} — تخته پیش‌نمایش است؛ هنوز روی سرور ثبت نشده.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: OutlinedButton(onPressed: _busy ? null : _cancelBatch, child: Text(isEnglish ? 'Clear all' : 'لغو همه'))),
                    const SizedBox(width: 8),
                    Expanded(child: FilledButton(onPressed: _busy || _pendingMoves.isEmpty ? null : _submitBatch, child: Text(isEnglish ? 'Submit all moves' : 'ثبت همه حرکت‌ها'))),
                  ]),
                ]),
              ),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(16), border: Border.all(color: Theme.of(context).colorScheme.primary)),
                child: Column(children: [
                  Text(isEnglish ? 'Server board state' : 'وضعیت تخته از سرور', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  OnlineBackgammonBoard(
                    points: board,
                    selectedPoint: _selectedFrom,
                    onPointTap: (point) => _tapPoint(point, board, remaining, isMyTurn),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(isEnglish ? 'Dice' : 'تاس سرور', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 17, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    _Die(value: dice.isNotEmpty ? dice[0].toInt() : null),
                    const SizedBox(width: 12),
                    _Die(value: dice.length > 1 ? dice[1].toInt() : null),
                  ]),
                  const SizedBox(height: 8),
                  Text(dice.isEmpty ? (isEnglish ? 'No dice rolled yet.' : 'هنوز تاسی ریخته نشده است.') : (isEnglish ? 'Choose a remaining die:' : 'تاس‌های باقی‌مانده را انتخاب کنید:'),
                    textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                  if (remaining.isNotEmpty) Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    children: remaining.map((die) => ChoiceChip(
                      label: Text(die.toString()),
                      selected: _selectedDie == die,
                      onSelected: isMyTurn && !_busy ? (_) => setState(() { _selectedDie = die.toInt(); _error = null; }) : null,
                    )).toList(),
                  ),
                  if (ownBar > 0 && isMyTurn) OutlinedButton.icon(
                    onPressed: _busy ? null : () => setState(() { _fromBar = true; _selectedFrom = null; _error = null; }),
                    icon: const Icon(Icons.login),
                    label: Text(isEnglish ? 'Enter checker from bar (${ownBar.toInt()})' : 'ورود مهره از بار (${ownBar.toInt()})'),
                  ),
                  if (_selectedFrom != null && isMyTurn) OutlinedButton.icon(
                    onPressed: _busy || _selectedDie == null ? null : () => _batchMode ? _stageMove(from: _selectedFrom, to: null, die: _selectedDie!) : _submitMove(from: _selectedFrom, to: null, die: _selectedDie!),
                    icon: const Icon(Icons.outbound),
                    label: Text(isEnglish ? 'Bear off checker' : 'خارج کردن مهره'),
                  ),
                  if (isMyTurn && remaining.isNotEmpty) OutlinedButton.icon(
                    onPressed: _busy ? null : _endTurn,
                    icon: const Icon(Icons.skip_next),
                    label: Text(isEnglish ? 'End turn (only when no legal move remains)' : 'پایان نوبت (فقط اگر حرکت قانونی نمانده باشد)'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _busy || _matchStatus != 'active' || !isMyTurn || dice.isNotEmpty ? null : _roll,
                    icon: const Icon(Icons.casino),
                    label: Text(_busy ? (isEnglish ? 'Submitting…' : 'در حال ثبت...') : (isEnglish ? 'Roll dice' : 'ریختن تاس')),
                    style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary, padding: const EdgeInsets.all(13)),
                  ),
                ]),
              ),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
            const SizedBox(height: 10),
          ],
        )),
      ),
    );
  }
}


/// Traditional 24-point board drawn from the server-authoritative match state.
class OnlineBackgammonBoard extends StatelessWidget {
  final List<num> points;
  final int? selectedPoint;
  final ValueChanged<int> onPointTap;

  const OnlineBackgammonBoard({
    super.key,
    required this.points,
    required this.onPointTap,
    this.selectedPoint,
  });

  int? _pointAt(Offset position, Size size) {
    if (position.dy < 0 || position.dy > size.height) return null;
    final barWidth = size.width * .075;
    final halfWidth = (size.width - barWidth) / 2;
    final x = position.dx;
    if (x >= halfWidth && x <= halfWidth + barWidth) return null;
    final column = x < halfWidth
        ? (x / (halfWidth / 6)).floor().clamp(0, 5).toInt()
        : ((x - halfWidth - barWidth) / (halfWidth / 6)).floor().clamp(0, 5);
    if (position.dy < size.height / 2) {
      return x < halfWidth ? 11 - column : 5 - column;
    }
    return x < halfWidth ? 12 + column : 18 + column;
  }

  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: 1.48,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final size = Size(constraints.maxWidth, constraints.maxHeight);
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapDown: (details) {
                final point = _pointAt(details.localPosition, size);
                if (point != null && point >= 0 && point < points.length) {
                  onPointTap(point);
                }
              },
              child: CustomPaint(
                size: size,
                painter: _OnlineBackgammonBoardPainter(
                  points: points,
                  selectedPoint: selectedPoint,
                ),
              ),
            );
          },
        ),
      );
}

class _OnlineBackgammonBoardPainter extends CustomPainter {
  final List<num> points;
  final int? selectedPoint;

  _OnlineBackgammonBoardPainter({required this.points, required this.selectedPoint});

  static const _gold = Color(0xFFD8B45A);
  static const _lightChecker = Color(0xFFD8B45A);
  static const _darkChecker = Color(0xFF171717);

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRRect(
      RRect.fromRectAndRadius(bounds, const Radius.circular(14)),
      Paint()..shader = const LinearGradient(
        colors: [Color(0xFFB9844D), Color(0xFF704626), Color(0xFF482B1A)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(bounds),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(bounds.deflate(2), const Radius.circular(12)),
      Paint()..style = PaintingStyle.stroke..strokeWidth = 3..color = _gold,
    );

    final barWidth = size.width * .075;
    final halfWidth = (size.width - barWidth) / 2;
    final midY = size.height / 2;
    canvas.drawRect(Rect.fromLTWH(halfWidth, 5, barWidth, size.height - 10),
        Paint()..color = const Color(0xFF241811));
    final pointWidth = halfWidth / 6;
    final checkerRadius = (pointWidth * .34).clamp(3.0, size.height * .035).toDouble();
    final stackGap = checkerRadius * 1.75;

    for (var i = 0; i < 24 && i < points.length; i++) {
      final top = i < 12;
      final column = i < 12 ? (i < 6 ? 5 - i : 11 - i) : (i < 18 ? i - 12 : i - 18);
      final rightHalf = i < 6 || i >= 18;
      final left = rightHalf ? halfWidth + barWidth : 0.0;
      final x = left + column * pointWidth;
      final rect = Rect.fromLTWH(x + 2, top ? 5 : midY, pointWidth - 4, size.height / 2 - 8);
      final triangle = Path();
      if (top) {
        triangle.moveTo(rect.left, rect.top);
        triangle.lineTo(rect.right, rect.top);
        triangle.lineTo(rect.center.dx, rect.bottom);
      } else {
        triangle.moveTo(rect.left, rect.bottom);
        triangle.lineTo(rect.right, rect.bottom);
        triangle.lineTo(rect.center.dx, rect.top);
      }
      triangle.close();
      canvas.drawPath(triangle, Paint()..color = i.isEven ? const Color(0xFFFFFFFF) : const Color(0xFFB9E7C5));
      if (selectedPoint == i) {
        canvas.drawPath(triangle, Paint()..color = _gold.withValues(alpha: .38));
        canvas.drawPath(triangle, Paint()..style = PaintingStyle.stroke..strokeWidth = 2..color = _gold);
      }
      final pointNumber = TextPainter(
        text: TextSpan(
          text: '${i + 1}',
          style: TextStyle(
            color: const Color(0xFFE53935),
            fontSize: (pointWidth * .24).clamp(7.0, 10.0),
            fontWeight: FontWeight.w900,
            shadows: const [Shadow(color: Colors.black87, blurRadius: 2)],
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      pointNumber.paint(
        canvas,
        Offset(
          x + (pointWidth - pointNumber.width) / 2,
          top ? rect.top + 2 : rect.bottom - pointNumber.height - 2,
        ),
      );
      final count = points[i].toInt();
      if (count == 0) continue;
      final positive = count > 0;
      final checker = Paint()..color = positive ? _lightChecker : _darkChecker;
      final outline = Paint()..style = PaintingStyle.stroke..strokeWidth = 1.2..color = positive ? const Color(0xFFFFE7A0) : const Color(0xFF777777);
      final visible = count.abs().clamp(1, 5);
      for (var stack = 0; stack < visible; stack++) {
        final cy = top
            ? 12 + checkerRadius + stack * stackGap
            : size.height - 12 - checkerRadius - stack * stackGap;
        final center = Offset(x + pointWidth / 2, cy);
        canvas.drawCircle(center, checkerRadius, checker);
        canvas.drawCircle(center, checkerRadius, outline);
      }
      if (count.abs() > 5) {
        final label = TextPainter(
          text: TextSpan(text: count.abs().toString(), style: TextStyle(
            color: positive ? _darkChecker : Colors.white,
            fontSize: checkerRadius * .95,
            fontWeight: FontWeight.w900,
          )),
          textDirection: TextDirection.ltr,
        )..layout();
        label.paint(canvas, Offset(x + (pointWidth - label.width) / 2, top ? 8 : size.height - label.height - 8));
      }
    }
    canvas.drawLine(Offset(halfWidth, 0), Offset(halfWidth, size.height), Paint()..color = _gold..strokeWidth = 1.5);
    canvas.drawLine(Offset(halfWidth + barWidth, 0), Offset(halfWidth + barWidth, size.height), Paint()..color = _gold..strokeWidth = 1.5);
  }

  @override
  bool shouldRepaint(covariant _OnlineBackgammonBoardPainter oldDelegate) {
    if (oldDelegate.selectedPoint != selectedPoint || oldDelegate.points.length != points.length) return true;
    for (var i = 0; i < points.length; i++) {
      if (oldDelegate.points[i] != points[i]) return true;
    }
    return false;
  }
}

class _Die extends StatelessWidget {
  final int? value;
  const _Die({required this.value});

  @override
  Widget build(BuildContext context) => Container(
    width: 54, height: 54,
    alignment: Alignment.center,
    decoration: BoxDecoration(color: const Color(0xFFF5E7C4), borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3))]),
    child: Text(value?.toString() ?? '—', style: const TextStyle(color: Color(0xFF20202A), fontSize: 26, fontWeight: FontWeight.w900)),
  );
}
