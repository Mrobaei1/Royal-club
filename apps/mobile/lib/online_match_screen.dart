import 'dart:async';
import 'package:flutter/material.dart';
import 'room_controls_menu.dart';
import 'l10n/app_text.dart';
import 'profile_avatar.dart';
import 'services/match_service.dart';
import 'online_match_chat_sheet.dart';
import 'online_match_voice_control.dart';
import 'royal_backgammon_board.dart';
import 'match_activity_state.dart';

class OnlineMatchScreen extends StatefulWidget {
  final Map<String, dynamic> match;
  const OnlineMatchScreen({super.key, required this.match});

  @override
  State<OnlineMatchScreen> createState() => _OnlineMatchScreenState();
}

class _OnlineMatchScreenState extends State<OnlineMatchScreen> {
  Timer? _poller;
  Timer? _turnClock;
  int _turnSecondsRemaining = 20;
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

  String get _id => (widget.match['id'] ?? '').toString();
  bool get _hasValidId => RegExp(r'^[1-9][0-9]*$').hasMatch(_id);
  bool get _isEnglish => Localizations.localeOf(context).languageCode == 'en';

  int _remainingTurnSeconds(Map<String, dynamic> state) {
    final startedAt = DateTime.tryParse(state['turnStartedAt']?.toString() ?? '');
    if (startedAt == null) return 20;
    final elapsed = DateTime.now().difference(startedAt.toLocal()).inSeconds;
    return (20 - elapsed).clamp(0, 20).toInt();
  }

  void _tickTurnClock() {
    final state = _state;
    if (!mounted || state == null || _matchStatus != 'active' ||
        state['aiTakeoverActive'] == true) {
      return;
    }
    final next = _remainingTurnSeconds(state);
    if (next != _turnSecondsRemaining) {
      setState(() => _turnSecondsRemaining = next);
    }
  }

  @override
  void initState() {
    super.initState();
    MatchActivityState.setActivelyPlaying(
      ['waiting', 'active'].contains(widget.match['status']),
    );
    _matchDetails = Map<String, dynamic>.from(widget.match);
    if (_hasValidId) {
      _refresh();
      _poller = Timer.periodic(const Duration(seconds: 3), (_) => _refresh(silent: true));
      _turnClock = Timer.periodic(const Duration(seconds: 1), (_) => _tickTurnClock());
    } else {
      _error = 'شناسه اتاق بازی معتبر نیست. از فهرست بازی‌های آنلاین دوباره وارد شوید.';
    }
  }

  @override
  void dispose() {
    _poller?.cancel();
    _turnClock?.cancel();
    MatchActivityState.setActivelyPlaying(false);
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if (!_hasValidId) {
      if (mounted && !silent) {
        setState(() => _error = appText(context,
          'شناسه اتاق بازی معتبر نیست. از فهرست بازی‌های آنلاین دوباره وارد شوید.',
          'Invalid match ID. Reopen the room from the online lobby.'));
      }
      return;
    }
    if ((_busy && !silent) || _refreshing) return;
    _refreshing = true;
    final sequence = ++_refreshSequence;
    try {
      final match = await MatchService.get(_id);
      if (sequence != _refreshSequence) {
        return;
      }
      if (mounted) setState(() => _matchDetails = Map<String, dynamic>.from(match));
      if (match['status'] == 'active') {
        await MatchService.heartbeat(_id);
      }
      if (match['status'] == 'active' || match['status'] == 'finished') {
        final state = await MatchService.getState(_id);
        if (sequence != _refreshSequence) {
          return;
        }
        if (mounted) {
          setState(() {
            final previousVersion = (_state?['version'] as num?)?.toInt();
            final nextVersion = (state['version'] as num?)?.toInt();
            final turnChanged = _state != null && _state!['isMyTurn'] != state['isMyTurn'];
            final serverStateChanged = _state != null && previousVersion != nextVersion;
            // Pending local batch moves are only a preview. If another device,
            // a timeout takeover, or a completed game changed the authoritative
            // version/turn, discard the stale preview before accepting new input.
            if (serverStateChanged || turnChanged) {
              _pendingMoves.clear();
              _batchMode = false;
              _selectedFrom = null;
              _selectedDie = null;
              _fromBar = false;
            }
            _state = state;
            _turnSecondsRemaining = _remainingTurnSeconds(state);
            _matchStatus = match['status'].toString();
            _error = null;
            _connectionLost = false;
          });
        }
        MatchActivityState.setActivelyPlaying(
          ['waiting', 'active'].contains(match['status']),
        );
      } else if (mounted) {
        setState(() {
          _pendingMoves.clear();
          _batchMode = false;
          _selectedFrom = null;
          _selectedDie = null;
          _fromBar = false;
          _state = null;
          _turnSecondsRemaining = 20;
          _matchStatus = match['status']?.toString() ?? 'waiting';
          _error = null;
          _connectionLost = false;
        });
        MatchActivityState.setActivelyPlaying(false);
      }
    } catch (e) {
      if (sequence == _refreshSequence && mounted) {
        setState(() {
          _connectionLost = true;
          if (!silent) _error = appError(context, e);
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
      if (mounted) setState(() => _error = appError(context, e));
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
      if (mounted) setState(() => _error = appError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _closeEmptyRoom() async {
    if (_busy ||
        _matchStatus != 'waiting' ||
        _matchDetails['isHost'] != true ||
        _matchDetails['guestName'] != null) {
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(context, 'بستن اتاق بازی', 'Close waiting room')),
        content: Text(appText(
          context,
          'هنوز کسی به اتاق نپیوسته است. با بستن اتاق، دیگران نمی‌توانند وارد آن شوند.',
          'Nobody has joined this room yet. Closing it will prevent anyone else from joining.',
        )),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(appText(context, 'بازگشت', 'Keep room')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(appText(context, 'بستن اتاق', 'Close room')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await MatchService.cancel(_id);
      if (!mounted) return;
      _poller?.cancel();
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() => _error = appError(context, e));
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
            title: Text(appText(context, 'دعوت از دوست', 'Invite a friend')),
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
                child: Text(appText(context, 'انصراف', 'Cancel')),
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
              ? 'Invitation sent. It expires in 60 seconds; you can invite again afterward.'
              : 'دعوت ارسال شد. پس از ۶۰ ثانیه منقضی می‌شود و می‌توانید دوباره دعوت کنید.'),
        ));
      }
    } catch (e) {
      if (mounted) setState(() => _error = appError(context, e));
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
      if (mounted) setState(() => _error = appError(context, e));
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
        title: Text(appText(context, 'آمار رودررو', 'Head-to-head stats'), style: TextStyle(color: Theme.of(context).colorScheme.primary)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('$viewerName  $viewerPoints  -  $opponentPoints  $opponentName',
              textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold)),
            const SizedBox(height: 14),
            _headToHeadRow(appText(context, 'تعداد مسابقات رودررو', 'Matches played'), '$matches'),
            _headToHeadRow(appText(context, 'بردهای مسابقه', 'Match wins'), '$viewerWins - $opponentWins'),
            _headToHeadRow(appText(context, 'امتیاز دست‌ها', 'Game points'), '$viewerPoints - $opponentPoints'),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(appText(context, 'بستن', 'Close')))],
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
          title: Text(appText(context, 'تسلیم', 'Resign')),
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
      if (mounted) setState(() => _error = appError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _roll() async {
    if (_busy || _state == null) return;
    final languageCode = Localizations.localeOf(context).languageCode;
    setState(() { _busy = true; _error = null; });
    try {
      final next = await MatchService.roll(_id, (_state!['version'] as num).toInt());
      if (mounted) setState(() => _state = {...?_state, ...next});
      await _refresh(silent: true);
    } catch (e) {
      final message = appErrorForLanguage(languageCode, e);
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _endTurn() async {
    if (_busy || _state == null) return;
    final languageCode = Localizations.localeOf(context).languageCode;
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
      final message = appErrorForLanguage(languageCode, e);
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
    final languageCode = Localizations.localeOf(context).languageCode;
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
      final message = appErrorForLanguage(languageCode, e);
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
    if (!isMyTurn || _busy || _state == null) return;
    final hostTurn = _state?['isHost'] == true;
    final sign = hostTurn ? 1 : -1;
    final preview = _previewGameState();
    final ownBar = ((preview['bar'] as Map<String, int>)[hostTurn ? 'host' : 'guest'] ?? 0);
    if (ownBar > 0 || _fromBar) {
      final die = hostTurn ? 24 - point : point + 1;
      if (die < 1 || die > 6 || !remaining.contains(die)) {
        setState(() => _error = _isEnglish ? 'That point is not a legal bar entry for the remaining dice.' : 'این خانه با تاس‌های باقی‌مانده محل ورود قانونی از بار نیست.');
        return;
      }
      if (board[point].toInt() * sign <= -2) {
        setState(() => _error = _isEnglish ? 'The entry point is blocked.' : 'خانه ورود با دو مهره حریف بسته است.');
        return;
      }
      if (_batchMode) {
        await _stageMove(from: null, to: point, die: die);
      } else {
        await _submitMove(from: null, to: point, die: die);
      }
      return;
    }

    if (_selectedFrom == null) {
      if (board[point].toInt() * sign <= 0) {
        setState(() => _error = _isEnglish ? 'Select one of your own checkers.' : 'مهره‌ای از خودتان را انتخاب کنید.');
        return;
      }
      setState(() { _selectedFrom = point; _selectedDie = null; _error = null; });
      return;
    }
    if (_selectedFrom == point) {
      setState(() { _selectedFrom = null; _selectedDie = null; _error = null; });
      return;
    }

    final from = _selectedFrom!;
    final distance = hostTurn ? from - point : point - from;
    if (distance > 0 && distance <= 6 && remaining.contains(distance)) {
      if (board[point].toInt() * sign <= -2) {
        setState(() => _error = _isEnglish ? 'That point is blocked by two opponent checkers.' : 'این خانه با دو مهره حریف بسته است.');
        return;
      }
      if (_batchMode) {
        await _stageMove(from: from, to: point, die: distance);
      } else {
        await _submitMove(from: from, to: point, die: distance);
      }
      return;
    }

    final sequence = _findCumulativeOnlineMoves(
      from: from,
      destination: point,
      board: board.map((value) => value.toInt()).toList(),
      dice: remaining.map((value) => value.toInt()).toList(),
    );
    if (sequence != null && sequence.length > 1) {
      setState(() {
        _selectedFrom = null;
        _selectedDie = null;
        _error = null;
        _pendingMoves
          ..clear()
          ..addAll(sequence);
      });
      await _submitBatch();
      return;
    }
    setState(() => _error = _isEnglish ? 'No legal move reaches that point with the remaining dice.' : 'با تاس‌های باقی‌مانده حرکت قانونی به این خانه وجود ندارد.');
  }

  List<Map<String, int?>>? _findCumulativeOnlineMoves({
    required int from,
    required int destination,
    required List<int> board,
    required List<int> dice,
  }) {
    final hostTurn = _state?['isHost'] == true;
    final sign = hostTurn ? 1 : -1;
    List<Map<String, int?>>? search(
      int current,
      List<int> points,
      List<int> remainingDice,
      List<Map<String, int?>> path,
    ) {
      if (path.length >= dice.length) return null;
      for (var i = 0; i < remainingDice.length; i++) {
        final die = remainingDice[i];
        final next = hostTurn ? current - die : current + die;
        if (next < 0 || next > 23 || points[next] * sign <= -2) continue;
        final nextPoints = List<int>.from(points);
        nextPoints[current] -= sign;
        if (nextPoints[next] * sign < 0) nextPoints[next] = 0;
        nextPoints[next] += sign;
        final nextPath = [...path, <String, int?>{'from': current, 'to': next, 'die': die}];
        if (next == destination && nextPath.length > 1) return nextPath;
        final nextDice = List<int>.from(remainingDice)..removeAt(i);
        final found = search(next, nextPoints, nextDice, nextPath);
        if (found != null) return found;
      }
      return null;
    }
    if (from < 0 || from > 23 || destination < 0 || destination > 23 ||
        board[from] * sign <= 0) return null;
    return search(from, board, List<int>.from(dice), const []);
  }

  Future<void> _tapBearOff(List<num> board, List<num> remaining, bool isMyTurn) async {
    if (!isMyTurn || _busy || _selectedFrom == null || _state == null) return;
    final from = _selectedFrom!;
    final hostTurn = _state?['isHost'] == true;
    final sign = hostTurn ? 1 : -1;
    final points = board.map((value) => value.toInt()).toList();
    final inHome = hostTurn ? from <= 5 : from >= 18;
    final allHome = points.asMap().entries.every((entry) =>
      hostTurn ? entry.key <= 5 || entry.value <= 0 : entry.key >= 18 || entry.value >= 0);
    final distance = hostTurn ? from + 1 : 24 - from;
    final clear = hostTurn
      ? !points.asMap().entries.any((entry) => entry.key > from && entry.key <= 5 && entry.value > 0)
      : !points.asMap().entries.any((entry) => entry.key < from && entry.key >= 18 && entry.value < 0);
    if (points[from] * sign <= 0 || !inHome || !allHome) {
      setState(() => _error = _isEnglish ? 'All checkers must be in your home board before bearing off.' : 'برای خارج کردن مهره، ابتدا همه مهره‌ها باید در خانه خودی باشند.');
      return;
    }
    final candidates = remaining.map((value) => value.toInt()).where((die) =>
      die == distance || (die > distance && !clear)).toList()..sort();
    if (candidates.isEmpty) {
      setState(() => _error = _isEnglish ? 'No remaining die can bear off this checker.' : 'با تاس‌های باقی‌مانده نمی‌توان این مهره را خارج کرد.');
      return;
    }
    await _submitMove(from: from, to: null, die: candidates.first);
  }


  Future<void> _submitMove({required int? from, required int? to, required int die}) async {
    if (_busy || _state == null) return;
    final languageCode = Localizations.localeOf(context).languageCode;
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
      final message = appErrorForLanguage(languageCode, e);
      await _refresh(silent: true);
      if (mounted) setState(() => _error = message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Widget> _buildRoomControlItems(BuildContext sheetContext) {
    final isEnglish = _isEnglish;
    return [
                Text(
                  isEnglish ? 'Room controls' : 'مدیریت اتاق',
                style: Theme.of(sheetContext).textTheme.titleLarge?.copyWith(
                  color: Theme.of(sheetContext).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
            if (_matchStatus == 'waiting' && _matchDetails['isHost'] == true)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _inviteFriend,
                      icon: const Icon(Icons.person_add_alt_1),
                      label: Text(isEnglish ? 'Invite / invite again' : 'دعوت یا دعوت مجدد'),
                    ),
                    if (_matchDetails['guestName'] == null)
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _closeEmptyRoom,
                        icon: const Icon(Icons.meeting_room_outlined),
                        label: Text(isEnglish ? 'Close empty room' : 'بستن اتاق خالی'),
                        style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error),
                      ),
                  ],
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
                        : appText(context, 'خلاصه: ${_matchDetails['matchToWin'] ?? 1} برد', 'Best of ${_matchDetails['matchToWin'] ?? 1}'),
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
                        : appText(context, 'فقط دوستان پذیرفته‌شدهٔ یکی از دو بازیکن می‌توانند تماشا کنند؛ تماشاگر فقط امکان مشاهده دارد.', 'Only accepted friends of either player may watch; spectators can only observe.'),
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
    ];
  }

  @override
  Widget build(BuildContext context) {
    final dice = (_state?['dice'] as List?)?.cast<num>() ?? const <num>[];
    final rawRemaining = (_state?['remainingDice'] as List?)?.cast<num>() ?? const <num>[];
    final preview = _previewGameState();
    final boardPoints = (preview['board'] as List<int>).map<num>((v) => v).toList();
    final remaining = [...rawRemaining];
    for (final move in _pendingMoves) {
      final die = move['die'];
      if (die != null) remaining.remove(die);
    }
    final isMyTurn = _state?['isMyTurn'] == true;
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final aiTakeoverActive = _state?['aiTakeoverActive'] == true;
    final canAct = isMyTurn && !aiTakeoverActive;
    final turnTimerText = _matchStatus == 'active' && _state != null && !aiTakeoverActive
        ? '${_turnSecondsRemaining}s'
        : null;
    final timerWhite = (_state?['isHost'] == true) == isMyTurn;
    final bar = preview['bar'] as Map<String, int>;
    final off = preview['off'] as Map<String, int>;
    final ownBar = (bar[_state?['isHost'] == true ? 'host' : 'guest'] ?? 0);
    final hostName = _matchDetails['hostName']?.toString() ?? (isEnglish ? 'Host' : 'میزبان');
    final guestName = _matchDetails['guestName']?.toString() ?? (isEnglish ? 'Waiting…' : 'در انتظار حریف');
    final legalTargets = <int>{};
    if (canAct && _state != null) {
      final hostTurn = _state?['isHost'] == true;
      final sign = hostTurn ? 1 : -1;
      if (ownBar > 0 || _fromBar) {
        for (final die in remaining) {
          final target = hostTurn ? 24 - die.toInt() : die.toInt() - 1;
          if (target >= 0 && target < 24 && boardPoints[target].toInt() * sign > -2) legalTargets.add(target);
        }
      } else if (_selectedFrom != null) {
        for (final die in remaining) {
          final target = hostTurn ? _selectedFrom! - die.toInt() : _selectedFrom! + die.toInt();
          if (target >= 0 && target < 24 && boardPoints[target].toInt() * sign > -2) legalTargets.add(target);
        }
      }
    }
    void openMatchChat() {
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        backgroundColor: Theme.of(context).colorScheme.surface,
        builder: (_) => OnlineMatchChatSheet(matchId: _id, isEnglish: isEnglish),
      );
    }
    return Directionality(
      textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          toolbarHeight: 48,
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.primary,
          title: Row(
            children: [
              Expanded(child: Text('@$hostName', maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Text('·', style: TextStyle(color: Theme.of(context).colorScheme.primary)),
              ),
              Expanded(child: Text('@$guestName', maxLines: 1, overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
            ],
          ),
          actions: [
            if (_matchStatus == 'active' || _matchStatus == 'finished')
              IconButton(
                tooltip: isEnglish ? 'Match chat' : 'گفت‌وگوی مسابقه',
                onPressed: openMatchChat,
                icon: const Icon(Icons.forum_outlined),
              ),
            if (_matchStatus == 'active')
              OnlineMatchVoiceControl(matchId: _id, isEnglish: isEnglish),
            RoomControlsMenuButton(
              tooltip: isEnglish ? 'Match controls' : 'مدیریت مسابقه',
              itemsBuilder: _buildRoomControlItems,
            ),
          ],
        ),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final landscape = constraints.maxWidth > constraints.maxHeight;
              final boardWidget = _state == null
                ? Center(child: Text(
                    isEnglish ? 'Waiting for your opponent…' : 'در انتظار ورود حریف…',
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                  ))
                : OnlineBackgammonBoard(
                    points: boardPoints,
                    selectedPoint: _selectedFrom,
                    legalTargets: legalTargets,
                    barWhite: bar['host'] ?? 0,
                    barBlack: bar['guest'] ?? 0,
                    offWhite: off['host'] ?? 0,
                    offBlack: off['guest'] ?? 0,
                    dice: dice.map((value) => value.toInt()).toList(),
                    timerText: turnTimerText,
                    timerWhite: timerWhite,
                    rollLabel: isEnglish ? 'Roll dice' : 'ریختن تاس',
                    onRoll: _busy || _matchStatus != 'active' || !canAct || dice.isNotEmpty ? null : _roll,
                    onPointTap: (point) => _tapPoint(point, boardPoints, remaining, canAct),
                    onBearOff: () => _tapBearOff(boardPoints, remaining, canAct),
                  );
              final alerts = <Widget>[
                if (_connectionLost)
                  Text(
                    isEnglish ? 'Connection unstable — reconnecting…' : 'اتصال ناپایدار است؛ تلاش برای اتصال مجدد…',
                    style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                if (aiTakeoverActive)
                  Text(
                    isEnglish ? 'Temporary AI control is active.' : 'کنترل موقت هوش مصنوعی فعال است.',
                    style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                if (_error != null)
                  Text(appError(context, _error), style: const TextStyle(color: Colors.redAccent), textAlign: TextAlign.center),
              ];
              final actionBar = landscape ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton.filledTonal(
                    tooltip: isEnglish ? 'Match chat' : 'گفت‌وگوی مسابقه',
                    onPressed: _matchStatus == 'active' || _matchStatus == 'finished' ? openMatchChat : null,
                    icon: const Icon(Icons.forum_outlined),
                  ),
                  const SizedBox(height: 10),
                  IconButton.filledTonal(
                    tooltip: isEnglish ? 'End turn when no legal moves remain' : 'پایان نوبت در صورت نبود حرکت قانونی',
                    onPressed: _busy || !canAct || remaining.isEmpty ? null : _endTurn,
                    icon: const Icon(Icons.skip_next_rounded),
                  ),
                  const SizedBox(height: 10),
                  IconButton(
                    tooltip: isEnglish ? 'Reconnect' : 'اتصال مجدد',
                    onPressed: _refreshing ? null : () => _refresh(),
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ) : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton.filledTonal(
                    tooltip: isEnglish ? 'Match chat' : 'گفت‌وگوی مسابقه',
                    onPressed: _matchStatus == 'active' || _matchStatus == 'finished' ? openMatchChat : null,
                    icon: const Icon(Icons.forum_outlined),
                  ),
                  const SizedBox(width: 12),
                  IconButton.filledTonal(
                    tooltip: isEnglish ? 'End turn when no legal moves remain' : 'پایان نوبت در صورت نبود حرکت قانونی',
                    onPressed: _busy || !canAct || remaining.isEmpty ? null : _endTurn,
                    icon: const Icon(Icons.skip_next_rounded),
                  ),
                  const SizedBox(width: 12),
                  IconButton(
                    tooltip: isEnglish ? 'Reconnect' : 'اتصال مجدد',
                    onPressed: _refreshing ? null : () => _refresh(),
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              );
              if (landscape && _state != null) {
                return Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(child: boardWidget),
                      const SizedBox(width: 10),
                      SizedBox(
                        width: 74,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            RoyalAvatar(dataUrl: _matchDetails['hostAvatarDataUrl']?.toString(), radius: 22),
                            Text('@$hostName', maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 11)),
                            const Divider(),
                            RoyalAvatar(dataUrl: _matchDetails['guestAvatarDataUrl']?.toString(), radius: 22),
                            Text('@$guestName', maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 11)),
                            actionBar,
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }
              return ListView(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                children: [
                  if (alerts.isNotEmpty) ...alerts,
                  if (_state != null)
                    Row(
                      children: [
                        Expanded(child: Row(children: [
                          RoyalAvatar(dataUrl: _matchDetails['hostAvatarDataUrl']?.toString(), radius: 18),
                          const SizedBox(width: 7),
                          Expanded(child: Text('@$hostName', maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w700))),
                        ])),
                        const SizedBox(width: 8),
                        Expanded(child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          Expanded(child: Text('@$guestName', maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.end,
                            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w700))),
                          const SizedBox(width: 7),
                          RoyalAvatar(dataUrl: _matchDetails['guestAvatarDataUrl']?.toString(), radius: 18),
                        ])),
                      ],
                    ),
                  const SizedBox(height: 8),
                  if (_state != null)
                    AspectRatio(
                      aspectRatio: .92,
                      child: boardWidget,
                    )
                  else
                    SizedBox(height: 280, child: boardWidget),
                  const SizedBox(height: 6),
                  actionBar,
                  if (_matchStatus == 'waiting' && _matchDetails['guestName'] != null)
                    Text(
                      isEnglish ? 'Waiting for both players to confirm and start.' : 'در انتظار تأیید و شروع توسط هر دو بازیکن.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}


/// Online wrapper around the same shared board used by offline practice.
class OnlineBackgammonBoard extends StatelessWidget {
  final List<num> points;
  final int? selectedPoint;
  final Set<int> legalTargets;
  final ValueChanged<int> onPointTap;
  final VoidCallback? onBearOff;
  final int barWhite, barBlack, offWhite, offBlack;
  final List<int> dice;
  final String? timerText;
  final bool timerWhite;
  final String rollLabel;
  final VoidCallback? onRoll;

  const OnlineBackgammonBoard({
    super.key,
    required this.points,
    required this.onPointTap,
    this.selectedPoint,
    this.legalTargets = const <int>{},
    this.onBearOff,
    this.barWhite = 0,
    this.barBlack = 0,
    this.offWhite = 0,
    this.offBlack = 0,
    this.dice = const <int>[],
    this.timerText,
    this.timerWhite = true,
    this.rollLabel = 'Roll',
    this.onRoll,
  });

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: MediaQuery.orientationOf(context) == Orientation.landscape ? 1.55 : .92,
    child: RoyalBackgammonBoard(
      points: points,
      selectedPoint: selectedPoint,
      legalTargets: legalTargets,
      onBearOff: onBearOff,
      barWhite: barWhite,
      barBlack: barBlack,
      offWhite: offWhite,
      offBlack: offBlack,
      dice: dice,
      timerText: timerText,
      timerWhite: timerWhite,
      rollLabel: rollLabel,
      onRoll: onRoll,
      onPointTap: onPointTap,
    ),
  );
}


