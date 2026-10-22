import 'package:flutter/material.dart';
import 'backgammon_engine.dart';

const _boardNavy = Color(0xFF10182B);
const _boardGold = Color(0xFFD8B45A);
const _boardWood = Color(0xFF76502E);
const _boardLight = Color(0xFFE7D4B2);
const _boardDark = Color(0xFF352B2A);

/// Engine-connected local backgammon screen. No network or account required.
class EngineBackgammonScreen extends StatefulWidget {
  const EngineBackgammonScreen({super.key});

  @override
  State<EngineBackgammonScreen> createState() => _EngineBackgammonScreenState();
}

class _EngineBackgammonScreenState extends State<EngineBackgammonScreen> {
  final BackgammonEngine _engine = BackgammonEngine();
  int? _selectedPoint;
  bool _selectedBar = false;
  String _message = 'برای شروع، تاس بریزید.';

  List<BackgammonMove> get _moves => _engine.legalMoves();

  void _roll() {
    setState(() {
      _selectedPoint = null;
      _selectedBar = false;
      final before = _engine.currentPlayer;
      final dice = _engine.rollDice();
      if (_engine.finished) {
        _message = 'بازی تمام شده است.';
      } else if (dice.isEmpty) {
        _message = 'حرکت مجاز وجود نداشت؛ نوبت عوض شد.';
      } else {
        _message = 'نوبت ${_playerName(_engine.currentPlayer)} · تاس: ${dice.join('، ')}';
      }
      if (before != _engine.currentPlayer && dice.isEmpty) {
        _message = 'حرکتی نبود؛ نوبت ${_playerName(_engine.currentPlayer)} است.';
      }
    });
  }

  void _reset() {
    setState(() {
      _engine.reset();
      _selectedPoint = null;
      _selectedBar = false;
      _message = 'بازی از ابتدا شروع شد. تاس بریزید.';
    });
  }

  String _playerName(int player) => player == 1 ? 'طلایی' : 'روشن';

  void _tapPoint(int point) {
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      final moves = _moves;
      if (_selectedPoint != null || _selectedBar) {
        final sourceMoves = moves.where((m) =>
            _selectedBar ? m.fromBar && m.to == point : !m.fromBar && m.from == _selectedPoint && m.to == point).toList();
        if (sourceMoves.isNotEmpty) {
          _play(sourceMoves.first);
          return;
        }
      }
      final canMoveFromHere = moves.any((m) => !m.fromBar && m.from == point);
      if (canMoveFromHere && _engine.points[point] * _engine.currentPlayer > 0) {
        _selectedPoint = point;
        _selectedBar = false;
        _message = 'مقصد یکی از خانه‌های مشخص‌شده را انتخاب کنید.';
      } else {
        _selectedPoint = null;
        _selectedBar = false;
      }
    });
  }

  void _tapBar() {
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      final moves = _moves.where((m) => m.fromBar).toList();
      if (moves.isEmpty) {
        _message = 'مهره‌ای برای ورود از بار ندارد یا خانه‌های ورود بسته‌اند.';
        return;
      }
      _selectedBar = true;
      _selectedPoint = null;
      _message = 'اکنون خانه ورود مشخص‌شده را انتخاب کنید.';
    });
  }

  void _play(BackgammonMove move) {
    final ok = _engine.playMove(move);
    _selectedPoint = null;
    _selectedBar = false;
    if (!ok) {
      _message = 'این حرکت مجاز نیست.';
      return;
    }
    if (_engine.finished) {
      _message = 'تبریک! بازیکن ${_playerName(_engine.winner!)} برنده شد.';
    } else if (_engine.dice.isEmpty) {
      _message = 'نوبت ${_playerName(_engine.currentPlayer)} است؛ تاس بریزید.';
    } else {
      _message = 'حرکت انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final legalTargets = _moves
        .where((m) => _selectedBar
            ? m.fromBar
            : _selectedPoint != null && !m.fromBar && m.from == _selectedPoint)
        .map((m) => m.to)
        .toSet();

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: _boardNavy,
        appBar: AppBar(
          backgroundColor: _boardNavy,
          foregroundColor: _boardGold,
          title: const Text('تخته‌نرد سلطنتی'),
          actions: [
            IconButton(
              tooltip: 'شروع مجدد',
              onPressed: _reset,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
              _statusPanel(),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: _boardWood,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: _boardGold, width: 2),
                  boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 12, offset: Offset(0, 5))],
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        _barPanel(),
                        const SizedBox(width: 6),
                        Expanded(child: _pointRow(List.generate(12, (i) => 23 - i), legalTargets, top: true)),
                      ],
                    ),
                    Container(
                      height: 8,
                      margin: const EdgeInsets.symmetric(vertical: 5),
                      decoration: BoxDecoration(color: _boardGold, borderRadius: BorderRadius.circular(8)),
                    ),
                    Row(
                      children: [
                        _barPanel(),
                        const SizedBox(width: 6),
                        Expanded(child: _pointRow(List.generate(12, (i) => i), legalTargets, top: false)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _scoreRow(),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _engine.dice.isEmpty && !_engine.finished ? _roll : null,
                      icon: const Icon(Icons.casino),
                      label: const Text('ریختن تاس'),
                      style: FilledButton.styleFrom(backgroundColor: _boardGold, foregroundColor: _boardNavy, padding: const EdgeInsets.symmetric(vertical: 14)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: _reset,
                    icon: const Icon(Icons.restart_alt),
                    label: const Text('شروع مجدد'),
                    style: OutlinedButton.styleFrom(foregroundColor: _boardGold, side: const BorderSide(color: _boardGold), padding: const EdgeInsets.symmetric(vertical: 14)),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Text(
                'نسخه آزمایشی محلی · بازی دونفره روی یک دستگاه',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusPanel() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _boardGold.withValues(alpha: .55)),
        ),
        child: Row(
          children: [
            const Icon(Icons.info_outline, color: _boardGold),
            const SizedBox(width: 8),
            Expanded(child: Text(_message, style: const TextStyle(color: Colors.white))),
            if (_engine.dice.isNotEmpty)
              Wrap(
                spacing: 4,
                children: _engine.dice.map((die) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(color: _boardLight, borderRadius: BorderRadius.circular(6)),
                  child: Text('$die', style: const TextStyle(color: _boardNavy, fontWeight: FontWeight.bold)),
                )).toList(),
              ),
          ],
        ),
      );

  Widget _barPanel() => SizedBox(
        width: 42,
        child: InkWell(
          onTap: _tapBar,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: const BoxConstraints(minHeight: 178),
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
            decoration: BoxDecoration(
              color: _selectedBar ? _boardGold.withValues(alpha: .35) : _boardDark,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _selectedBar ? _boardGold : Colors.white24),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('بار', style: TextStyle(color: Colors.white70, fontSize: 10)),
                _barCount(-1),
                const Divider(color: Colors.white24, height: 6),
                _barCount(1),
              ],
            ),
          ),
        ),
      );

  Widget _barCount(int player) {
    final count = _engine.bar[player == 1 ? 1 : 0];
    return Column(
      children: [
        _checker(player, size: 22),
        Text('$count', style: const TextStyle(color: Colors.white, fontSize: 12)),
      ],
    );
  }

  Widget _pointRow(List<int> indexes, Set<int> legalTargets, {required bool top}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: indexes.map((index) {
        final count = _engine.points[index];
        final player = count == 0 ? 0 : count.sign;
        final selected = _selectedPoint == index;
        final target = legalTargets.contains(index);
        return Expanded(
          child: GestureDetector(
            onTap: () => _tapPoint(index),
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: selected ? _boardGold.withValues(alpha: .28) : target ? Colors.green.withValues(alpha: .20) : Colors.transparent,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: selected ? _boardGold : target ? Colors.greenAccent : Colors.transparent, width: 1.2),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (top) ...[
                    Text('${index + 1}', style: const TextStyle(fontSize: 9, color: Colors.white70)),
                    _checkerStack(player, count.abs(), top: true),
                  ] else ...[
                    _checkerStack(player, count.abs(), top: false),
                    Text('${index + 1}', style: const TextStyle(fontSize: 9, color: Colors.white70)),
                  ],
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _checkerStack(int player, int count, {required bool top}) {
    if (count == 0) {
      return const Expanded(child: SizedBox());
    }
    final shown = count > 5 ? 5 : count;
    final chips = List.generate(shown, (_) => _checker(player, size: 17));
    return Expanded(
      child: Align(
        alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: top ? chips : chips.reversed.toList(),
        ),
      ),
    );
  }

  Widget _checker(int player, {double size = 20}) => Container(
        width: size,
        height: size,
        margin: const EdgeInsets.symmetric(vertical: 1),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: player == 1 ? _boardGold : _boardLight,
          border: Border.all(color: player == 1 ? const Color(0xFFFFE7A0) : const Color(0xFF9C8D76), width: 1.2),
          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 2, offset: Offset(0, 1))],
        ),
      );

  Widget _scoreRow() => Row(
        children: [
          Expanded(child: _scoreCard('طلایی', _engine.borneOff[1], _engine.bar[1], _boardGold)),
          const SizedBox(width: 8),
          Expanded(child: _scoreCard('روشن', _engine.borneOff[0], _engine.bar[0], _boardLight)),
        ],
      );

  Widget _scoreCard(String title, int off, int onBar, Color color) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: const Color(0xFF1A2540), borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            _checker(color == _boardGold ? 1 : -1, size: 18),
            const SizedBox(width: 7),
            Expanded(child: Text('$title\nخارج: $off · بار: $onBar', style: const TextStyle(fontSize: 12, height: 1.4))),
            Text('$off/15', style: TextStyle(color: color, fontWeight: FontWeight.bold)),
          ],
        ),
      );
}
