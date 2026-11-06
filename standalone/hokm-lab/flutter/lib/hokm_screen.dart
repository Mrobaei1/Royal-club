import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'l10n/app_text.dart';
import 'services/hokm_service.dart';
import 'hokm_manager_review_screen.dart';

class HokmScreen extends StatefulWidget {
  final HokmApi api;
  final Future<String?> Function() identityLoader;
  final bool managerAccess;
  const HokmScreen({super.key, required this.api, required this.identityLoader, this.managerAccess = false});
  @override
  State<HokmScreen> createState() => _HokmScreenState();
}

class _HokmScreenState extends State<HokmScreen> with WidgetsBindingObserver {
  late final HokmApi _api = widget.api;
  final _roomCode = TextEditingController();
  final _chatController = TextEditingController();
  String? _chatRecipientUserId;
  Timer? _pollTimer;
  Timer? _finalRevealTimer;
  bool _finalRevealActive = false;
  Map<String, dynamic>? _room;
  String? _userId;
  String? _error;
  int _target = 7;
  bool _busy = false;
  bool _pollBusy = false;
  bool _background = false;
  int _serverClockOffsetMs = 0;

  String t(String fa, String en) => appText(context, fa, en);
  bool get _english => Localizations.localeOf(context).languageCode == 'en';
  String get _roomId => (_room?['roomId'] ?? '').toString();
  int get _version => (_room?['version'] as num?)?.toInt() ?? 0;
  String get _status => (_room?['status'] ?? 'waiting').toString();
  bool get _host => _userId != null && _room?['hostUserId']?.toString() == _userId;
  bool get _hostUnavailable {
    final hostId = _room?['hostUserId']?.toString();
    if (hostId == null) return false;
    final hosts = _players.where((player) => player['userId']?.toString() == hostId).toList();
    return hosts.isEmpty || hosts.first['connected'] != true || hosts.first['forfeited'] == true;
  }
  List<Map<String, dynamic>> get _players {
    final list = _room?['players'];
    if (list is! List) return [];
    return list.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }
  Map<String, dynamic>? _playerAtSeat(int seat) {
    for (final player in _players) {
      if ((player['seat'] as num?)?.toInt() == seat) return player;
    }
    return null;
  }
  Map<String, dynamic>? get _me {
    for (final player in _players) {
      if (player['userId']?.toString() == _userId) return player;
    }
    return null;
  }
  int? get _mySeat => (_me?['seat'] as num?)?.toInt();
  bool get _ready => _me?['ready'] == true;
  int get _serverNow => DateTime.now().millisecondsSinceEpoch + _serverClockOffsetMs;
  int _secondsLeft(Object? deadline) => deadline is num
      ? ((deadline.toInt() - _serverNow) / 1000).ceil().clamp(0, 99).toInt()
      : 0;
  Map<String, dynamic>? get _game {
    final game = _room?['game'];
    return game is Map ? Map<String, dynamic>.from(game) : null;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadIdentity();
  }

  Future<void> _loadIdentity() async {
    try {
      final id = await widget.identityLoader();
      if (!mounted) return;
      setState(() => _userId = id);
    } catch (error) { _showError(error); }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pollTimer?.cancel();
    _finalRevealTimer?.cancel();
    _roomCode.dispose();
    _chatController.dispose();
    if (_roomId.isNotEmpty && ['playing', 'round_completed'].contains(_status) && !_background) {
      unawaited(_api.disconnect(_roomId, _version).catchError((_) => <String, dynamic>{}));
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_roomId.isEmpty || !['playing', 'round_completed'].contains(_status)) return;
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _background = true;
      unawaited(_disconnectInBackground());
    } else if (state == AppLifecycleState.resumed && _background) {
      _background = false;
      unawaited(_reconnectInBackground());
    }
  }

  Future<void> _disconnectInBackground() async {
    try { final room = await _api.disconnect(_roomId, _version); _accept(room); } catch (_) {}
  }

  Future<void> _reconnectInBackground() async {
    try {
      final room = await _api.reconnect(_roomId, _version);
      _accept(room);
      await _refresh();
    } catch (error) { _showError(error); }
  }

  void _accept(Map<String, dynamic> room) {
    if (!mounted) return;
    final serverNow = (room['serverNow'] as num?)?.toInt();
    if (serverNow != null) _serverClockOffsetMs = serverNow - DateTime.now().millisecondsSinceEpoch;
    setState(() { _room = room; _error = null; });
    _finalRevealTimer?.cancel();
    _finalRevealTimer = null;
    final revealUntil = room['handRevealUntil'] as num?;
    final revealDurationMs = revealUntil != null && serverNow != null
        ? (revealUntil.toInt() - serverNow).clamp(0, 3000)
        : 0;
    _finalRevealActive = room['status'] == 'completed' &&
        revealDurationMs > 0 && room['revealedHands'] is List;
    if (_finalRevealActive) {
      // Use the server-provided remaining duration, not the device wall clock.
      _finalRevealTimer = Timer(Duration(milliseconds: revealDurationMs), () {
        if (!mounted) return;
        setState(() {
          _finalRevealActive = false;
          _finalRevealTimer = null;
        });
      });
    }
    if (['completed', 'cancelled', 'expired'].contains(room['status'])) {
      _pollTimer?.cancel();
      _pollTimer = null;
    } else if (_roomId.isNotEmpty && _pollTimer == null) {
      _pollTimer = Timer.periodic(const Duration(milliseconds: 500), (_) => _refresh());
    }
  }

  void _showError(Object error) {
    if (!mounted) return;
    setState(() => _error = appError(context, error));
  }

  Future<void> _refresh() async {
    if (_pollBusy || _busy || _roomId.isEmpty || _background) return;
    _pollBusy = true;
    try {
      final latest = await _api.viewRoom(_roomId);
      if (!mounted) return;
      if (_room?['version'] != latest['version'] ||
          _room?['handRevealUntil'] != latest['handRevealUntil'] ||
          _room?['status'] != latest['status']) {
        _accept(latest);
      } else if (mounted) {
        setState(() {});
      }
    } catch (error) {
      if (_error == null) _showError(error);
    } finally { _pollBusy = false; }
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() action) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try { _accept(await action()); }
    catch (error) { _showError(error); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _create() => _run(() => _api.createRoom(matchTarget: _target, privateRoom: false));

  Future<void> _join() {
    final code = _roomCode.text.trim();
    if (code.isEmpty) { _showError(t('کد اتاق را وارد کنید.', 'Enter a room code.')); return Future.value(); }
    return _run(() => _api.joinRoom(code));
  }

  Future<void> _readyAction() => _run(() => _api.setReady(_roomId, !_ready, _version));
  Future<void> _start() => _run(() => _api.startMatch(_roomId, _version));
  Future<void> _nextRound() => _run(() => _api.startNextRound(_roomId, _version));
  Future<void> _cancelVote() => _run(() => _api.voteCancel(_roomId, true, _version));
  Future<void> _play(Map<String, dynamic> card) =>
      _run(() => _api.sendCommand(_roomId, {'type': 'play_card', 'card': card}, _version));
  Future<void> _trump(String suit) =>
      _run(() => _api.sendCommand(_roomId, {'type': 'choose_trump', 'suit': suit}, _version));

  Future<void> _sendChatMessage() async {
    final opponents = _opponents;
    final recipient = _chatRecipientUserId ?? (opponents.isEmpty ? null : opponents.first['userId']?.toString());
    final message = _chatController.text.trim();
    if (recipient == null || message.isEmpty || _busy) return;
    await _run(() => _api.sendChatMessage(
      _roomId, recipient, message,
      'hokm-chat-${DateTime.now().microsecondsSinceEpoch}', _version,
    ));
    if (mounted) _chatController.clear();
  }

  List<Map<String, dynamic>> get _opponents {
    final seat = _mySeat;
    if (seat == null) return [];
    return _players.where((player) {
      final otherSeat = (player['seat'] as num?)?.toInt();
      return player['userId']?.toString() != _userId &&
          otherSeat != null && otherSeat % 2 != seat % 2 &&
          player['forfeited'] != true;
    }).toList();
  }

  Future<void> _exitTemporarily() async {
    if (_roomId.isEmpty || _busy) return;
    _background = true;
    try {
      final room = await _api.disconnect(_roomId, _version);
      _accept(room);
      if (mounted) await Navigator.maybePop(context);
    } catch (error) {
      _background = false;
      _showError(error);
    }
  }

  Future<void> _leave() async {
    if (_roomId.isEmpty) return;
    try {
      if (_status == 'waiting' || ['completed', 'cancelled', 'expired'].contains(_status)) {
        // Waiting-room departure cancels the room; terminal-room departure
        // releases this seat so empty-room cleanup can complete.
        await _api.leaveRoom(_roomId, _version);
      } else if (['playing', 'round_completed'].contains(_status)) {
        // Leaving the screen during a live match is a transient disconnect,
        // not a permanent forfeit or seat release.
        await _api.disconnect(_roomId, _version);
      }
    } catch (error) {
      // In particular, a completed player cannot exit until the final
      // three-second hand reveal has ended.
      _showError(error);
      return;
    }
    if (!mounted) return;
    _pollTimer?.cancel();
    _pollTimer = null;
    _finalRevealTimer?.cancel();
    _finalRevealTimer = null;
    _finalRevealActive = false;
    setState(() { _room = null; _roomCode.clear(); });
  }

  Future<void> _report(String userId) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      title: Text(t('گزارش تخلف', 'Report player')),
      content: TextField(controller: controller, minLines: 2, maxLines: 4,
        decoration: InputDecoration(hintText: t('شرح تخلف (حداقل ۱۰ نویسه)', 'Describe the issue (at least 10 characters)'))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('انصراف', 'Cancel'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: Text(t('ارسال', 'Submit'))),
      ],
    ));
    controller.dispose();
    if (reason == null || reason.length < 10 || !mounted) return;
    await _run(() => _api.reportPlayer(_roomId, userId, reason, _version));
  }

  Future<void> _appeal() async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(context: context, builder: (ctx) => AlertDialog(
      title: Text(t('اعتراض به نتیجه', 'Appeal result')),
      content: TextField(controller: controller, minLines: 2, maxLines: 4,
        decoration: InputDecoration(hintText: t('دلیل اعتراض (حداقل ۱۰ نویسه)', 'Reason (at least 10 characters)'))),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('انصراف', 'Cancel'))),
        FilledButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: Text(t('ثبت', 'Submit'))),
      ],
    ));
    controller.dispose();
    if (reason == null || reason.length < 10 || !mounted) return;
    await _run(() => _api.submitAppeal(_roomId, reason, _version));
  }

  String _seatName(int seat) => (_english
      ? ['North', 'East', 'South', 'West']
      : ['بالا', 'راست', 'پایین', 'چپ'])[seat % 4];
  String _suit(String value) => switch (value) {
    'clubs' => '♣', 'diamonds' => '♦', 'hearts' => '♥', 'spades' => '♠', _ => '?'
  };
  Color _suitColor(String value) =>
      value == 'hearts' || value == 'diamonds' ? const Color(0xFFE45A69) : const Color(0xFF1C2638);
  String _cardLabel(Map<String, dynamic> card) =>
      '${card['rank']}${_suit(card['suit']?.toString() ?? '')}';

  Widget _playingCard(Map<String, dynamic> card, {bool enabled = false, VoidCallback? onTap}) {
    final suit = card['suit']?.toString() ?? '';
    return InkWell(
      onTap: enabled && !_busy ? onTap : null,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 48, height: 68, margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F2E9),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: enabled ? const Color(0xFFD8B45A) : Colors.black12, width: enabled ? 2 : 1),
          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 3, offset: Offset(0, 2))],
        ),
        alignment: Alignment.center,
        child: Text(_cardLabel(card), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: _suitColor(suit))),
      ),
    );
  }

  Widget _panel(Widget child) => Container(
    width: double.infinity, padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: .25)),
    ),
    child: child,
  );

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: _english ? TextDirection.ltr : TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(
        title: Text(t('بازی حکم', 'Hokm')),
        actions: [
          if (widget.managerAccess && _roomId.isNotEmpty) IconButton(
            tooltip: t('بررسی مدیریت', 'Manager review'),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => HokmManagerReviewScreen(api: _api, roomId: _roomId),
            )),
            icon: const Icon(Icons.admin_panel_settings_outlined),
          ),
          if (_roomId.isNotEmpty) IconButton(
            tooltip: t('کپی کد اتاق', 'Copy room code'),
            onPressed: () => Clipboard.setData(ClipboardData(text: _roomId)),
            icon: const Icon(Icons.copy_rounded),
          ),
        ],
      ),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        if (_error != null) _panel(Row(children: [
          const Icon(Icons.error_outline, color: Colors.redAccent),
          const SizedBox(width: 8),
          Expanded(child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
          IconButton(onPressed: () => setState(() => _error = null), icon: const Icon(Icons.close)),
        ])),
        if (_room == null) _lobby()
        else if (_status == 'waiting') _waitingRoom()
        else _match(),
        if (_busy) const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
      ])),
    ),
  );

  Widget _lobby() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    _panel(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(t('ساخت مسابقه جدید', 'Create a match'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      const SizedBox(height: 12),
      DropdownButtonFormField<int>(
        initialValue: _target,
        decoration: InputDecoration(labelText: t('تعداد دست‌های لازم برای برد', 'Hands required to win')),
        items: [3, 5, 7].map((value) => DropdownMenuItem(value: value, child: Text('$value'))).toList(),
        onChanged: _busy ? null : (value) { if (value != null) setState(() => _target = value); },
      ),
      const SizedBox(height: 12),
      FilledButton.icon(onPressed: _busy || _userId == null ? null : _create,
        icon: const Icon(Icons.add_circle_outline), label: Text(t('ساخت اتاق حکم', 'Create Hokm room'))),
    ])),
    const SizedBox(height: 14),
    _panel(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(t('ورود به اتاق', 'Join a room'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      TextField(controller: _roomCode, decoration: InputDecoration(labelText: t('کد اتاق', 'Room code'))),
      const SizedBox(height: 10),
      OutlinedButton.icon(onPressed: _busy || _userId == null ? null : _join,
        icon: const Icon(Icons.login), label: Text(t('ورود', 'Join'))),
    ])),
    const SizedBox(height: 12),
    Text(t('حکم بازی چهار نفره است و مسابقه با ۳، ۵ یا ۷ دست برنده پایان می‌یابد.',
      'Hokm is a four-player game. A match ends after 3, 5 or 7 winning hands.'), textAlign: TextAlign.center),
  ]);

  Widget _waitingRoom() => _panel(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    Text(t('اتاق انتظار', 'Waiting room'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
    const SizedBox(height: 6),
    SelectableText(_roomId, textAlign: TextAlign.center,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 1)),
    Text(t('کد اتاق را برای سه بازیکن دیگر ارسال کنید.', 'Share this code with the other three players.'), textAlign: TextAlign.center),
    const Divider(height: 24),
    ...List.generate(4, (seat) {
      final player = _playerAtSeat(seat);
      return ListTile(
        leading: CircleAvatar(child: Text((seat + 1).toString())),
        title: Text(player == null ? t('صندلی خالی', 'Empty seat') : '${_seatName(seat)} • ${player['userId']}'),
        subtitle: Text(player == null ? t('منتظر بازیکن', 'Waiting for player') :
          player['ready'] == true ? t('آماده', 'Ready') : t('هنوز آماده نیست', 'Not ready')),
        trailing: Icon(player?['connected'] == true ? Icons.circle : Icons.circle_outlined,
          color: player?['connected'] == true ? Colors.green : Colors.grey, size: 13),
      );
    }),
    if (_me != null) FilledButton(
      onPressed: _busy ? null : _readyAction,
      child: Text(_ready ? t('لغو آمادگی', 'Not ready') : t('آماده‌ام', 'I am ready')),
    ),
    if (_host) FilledButton.icon(
      onPressed: _busy || _players.length != 4 || _players.any((p) => p['ready'] != true) ? null : _start,
      icon: const Icon(Icons.play_arrow), label: Text(t('شروع مسابقه', 'Start match')),
    ),
    OutlinedButton(onPressed: _busy ? null : _leave, child: Text(t('خروج از اتاق', 'Leave room'))),
  ]));

  Widget _match() {
    final game = _game;
    final score = (_room?['matchScore'] as List?) ?? const [0, 0];
    if (_status == 'completed' || _status == 'cancelled') {
      final revealed = _status == 'completed' && _finalRevealActive
          ? (_room?['revealedHands'] as List?)
          : null;
      return _panel(Column(children: [
        Icon(_status == 'completed' ? Icons.emoji_events : Icons.cancel_outlined,
          size: 48, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 8),
        Text(_status == 'completed' ? t('مسابقه پایان یافت', 'Match completed') : t('مسابقه لغو شد', 'Match cancelled'),
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
        Text('${score[0]}  -  ${score[1]}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
        if (_status == 'completed') OutlinedButton(onPressed: _busy ? null : _appeal, child: Text(t('اعتراض به نتیجه', 'Appeal result'))),
        if (revealed != null) ...[
          const SizedBox(height: 10),
          Text(t('کارت‌های باقی‌ماندهٔ پایان دست', 'Remaining cards at hand end'),
            style: const TextStyle(fontWeight: FontWeight.w800)),
          ...List.generate(revealed.length, (seat) {
            final cards = (revealed[seat] as List? ?? const [])
                .whereType<Map>()
                .map((card) => Map<String, dynamic>.from(card))
                .toList();
            return ListTile(
              dense: true,
              title: Text(_seatName(seat)),
              subtitle: Text(cards.map(_cardLabel).join('  ')),
            );
          }),
        ],
        if (_finalRevealActive)
          Text(t('کارت‌های پایانی به مدت سه ثانیه نمایش داده می‌شوند', 'Final cards remain visible for three seconds')),
        TextButton(
          onPressed: _busy || _finalRevealActive ? null : _leave,
          child: Text(t('بازگشت', 'Back')),
        ),
      ]));
    }
    if (game == null) return _panel(Text(t('در انتظار وضعیت بازی...', 'Waiting for game state...')));
    final mySeat = _mySeat;
    final currentSeat = (game['currentSeat'] as num?)?.toInt();
    final hakemSeat = (game['hakemSeat'] as num?)?.toInt();
    final phase = game['phase']?.toString() ?? '';
    final ownHand = (game['ownHand'] as List? ?? const [])
      .whereType<Map>().map((card) => Map<String, dynamic>.from(card)).toList();
    final trick = (game['currentTrick'] as List? ?? const [])
      .whereType<Map>().map((play) => Map<String, dynamic>.from(play)).toList();
    final reveal = _room?['revealedHands'] as List?;
    final turnLeft = _secondsLeft(_room?['turnDeadlineAt']);
    final canPlay = phase == 'playing' && mySeat != null && currentSeat == mySeat;
    final canChoose = phase == 'choose_trump' && mySeat != null && hakemSeat == mySeat;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _panel(Column(children: [
        Text(t('امتیاز مسابقه', 'Match score'), style: const TextStyle(fontWeight: FontWeight.w800)),
        Text('${score[0]}  -  ${score[1]}', style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
        Text(t('تیم‌ها: صندلی‌های ۱ و ۳ در برابر ۲ و ۴', 'Teams: seats 1 & 3 versus 2 & 4')),
      ])),
      const SizedBox(height: 10),
      _panel(Column(children: List.generate(4, (seat) {
        final player = _playerAtSeat(seat);
        final active = seat == currentSeat;
        return ListTile(
          dense: true,
          leading: CircleAvatar(
            backgroundColor: active ? const Color(0xFFD8B45A) : null,
            child: Text((seat + 1).toString(), style: TextStyle(color: active ? Colors.black : null)),
          ),
          title: Text(player == null ? _seatName(seat) : '${_seatName(seat)} • ${player['userId']}'),
          subtitle: Text(player?['botControlled'] == true ? t('ربات موقت', 'Temporary AI') :
            player?['connected'] == true ? t('متصل', 'Connected') : t('قطع ارتباط', 'Disconnected')),
          trailing: player != null && player['userId']?.toString() != _userId
            ? IconButton(tooltip: t('گزارش', 'Report'), icon: const Icon(Icons.flag_outlined),
                onPressed: () => _report(player['userId'].toString()))
            : null,
        );
      }))),
      const SizedBox(height: 10),
      _panel(Column(children: [
        Text(phase == 'choose_trump' ? t('حاکم باید حکم را انتخاب کند', 'Hakem chooses trump') :
          t('نوبت: ${currentSeat == null ? '-' : _seatName(currentSeat)}', 'Turn: ${currentSeat == null ? '-' : _seatName(currentSeat)}'),
          style: const TextStyle(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        if (canChoose) Wrap(
          alignment: WrapAlignment.center, spacing: 8,
          children: ['clubs', 'diamonds', 'hearts', 'spades'].map((suit) => FilledButton(
            onPressed: _busy ? null : () => _trump(suit),
            child: Text(_suit(suit), style: TextStyle(fontSize: 24, color: _suitColor(suit))),
          )).toList(),
        ),
        if (phase == 'choose_trump' || phase == 'playing')
          Text(t('زمان باقی‌مانده: $turnLeft ثانیه', 'Time remaining: $turnLeft s'),
            style: TextStyle(fontWeight: FontWeight.w800,
              color: turnLeft <= 2 ? Colors.redAccent : Theme.of(context).colorScheme.primary)),
        if (game['trumpSuit'] != null)
          Text('${t('حکم', 'Trump')}: ${_suit(game['trumpSuit'].toString())}',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        Wrap(
          alignment: WrapAlignment.center,
          children: trick.map((play) {
            final card = Map<String, dynamic>.from(play['card'] as Map);
            final seat = (play['seat'] as num).toInt();
            return Column(mainAxisSize: MainAxisSize.min, children: [
              _playingCard(card),
              Text(_seatName(seat), style: const TextStyle(fontSize: 10)),
            ]);
          }).toList(),
        ),
        if (reveal != null) ...[
          const Divider(),
          Text(t('نمایش کارت‌های باقی‌مانده • ${_secondsLeft(_room?['handRevealUntil'])} ثانیه', 'Remaining cards reveal • ${_secondsLeft(_room?['handRevealUntil'])}s'), style: const TextStyle(fontWeight: FontWeight.bold)),
          ...List.generate(reveal.length, (seat) {
            final hand = (reveal[seat] as List? ?? const []).whereType<Map>()
              .map((card) => Map<String, dynamic>.from(card)).toList();
            return Row(children: [
              SizedBox(width: 54, child: Text(_seatName(seat), style: const TextStyle(fontSize: 11))),
              Expanded(child: SingleChildScrollView(scrollDirection: Axis.horizontal,
                child: Row(children: hand.map((card) => _playingCard(card)).toList()))),
            ]);
          }),
        ],
      ])),
      const SizedBox(height: 10),
      _panel(Column(children: [
        Text(t('کارت‌های دست شما', 'Your hand'), style: const TextStyle(fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        Wrap(
          alignment: WrapAlignment.center,
          children: ownHand.map((card) => _playingCard(card, enabled: canPlay,
            onTap: () => _play(card))).toList(),
        ),
        if (!canPlay && !canChoose) Text(t('منتظر نوبت خود باشید.', 'Wait for your turn.'), style: const TextStyle(fontSize: 12)),
      ])),
      if (_opponents.isNotEmpty) ...[
        const SizedBox(height: 10),
        _panel(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(t('گفتگوی خصوصی با تیم مقابل', 'Private chat with opponents'),
            style: const TextStyle(fontWeight: FontWeight.w900)),
          DropdownButton<String>(
            isExpanded: true,
            value: _opponents.any((player) => player['userId']?.toString() == _chatRecipientUserId)
                ? _chatRecipientUserId
                : _opponents.first['userId']?.toString(),
            items: _opponents.map((player) {
              final id = player['userId'].toString();
              return DropdownMenuItem<String>(value: id, child: Text(id));
            }).toList(),
            onChanged: _busy ? null : (value) => setState(() => _chatRecipientUserId = value),
          ),
          SizedBox(
            height: 110,
            child: ListView(
              children: ((_room?['chatMessages'] as List?) ?? const [])
                  .whereType<Map>()
                  .map((message) => Align(
                    alignment: message['senderUserId']?.toString() == _userId
                        ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Text(message['text']?.toString() ?? ''),
                    ),
                  )).toList(),
            ),
          ),
          Row(children: [
            Expanded(child: TextField(
              controller: _chatController,
              maxLength: 1000,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: t('پیام خصوصی...', 'Private message...'),
                counterText: '',
              ),
            )),
            IconButton(
              tooltip: t('ارسال پیام', 'Send message'),
              onPressed: _busy ? null : _sendChatMessage,
              icon: const Icon(Icons.send),
            ),
          ]),
        ])),
      ],
      if (_status == 'round_completed' && (_host || _hostUnavailable) && _room?['handRevealUntil'] == null) ...[
        const SizedBox(height: 10),
        FilledButton.icon(onPressed: _busy ? null : _nextRound,
          icon: const Icon(Icons.skip_next), label: Text(t('شروع دست بعدی', 'Start next hand'))),
      ],
      const SizedBox(height: 10),
      OutlinedButton.icon(onPressed: _busy ? null : _cancelVote,
        icon: const Icon(Icons.cancel_outlined), label: Text(t('درخواست لغو مسابقه', 'Request cancellation'))),
      OutlinedButton(onPressed: _busy ? null : _exitTemporarily,
        child: Text(t('خروج موقت از بازی', 'Leave temporarily'))),
    ]);
  }
}
