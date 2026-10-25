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
  Map<String, dynamic>? _state;
  bool _busy = false;
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
    try {
      final match = await MatchService.get(_id);
      if (match['status'] == 'active') {
        final state = await MatchService.getState(_id);
        if (mounted) setState(() { _state = state; _error = null; });
      } else if (mounted) {
        setState(() { _state = null; _error = null; });
      }
    } catch (e) {
      if (mounted && !silent) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
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
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      await _refresh(silent: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dice = (_state?['dice'] as List?)?.cast<num>() ?? const <num>[];
    final remaining = (_state?['remainingDice'] as List?)?.cast<num>() ?? const <num>[];
    final board = (_state?['board'] as List?)?.cast<num>() ?? const <num>[];
    final currentTurn = _state?['currentTurnUserId']?.toString();
    final isMyTurn = currentTurn != null && currentTurn == _currentUserId;
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
                Text(_state == null ? 'در انتظار ورود حریف...' : (isMyTurn ? 'نوبت شماست' : 'در انتظار حرکت حریف'),
                  style: const TextStyle(color: _matchGold, fontWeight: FontWeight.bold, fontSize: 18)),
                const SizedBox(height: 6),
                Text(_state == null ? 'این صفحه به‌صورت خودکار هر ۳ ثانیه وضعیت اتاق را بررسی می‌کند.' : 'نسخه وضعیت: ${_state!['version']}',
                  style: const TextStyle(color: Colors.white70)),
              ]),
            ),
            if (_state != null) ...[
              const SizedBox(height: 16),
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
                      return Container(
                        decoration: BoxDecoration(color: const Color(0xFF35271F), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.white24)),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text('${index + 1}', style: const TextStyle(color: Colors.white54, fontSize: 10)),
                          const SizedBox(height: 3),
                          Icon(Icons.circle, size: 15, color: count > 0 ? const Color(0xFFF0D7A1) : count < 0 ? const Color(0xFF20202A) : Colors.white12),
                          Text(count == 0 ? '—' : count.abs().toString(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        ]),
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
                  Text(dice.isEmpty ? 'هنوز تاسی ریخته نشده است.' : 'تاس‌های باقی‌مانده برای حرکت: ${remaining.join('، ')}',
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70)),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _busy || !isMyTurn || dice.isNotEmpty ? null : _roll,
                    icon: const Icon(Icons.casino),
                    label: Text(_busy ? 'در حال ثبت...' : 'ریختن تاس'),
                    style: FilledButton.styleFrom(backgroundColor: _matchGold, foregroundColor: _matchNavy, padding: const EdgeInsets.all(13)),
                  ),
                ]),
              ),
            ],
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
            const SizedBox(height: 10),
            const Text('در این مرحله، وضعیت اتاق و تاس‌ها از سرور همگام می‌شوند؛ ثبت و اعتبارسنجی حرکت مهره‌ها در مرحله بعدی تکمیل می‌شود.',
              style: TextStyle(color: Colors.white54, height: 1.6)),
          ],
        )),
      ),
    );
  }

  // The API currently returns the turn owner; the account id is added to the snapshot in the next integration pass.
  String? get _currentUserId => null;
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
