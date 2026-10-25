import 'dart:async';
import 'package:flutter/material.dart';
import 'services/match_service.dart';

const _matchGold = Color(0xFFD8B45A);
const _matchNavy = Color(0xFF10182B);
const _matchPanel = Color(0xFF17243A);

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
  bool _busy = false;
  int? _selectedFrom;
  int? _selectedDie;
  bool _fromBar = false;
  bool _batchMode = false;
  final List<Map<String, int?>> _pendingMoves = [];
  String _matchStatus = 'waiting';
  String? _error;

  String get _id => widget.match['id'].toString();

  @override
  void initState() {
    super.initState();
    _refresh();
    _poller = Timer.periodic(const Duration(seconds: 3), (_) => _refresh(silent: true));
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if (_busy && !silent) return;
    final sequence = ++_refreshSequence;
    try {
      final match = await MatchService.get(_id);
      if (sequence != _refreshSequence) return;
      if (match['status'] == 'active' || match['status'] == 'finished') {
        final state = await MatchService.getState(_id);
        if (sequence != _refreshSequence) return;
        if (mounted) setState(() {
          _state = state;
          _matchStatus = match['status'].toString();
          _error = null;
        });
      } else if (mounted) {
        setState(() {
          _state = null;
          _matchStatus = match['status']?.toString() ?? 'waiting';
          _error = null;
        });
      }
    } catch (e) {
      if (sequence == _refreshSequence && mounted && !silent) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
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
      if (from != null || to != expected) { setState(() => _error = 'ابتدا باید مهره را با تاس انتخاب‌شده از بار وارد کنید.'); return; }
      if (board[expected] * sign <= -2) { setState(() => _error = 'خانهٔ ورود با دو مهرهٔ حریف بسته است.'); return; }
    } else if (from == null) {
      setState(() => _error = 'مهره‌ای روی بار ندارید.'); return;
    } else if (to == null) {
      final inHome = hostTurn ? from <= 5 : from >= 18;
      final allHome = board.asMap().entries.every((e) => hostTurn ? e.key <= 5 || e.value <= 0 : e.key >= 18 || e.value >= 0);
      final distance = hostTurn ? from + 1 : 24 - from;
      final clear = hostTurn
          ? !board.asMap().entries.any((e) => e.key > from && e.key <= 5 && e.value > 0)
          : !board.asMap().entries.any((e) => e.key < from && e.key >= 18 && e.value < 0);
      if (board[from] * sign <= 0 || !inHome || !allHome || die < distance || (die > distance && !clear)) {
        setState(() => _error = 'این مهره با این تاس قابل خارج‌کردن نیست.'); return;
      }
    } else {
      final expected = hostTurn ? from - die : from + die;
      if (board[from] * sign <= 0 || expected != to || to < 0 || to > 23 || board[to] * sign <= -2) {
        setState(() => _error = 'این حرکت با تاس انتخاب‌شده قانونی نیست.'); return;
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
      setState(() => _error = 'ابتدا یکی از تاس‌های باقی‌مانده را انتخاب کنید.');
      return;
    }
    if (_fromBar) {
      if (_batchMode) { await _stageMove(from: null, to: point, die: _selectedDie!); } else { await _submitMove(from: null, to: point, die: _selectedDie!); }
      return;
    }
    if (_selectedFrom == null) {
      final sign = _state?['isHost'] == true ? 1 : -1;
      if (board[point].toInt() * sign <= 0) {
        setState(() => _error = 'مهره‌ای از خودتان را انتخاب کنید.');
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
    final bar = preview['bar'] as Map<String, int>;
    final ownBar = (bar[_state?['isHost'] == true ? 'host' : 'guest'] ?? 0);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: _matchNavy,
        appBar: AppBar(
          backgroundColor: _matchNavy,
          foregroundColor: _matchGold,
          title: Text('اتاق ${widget.match['roomCode'] ?? _id}'),
          actions: [IconButton(onPressed: _busy ? null : _refresh, icon: const Icon(Icons.refresh))],
        ),
        body: SafeArea(child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: _matchPanel, borderRadius: BorderRadius.circular(16), border: Border.all(color: _matchGold.withValues(alpha: .35))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(
                  _matchStatus == 'finished'
                      ? 'بازی پایان یافت'
                      : (_state == null
                          ? 'در انتظار ورود حریف...'
                          : (isMyTurn ? 'نوبت شماست' : 'در انتظار حرکت حریف')),
                  style: const TextStyle(
                    color: _matchGold,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 6),
                Text(_state == null ? 'این صفحه به‌صورت خودکار هر ۳ ثانیه وضعیت اتاق را بررسی می‌کند.' : 'نسخه وضعیت: ${_state!['version']}',
                  style: const TextStyle(color: Colors.white70)),
              ]),
            ),
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
                label: Text(_batchMode ? 'لغو حالت حرکت ترکیبی' : 'ثبت چند حرکت با یک تأیید'),
              ),
              if (_batchMode) Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: _matchPanel, borderRadius: BorderRadius.circular(12), border: Border.all(color: _matchGold)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('حرکت‌های آماده: ${_pendingMoves.length} — تخته پیش‌نمایش است؛ هنوز روی سرور ثبت نشده.', style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: OutlinedButton(onPressed: _busy ? null : _cancelBatch, child: const Text('لغو همه'))),
                    const SizedBox(width: 8),
                    Expanded(child: FilledButton(onPressed: _busy || _pendingMoves.isEmpty ? null : _submitBatch, child: const Text('ثبت همه حرکت‌ها'))),
                  ]),
                ]),
              ),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFF6E4A2B), borderRadius: BorderRadius.circular(16), border: Border.all(color: _matchGold)),
                child: Column(children: [
                  const Text('وضعیت تخته از سرور', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: board.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 6, childAspectRatio: .9, crossAxisSpacing: 5, mainAxisSpacing: 5),
                    itemBuilder: (context, index) {
                      final count = board[index].toInt();
                      final selected = _selectedFrom == index;
                      return InkWell(
                        onTap: () => _tapPoint(index, board, remaining, isMyTurn),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          decoration: BoxDecoration(color: selected ? _matchGold.withValues(alpha: .35) : const Color(0xFF35271F), borderRadius: BorderRadius.circular(8), border: Border.all(color: selected ? _matchGold : Colors.white24, width: selected ? 2 : 1)),
                          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Text('${index + 1}', style: const TextStyle(color: Colors.white54, fontSize: 10)),
                            const SizedBox(height: 3),
                            Icon(Icons.circle, size: 15, color: count > 0 ? const Color(0xFFF0D7A1) : count < 0 ? const Color(0xFF20202A) : Colors.white12),
                            Text(count == 0 ? '—' : count.abs().toString(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ]),
                        ),
                      );
                    },
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: _matchPanel, borderRadius: BorderRadius.circular(16)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Text('تاس سرور', style: TextStyle(color: _matchGold, fontSize: 17, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    _Die(value: dice.isNotEmpty ? dice[0].toInt() : null),
                    const SizedBox(width: 12),
                    _Die(value: dice.length > 1 ? dice[1].toInt() : null),
                  ]),
                  const SizedBox(height: 8),
                  Text(dice.isEmpty ? 'هنوز تاسی ریخته نشده است.' : 'تاس‌های باقی‌مانده را انتخاب کنید:',
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
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
                    label: Text('ورود مهره از بار (${ownBar.toInt()})'),
                  ),
                  if (_selectedFrom != null && isMyTurn) OutlinedButton.icon(
                    onPressed: _busy || _selectedDie == null ? null : () => _batchMode ? _stageMove(from: _selectedFrom, to: null, die: _selectedDie!) : _submitMove(from: _selectedFrom, to: null, die: _selectedDie!),
                    icon: const Icon(Icons.outbound),
                    label: const Text('خارج کردن مهره'),
                  ),
                  if (isMyTurn && remaining.isNotEmpty) OutlinedButton.icon(
                    onPressed: _busy ? null : _endTurn,
                    icon: const Icon(Icons.skip_next),
                    label: const Text('پایان نوبت (فقط اگر حرکت قانونی نمانده باشد)'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _busy || _matchStatus != 'active' || !isMyTurn || dice.isNotEmpty ? null : _roll,
                    icon: const Icon(Icons.casino),
                    label: Text(_busy ? 'در حال ثبت...' : 'ریختن تاس'),
                    style: FilledButton.styleFrom(backgroundColor: _matchGold, foregroundColor: _matchNavy, padding: const EdgeInsets.all(13)),
                  ),
                ]),
              ),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
            const SizedBox(height: 10),
            const Text('حرکت‌ها با شماره نسخه به سرور ارسال می‌شوند و سرور نوبت، تاس مصرفی، مسیر حرکت، خانه مسدود و خارج‌کردن مهره را بررسی می‌کند.',
              style: TextStyle(color: Colors.white54, height: 1.6)),
          ],
        )),
      ),
    );
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
