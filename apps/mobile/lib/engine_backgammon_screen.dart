import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
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

  @override
  void initState() {
    super.initState();
    _lockLandscapeOnMobile();
  }

  Future<void> _lockLandscapeOnMobile() async {
    if (kIsWeb) return;
    await SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    if (!kIsWeb) {
      SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    }
    super.dispose();
  }

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
        _message =
            'نوبت ${_playerName(_engine.currentPlayer)} · تاس: ${dice.join('، ')}';
      }
      if (before != _engine.currentPlayer && dice.isEmpty) {
        _message =
            'حرکتی نبود؛ نوبت ${_playerName(_engine.currentPlayer)} است.';
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
        final sourceMoves = moves
            .where((m) => _selectedBar
                ? m.fromBar && m.to == point
                : !m.fromBar && m.from == _selectedPoint && m.to == point)
            .toList();
        if (sourceMoves.isNotEmpty) {
          _play(sourceMoves.first);
          return;
        }
      }
      final canMoveFromHere = moves.any((m) => !m.fromBar && m.from == point);
      if (canMoveFromHere &&
          _engine.points[point] * _engine.currentPlayer > 0) {
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
        appBar: MediaQuery.orientationOf(context) == Orientation.landscape
            ? null
            : AppBar(
                toolbarHeight: 48,
                backgroundColor: _boardNavy,
                foregroundColor: _boardGold,
                title: const Text('تخته‌نرد سلطنتی',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                actions: [
                  IconButton(
                    tooltip: 'شروع مجدد',
                    onPressed: _reset,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final landscape = constraints.maxWidth > constraints.maxHeight;
              if (landscape) {
                return _landscapeLayout(legalTargets, constraints.maxHeight);
              }
              return ListView(
                padding: const EdgeInsets.all(14),
                children: [
                  _statusPanel(),
                  const SizedBox(height: 12),
                  AspectRatio(
                    aspectRatio: 0.92,
                    child: _board(legalTargets, rowHeight: 150),
                  ),
                  const SizedBox(height: 12),
                  _scoreRow(),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.center,
                    child: OutlinedButton.icon(
                      onPressed: _reset,
                      icon: const Icon(Icons.restart_alt),
                      label: const Text('شروع مجدد'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _boardGold,
                        side: const BorderSide(color: _boardGold),
                        padding: const EdgeInsets.symmetric(
                            vertical: 12, horizontal: 20),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'نسخه آزمایشی محلی · بازی دونفره روی یک دستگاه',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _landscapeLayout(Set<int> legalTargets, double availableHeight) {
    // Keep the board within the visible landscape viewport, including the dice strip.
    final rowHeight =
        ((availableHeight - 82) / 2).clamp(36.0, 115.0).toDouble();
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
              child: _board(legalTargets, rowHeight: rowHeight, compact: true)),
          const SizedBox(width: 10),
          SizedBox(
            width: 190,
            child: Column(
              children: [
                Expanded(flex: 3, child: _statusPanel(compact: true)),
                const SizedBox(height: 8),
                Expanded(flex: 2, child: _scoreRow(compact: true)),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _reset,
                    icon: const Icon(Icons.restart_alt, size: 18),
                    label: const Text('شروع مجدد'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _boardGold,
                      side: const BorderSide(color: _boardGold),
                      padding: const EdgeInsets.symmetric(
                          vertical: 9, horizontal: 8),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _board(Set<int> legalTargets,
          {required double rowHeight, bool compact = false}) =>
      Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF98683B), _boardWood, Color(0xFF4D301D)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _boardGold, width: 2),
          boxShadow: const [
            BoxShadow(
                color: Colors.black45, blurRadius: 12, offset: Offset(0, 5)),
            BoxShadow(color: Color(0x337D5A27), blurRadius: 2, spreadRadius: 1),
          ],
        ),
        child: Column(
          children: [
            Expanded(
                child: Row(children: [
              _barPanel(compact: compact || rowHeight < 120),
              const SizedBox(width: 5),
              Expanded(
                  child: SizedBox(
                      height: rowHeight,
                      child: _pointRow(
                          List.generate(12, (i) => 11 - i), legalTargets,
                          top: true, compact: compact))),
            ])),
            Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [_boardNavy, Color(0xFF202D46), _boardNavy]),
                borderRadius: BorderRadius.circular(9),
                border: Border.all(color: _boardGold.withValues(alpha: .85)),
                boxShadow: const [
                  BoxShadow(
                      color: Colors.black26,
                      blurRadius: 4,
                      offset: Offset(0, 2))
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _engine.dice.isEmpty && !_engine.finished
                          ? _roll
                          : null,
                      icon: const Icon(Icons.casino, size: 18),
                      label: const Text('ریختن تاس'),
                      style: FilledButton.styleFrom(
                        backgroundColor: _boardGold,
                        foregroundColor: _boardNavy,
                        padding: const EdgeInsets.symmetric(
                            vertical: 6, horizontal: 4),
                        textStyle: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 12),
                        visualDensity: VisualDensity.compact,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Align(
                          alignment: Alignment.centerLeft,
                          child: _diceTray(compact: true))),
                ],
              ),
            ),
            Expanded(
                child: Row(children: [
              _barPanel(compact: compact || rowHeight < 120),
              const SizedBox(width: 5),
              Expanded(
                  child: SizedBox(
                      height: rowHeight,
                      child: _pointRow(
                          List.generate(12, (i) => 12 + i), legalTargets,
                          top: false, compact: compact))),
            ])),
          ],
        ),
      );

  Widget _statusPanel({bool compact = false}) => Container(
        width: double.infinity,
        padding: EdgeInsets.all(compact ? 8 : 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _boardGold.withValues(alpha: .55)),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline,
                color: _boardGold, size: compact ? 18 : 24),
            SizedBox(width: compact ? 5 : 8),
            Expanded(
                child: SingleChildScrollView(
                    child: Text(_message,
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: compact ? 11 : 14)))),
          ],
        ),
      );

  Widget _diceTray({bool compact = false}) {
    if (_engine.dice.isEmpty) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.casino_outlined, color: Colors.white54, size: 21),
          SizedBox(width: 4),
          Flexible(
            child: Text(
              'تاس‌های بازی',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white60, fontSize: 10),
            ),
          ),
        ],
      );
    }

    return Wrap(
      spacing: 5,
      runSpacing: 3,
      children: _engine.dice
          .map((die) => Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFFFFFFF), _boardLight, Color(0xFFC8B18A)],
                  ),
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(color: const Color(0xFFFFE7A0), width: 1),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black38,
                      blurRadius: 3,
                      offset: Offset(0, 2),
                    ),
                  ],
                ),
                child: Text(
                  '$die',
                  style: TextStyle(
                    color: _boardNavy,
                    fontSize: compact ? 14 : 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ))
          .toList(),
    );
  }

  Widget _barPanel({bool compact = false}) => SizedBox(
        width: compact ? 28 : 42,
        child: InkWell(
          onTap: _tapBar,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: BoxConstraints(minHeight: compact ? 82 : 178),
            padding:
                EdgeInsets.symmetric(vertical: compact ? 3 : 8, horizontal: 2),
            decoration: BoxDecoration(
              color:
                  _selectedBar ? _boardGold.withValues(alpha: .35) : _boardDark,
              borderRadius: BorderRadius.circular(8),
              border:
                  Border.all(color: _selectedBar ? _boardGold : Colors.white24),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('بار',
                    style: TextStyle(color: Colors.white70, fontSize: 10)),
                _barCount(-1, compact: compact),
                Divider(color: Colors.white24, height: compact ? 3 : 6),
                _barCount(1, compact: compact),
              ],
            ),
          ),
        ),
      );

  Widget _barCount(int player, {bool compact = false}) {
    final count = _engine.bar[player == 1 ? 1 : 0];
    return Column(
      children: [
        _checker(player, size: compact ? 16 : 22),
        Text('$count',
            style: TextStyle(color: Colors.white, fontSize: compact ? 10 : 12)),
      ],
    );
  }

  Widget _pointRow(List<int> indexes, Set<int> legalTargets,
      {required bool top, bool compact = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var position = 0; position < indexes.length; position++) ...[
          if (position == 6)
            Container(
              width: 3,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: BoxDecoration(
                color: _boardGold,
                boxShadow: [
                  BoxShadow(
                    color: _boardGold.withValues(alpha: 0.5),
                    blurRadius: 4,
                    spreadRadius: 0.5,
                  ),
                ],
              ),
            ),
          Expanded(
            child: Builder(builder: (context) {
              final index = indexes[position];
              final count = _engine.points[index];
              final player = count == 0 ? 0 : count.sign;
              final selected = _selectedPoint == index;
              final target = legalTargets.contains(index);
              return GestureDetector(
                onTap: () => _tapPoint(index),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  decoration: BoxDecoration(
                    color: selected
                        ? _boardGold.withValues(alpha: .28)
                        : target
                            ? Colors.green.withValues(alpha: .20)
                            : Colors.transparent,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: selected
                          ? _boardGold
                          : target
                              ? Colors.greenAccent
                              : Colors.transparent,
                      width: 1.2,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (top) ...[
                        Text('$index',
                            style: const TextStyle(
                                fontSize: 9, color: Colors.white70)),
                        _checkerStack(player, count.abs(),
                            top: true, compact: compact),
                      ] else ...[
                        _checkerStack(player, count.abs(),
                            top: false, compact: compact),
                        Text('$index',
                            style: const TextStyle(
                                fontSize: 9, color: Colors.white70)),
                      ],
                    ],
                  ),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }

  Widget _checkerStack(int player, int count,
      {required bool top, bool compact = false}) {
    if (count == 0) {
      return const Expanded(child: SizedBox());
    }
    final shown = count > 5 ? 5 : count;
    final chips =
        List.generate(shown, (_) => _checker(player, size: compact ? 11 : 17));
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
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: player == 1
                ? const [
                    Color(0xFFFFE9A3),
                    Color(0xFFD8B45A),
                    Color(0xFF9B702C)
                  ]
                : const [
                    Color(0xFFFFFFFF),
                    Color(0xFFE7D4B2),
                    Color(0xFFB4A184)
                  ],
          ),
          border: Border.all(
            color:
                player == 1 ? const Color(0xFFFFE7A0) : const Color(0xFF9C8D76),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(
                color: Colors.black38, blurRadius: 3, offset: Offset(0, 2)),
            BoxShadow(
                color: Color(0x33FFFFFF),
                blurRadius: 1,
                offset: Offset(-1, -1)),
          ],
        ),
      );

  Widget _scoreRow({bool compact = false}) => compact
      ? Column(
          children: [
            Expanded(
                child: _scoreCard(
                    'طلایی', _engine.borneOff[1], _engine.bar[1], _boardGold,
                    compact: true)),
            const SizedBox(height: 6),
            Expanded(
                child: _scoreCard(
                    'روشن', _engine.borneOff[0], _engine.bar[0], _boardLight,
                    compact: true)),
          ],
        )
      : Row(
          children: [
            Expanded(
                child: _scoreCard(
                    'طلایی', _engine.borneOff[1], _engine.bar[1], _boardGold)),
            const SizedBox(width: 8),
            Expanded(
                child: _scoreCard(
                    'روشن', _engine.borneOff[0], _engine.bar[0], _boardLight)),
          ],
        );

  Widget _scoreCard(String title, int off, int onBar, Color color,
          {bool compact = false}) =>
      Container(
        width: double.infinity,
        padding: EdgeInsets.all(compact ? 6 : 10),
        decoration: BoxDecoration(
            color: const Color(0xFF1A2540),
            borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            _checker(color == _boardGold ? 1 : -1, size: compact ? 15 : 18),
            SizedBox(width: compact ? 4 : 7),
            Expanded(
                child: Text('$title\nخارج: $off · بار: $onBar',
                    style:
                        TextStyle(fontSize: compact ? 10 : 12, height: 1.25))),
            Text('$off/15',
                style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.bold,
                    fontSize: compact ? 11 : 14)),
          ],
        ),
      );
}
