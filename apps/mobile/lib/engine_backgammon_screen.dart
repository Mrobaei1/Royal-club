import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'backgammon_engine.dart';
import 'backgammon_ai.dart';
import 'online_lobby_screen.dart';

const _boardNavy = Color(0xFF10182B);
const _boardGold = Color(0xFFD8B45A);
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
  final BackgammonAI _ai = BackgammonAI();
  bool _modeChosen = false;
  bool _vsComputer = true;
  BackgammonDifficulty _difficulty = BackgammonDifficulty.medium;
  bool _computerThinking = false;
  int _boardThemeIndex = 0;

  static const List<List<Color>> _boardThemes = [
    [Color(0xFF6D4026), Color(0xFF76502E), Color(0xFF3B2418)],
    [Color(0xFF176B55), Color(0xFF0D4B3D), Color(0xFF08352D)],
    [Color(0xFF315A8C), Color(0xFF203F6B), Color(0xFF152B4B)],
    [Color(0xFF7A3151), Color(0xFF54213A), Color(0xFF351529)],
    [Color(0xFF777B85), Color(0xFF4C515D), Color(0xFF30343D)],
  ];
  static const List<String> _boardThemeNames = ['چوب سلطنتی', 'زمردی', 'آبی یاقوتی', 'زرشکی', 'نقره‌ای'];

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
  bool _gameOverDialogShown = false;

  List<BackgammonMove> get _moves => _engine.legalMoves();

  void _roll() {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
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
    _scheduleComputerTurn();
  }

  void _reset() {
    setState(() {
      _engine.reset();
      _gameOverDialogShown = false;
      _computerThinking = false;
      _selectedPoint = null;
      _selectedBar = false;
      _message = 'بازی از ابتدا شروع شد. تاس بریزید.';
    });
  }

  String _playerName(int player) => player == 1 ? 'طلایی' : 'روشن';

  String _profileName(int player) => _vsComputer
      ? (player == 1 ? 'شما' : 'هوش مصنوعی')
      : (player == 1 ? 'بازیکن ۱' : 'بازیکن ۲');

  void _tapPoint(int point) {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    if (_engine.finished || _engine.dice.isEmpty) return;

    setState(() {
      final moves = _moves;

      // When a checker is on the bar, the player can simply tap its legal
      // entry point. No separate, hidden bar-selection step is required.
      final currentBarCount = _engine.bar[_engine.currentPlayer == 1 ? 1 : 0];
      if (currentBarCount > 0) {
        final entry = moves.where((m) => m.fromBar && m.to == point).toList();
        if (entry.isNotEmpty) {
          _play(entry.first);
          return;
        }
        _selectedPoint = null;
        _selectedBar = false;
        _message = 'مهره در بار است؛ یکی از خانه‌های سبزرنگ برای ورود را انتخاب کنید.';
        return;
      }

      if (_selectedPoint != null || _selectedBar) {
        final source = _selectedPoint;
        final sourceMoves = moves
            .where((m) => _selectedBar
                ? m.fromBar && m.to == point
                : !m.fromBar && m.from == source && m.to == point)
            .toList();
        if (sourceMoves.isNotEmpty) {
          _play(sourceMoves.first);
          return;
        }

        if (source != null && !_selectedBar) {
          final sequence = _findCumulativeSequence(source, point);
          if (sequence != null && sequence.length > 1) {
            _playSequence(sequence);
            return;
          }
        }
      }

      final canMoveFromHere =
          moves.any((m) => !m.fromBar && m.from == point);
      if (canMoveFromHere &&
          _engine.points[point] * _engine.currentPlayer > 0) {
        _selectedPoint = point;
        _selectedBar = false;
        _message = 'مقصد را انتخاب کنید؛ اگر مسیر قانونی باشد، حرکت تجمعی با تاس‌ها هم انجام می‌شود.';
      } else {
        _selectedPoint = null;
        _selectedBar = false;
      }
    });
  }

  /// Finds a legal sequence that moves the same checker from [from] to
  /// [destination] using more than one die, while respecting all engine rules.
  List<BackgammonMove>? _findCumulativeSequence(int from, int destination) {
    if (destination < 0 || destination >= 24) return null;

    BackgammonEngine copyState(BackgammonEngine source) {
      final copy = BackgammonEngine();
      copy.points.setAll(0, source.points);
      copy.bar.setAll(0, source.bar);
      copy.borneOff.setAll(0, source.borneOff);
      copy.dice = List<int>.from(source.dice);
      copy.currentPlayer = source.currentPlayer;
      copy.finished = source.finished;
      copy.winner = source.winner;
      return copy;
    }

    List<BackgammonMove>? search(
      BackgammonEngine state,
      int checkerPoint,
      List<BackgammonMove> path,
    ) {
      if (path.length >= _engine.dice.length || state.finished) return null;
      for (final move in state.legalMoves()) {
        if (move.fromBar || move.from != checkerPoint || move.to == -1) {
          continue;
        }
        final next = copyState(state);
        if (!next.playMove(move)) continue;
        final nextPath = [...path, move];
        if (move.to == destination && nextPath.length > 1) {
          return nextPath;
        }
        if (next.currentPlayer != state.currentPlayer || next.dice.isEmpty) {
          continue;
        }
        final tail = search(next, move.to, nextPath);
        if (tail != null) return tail;
      }
      return null;
    }

    return search(copyState(_engine), from, const []);
  }

  void _playSequence(List<BackgammonMove> sequence) {
    var allPlayed = true;
    for (final move in sequence) {
      if (!_engine.playMove(move)) {
        allPlayed = false;
        break;
      }
      if (_engine.finished || _engine.currentPlayer != playerAtStart) {
        break;
      }
    }
    _selectedPoint = null;
    _selectedBar = false;
    if (!allPlayed) {
      _message = 'حرکت تجمعی کامل نشد؛ لطفاً دوباره انتخاب کنید.';
    } else if (_engine.finished) {
      _message = 'تبریک! بازیکن ${_playerName(_engine.winner!)} برنده شد.';
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else if (_engine.dice.isEmpty) {
      _message = 'نوبت ${_playerName(_engine.currentPlayer)} است؛ تاس بریزید.';
    } else {
      _message = 'حرکت تجمعی انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
    }
    _scheduleComputerTurn();
  }

  int movePlayer(BackgammonMove move) => move.fromBar
      ? _engine.currentPlayer
      : _engine.currentPlayer;
  void _tapBearOff() {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      if (_selectedPoint == null || _selectedBar) {
        _message = 'ابتدا مهره‌ای را که می‌خواهید خارج کنید انتخاب کنید.';
        return;
      }
      final candidates = _moves
          .where((m) => !m.fromBar && m.from == _selectedPoint && m.to == -1)
          .toList();
      if (candidates.isEmpty) {
        _message = 'با تاس فعلی، خارج کردن این مهره مجاز نیست.';
        return;
      }
      _play(candidates.first);
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
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else if (_engine.dice.isEmpty) {
      _message = 'نوبت ${_playerName(_engine.currentPlayer)} است؛ تاس بریزید.';
    } else {
      _message = 'حرکت انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
    }
    _scheduleComputerTurn();
  }

  void _scheduleComputerTurn() {
    if (!_vsComputer ||
        _engine.finished ||
        _engine.currentPlayer != -1 ||
        _computerThinking) {
      return;
    }
    _computerThinking = true;
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() {
        if (!_vsComputer || _engine.finished || _engine.currentPlayer != -1) {
          _computerThinking = false;
          return;
        }
        if (_engine.dice.isEmpty) {
          final rolled = _engine.rollDice();
          if (rolled.isEmpty) {
            _message = 'نوبت کامپیوتر بدون حرکت تمام شد.';
            _computerThinking = false;
            return;
          }
        }
        var safety = 0;
        while (!_engine.finished &&
            _engine.currentPlayer == -1 &&
            _engine.dice.isNotEmpty &&
            safety++ < 4) {
          final move = _ai.chooseMove(_engine, difficulty: _difficulty);
          if (move == null || !_engine.playMove(move)) break;
        }
        _computerThinking = false;
        if (_engine.finished) {
          _message = 'کامپیوتر برنده شد.';
        } else if (_engine.currentPlayer == 1) {
          _message = 'نوبت شماست؛ تاس بریزید.';
        } else {
          _message =
              'نوبت کامپیوتر است؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
        }
      });
      if (_vsComputer &&
          !_engine.finished &&
          _engine.currentPlayer == -1 &&
          _engine.dice.isNotEmpty) {
        _scheduleComputerTurn();
      }
    });
  }

  void _changeMode(bool vsComputer) {
    setState(() {
      _vsComputer = vsComputer;
      _engine.reset();
      _gameOverDialogShown = false;
      _computerThinking = false;
      _selectedPoint = null;
      _selectedBar = false;
      _message = vsComputer
          ? 'بازی با هوش مصنوعی؛ تاس بریزید.'
          : 'بازی دونفره محلی؛ تاس بریزید.';
    });
  }

  void _showGameOverDialog() {
    if (_gameOverDialogShown || !mounted || !_engine.finished) return;
    _gameOverDialogShown = true;
    final navigator = Navigator.of(context);
    final winner = _playerName(_engine.winner!);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          backgroundColor: const Color(0xFF1A2540),
          icon: const Icon(Icons.emoji_events, color: _boardGold, size: 42),
          title: const Text('پایان بازی',
              style: TextStyle(color: _boardGold, fontWeight: FontWeight.bold)),
          content: Text('تبریک! بازیکن $winner برنده شد 🎉',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 17)),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _reset();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('بازی مجدد'),
              style: FilledButton.styleFrom(
                  backgroundColor: _boardGold, foregroundColor: _boardNavy),
            ),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                navigator.maybePop();
              },
              icon: const Icon(Icons.exit_to_app),
              label: const Text('خروج از بازی'),
              style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: _boardGold)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_modeChosen) return _entryScreen();
    final legalTargets = _moves
        .where((m) => _selectedBar
            ? m.fromBar
            : _selectedPoint != null && !m.fromBar && m.from == _selectedPoint)
        .map((m) => m.to)
        .toSet();
    // Also mark endpoints reachable by moving the selected checker with
    // multiple dice, so cumulative destinations are visible before tapping.
    if (_selectedPoint != null && !_selectedBar && _engine.dice.length > 1) {
      for (var destination = 0; destination < 24; destination++) {
        if (_findCumulativeSequence(_selectedPoint!, destination) != null) {
          legalTargets.add(destination);
        }
      }
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: MediaQuery.orientationOf(context) == Orientation.landscape
            ? null
            : AppBar(
                toolbarHeight: 48,
                backgroundColor: _boardNavy,
                foregroundColor: Theme.of(context).colorScheme.primary,
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
                  _modeControls(),
                  const SizedBox(height: 10),
                  _statusPanel(),
                  const SizedBox(height: 10),
                  _rollControl(),
                  const SizedBox(height: 12),
                  LayoutBuilder(
                    builder: (context, boardConstraints) {
                      final boardHeight = (boardConstraints.maxWidth * 0.92)
                          .clamp(260.0, 420.0);
                      final rowHeight = ((boardHeight - 64) / 2)
                          .clamp(80.0, 178.0)
                          .toDouble();
                      return SizedBox(
                        height: boardHeight,
                        child: _board(legalTargets, rowHeight: rowHeight),
                      );
                    },
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
                    'نسخه آزمایشی محلی · بازی با هوش مصنوعی یا دونفره روی یک دستگاه',
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

  Widget _entryScreen() => Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: _boardNavy,
          appBar: AppBar(
            backgroundColor: _boardNavy,
            foregroundColor: _boardGold,
            title: const Text('تخته‌نرد سلطنتی'),
          ),
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.workspace_premium, color: _boardGold, size: 64),
                    const SizedBox(height: 16),
                    const Text('روش بازی را انتخاب کنید',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: _boardGold, fontSize: 24, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    const Text('بازی آفلاین برای تمرین به اینترنت نیاز ندارد. برای رقابت با بازیکنان دیگر، بازی آنلاین را انتخاب کنید.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, height: 1.5)),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () {
                        setState(() {
                          _vsComputer = true;
                          _modeChosen = true;
                          _engine.reset();
                          _message = 'بازی آفلاین با هوش مصنوعی؛ تاس بریزید.';
                        });
                      },
                      icon: const Icon(Icons.psychology),
                      label: const Text('بازی آفلاین با هوش مصنوعی'),
                      style: FilledButton.styleFrom(backgroundColor: _boardGold, foregroundColor: _boardNavy, padding: const EdgeInsets.symmetric(vertical: 16)),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OnlineLobbyScreen()));
                      },
                      icon: const Icon(Icons.public),
                      label: const Text('بازی آنلاین'),
                      style: OutlinedButton.styleFrom(foregroundColor: _boardGold, side: const BorderSide(color: _boardGold), padding: const EdgeInsets.symmetric(vertical: 16)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

  Widget _modeControls({bool compact = false}) => Container(
        padding: EdgeInsets.symmetric(
            horizontal: compact ? 6 : 10, vertical: compact ? 4 : 8),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _boardGold.withValues(alpha: .4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(alignment: WrapAlignment.center, spacing: 6, children: [
              ChoiceChip(
                label: Text(compact ? 'با هوش مصنوعی' : 'بازی با هوش مصنوعی',
                    style: TextStyle(fontSize: compact ? 10 : 12)),
                selected: _vsComputer,
                onSelected: _computerThinking ? null : (_) => _changeMode(true),
                selectedColor: _boardGold,
                labelStyle:
                    TextStyle(color: _vsComputer ? _boardNavy : Colors.white),
                visualDensity: VisualDensity.compact,
              ),
              ChoiceChip(
                label: Text(compact ? 'دونفره' : 'بازی دونفره',
                    style: TextStyle(fontSize: compact ? 10 : 12)),
                selected: !_vsComputer,
                onSelected:
                    _computerThinking ? null : (_) => _changeMode(false),
                selectedColor: _boardGold,
                labelStyle:
                    TextStyle(color: !_vsComputer ? _boardNavy : Colors.white),
                visualDensity: VisualDensity.compact,
              ),
            ]),
            Row(children: [
              Text('تم صفحه بازی:', style: TextStyle(color: Colors.white70, fontSize: compact ? 10 : 12)),
              const SizedBox(width: 8),
              Expanded(child: DropdownButtonHideUnderline(child: DropdownButton<int>(
                value: _boardThemeIndex,
                isExpanded: true,
                dropdownColor: _boardNavy,
                style: TextStyle(color: _boardGold, fontSize: compact ? 11 : 13),
                items: List.generate(_boardThemeNames.length, (i) => DropdownMenuItem(value: i, child: Text(_boardThemeNames[i]))),
                onChanged: (value) { if (value != null) setState(() => _boardThemeIndex = value); },
              ))),
            ]),
            if (_vsComputer)
              Row(children: [
                Text('سختی:',
                    style: TextStyle(
                        color: Colors.white70, fontSize: compact ? 10 : 12)),
                const SizedBox(width: 8),
                Expanded(
                    child: DropdownButtonHideUnderline(
                  child: DropdownButton<BackgammonDifficulty>(
                    value: _difficulty,
                    isExpanded: true,
                    dropdownColor: _boardNavy,
                    style: TextStyle(
                        color: _boardGold, fontSize: compact ? 11 : 13),
                    items: const [
                      DropdownMenuItem(
                          value: BackgammonDifficulty.easy,
                          child: Text('آسان')),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.medium,
                          child: Text('متوسط')),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.hard, child: Text('سخت')),
                    ],
                    onChanged: _computerThinking
                        ? null
                        : (value) {
                            if (value != null) {
                              setState(() => _difficulty = value);
                            }
                          },
                  ),
                )),
              ]),
          ],
        ),
      );

  Widget _landscapeLayout(Set<int> legalTargets, double availableHeight) {
    // Keep the board within the visible landscape viewport, including the dice strip.
    final rowHeight =
        ((availableHeight - 100) / 2).clamp(32.0, 108.0).toDouble();
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
          {required double rowHeight, bool compact = false}) {
    final sideWidth = compact || rowHeight < 120 ? 36.0 : 48.0;
    final barWidth = compact || rowHeight < 120 ? 32.0 : 42.0;
    final topLeft = List.generate(6, (i) => 11 - i);
    final topRight = List.generate(6, (i) => 5 - i);
    final bottomLeft = List.generate(6, (i) => 12 + i);
    final bottomRight = List.generate(6, (i) => 18 + i);

    Widget points(List<int> indexes, {required bool top}) => Expanded(
          child: SizedBox(
            height: rowHeight,
            child: _pointRow(indexes, legalTargets, top: top, compact: compact),
          ),
        );

    Widget barCount(int player) => SizedBox(
          width: barWidth,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 1),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [_boardDark, Color(0xFF211814), _boardDark],
              ),
              border: Border.symmetric(
                vertical: BorderSide(color: _boardGold.withValues(alpha: .8), width: 1.2),
              ),
            ),
            alignment: Alignment.center,
            child: _barCount(player, compact: compact || rowHeight < 120),
          ),
        );

    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: _boardThemes[_boardThemeIndex],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _boardGold, width: 2),
        boxShadow: const [
          BoxShadow(color: Colors.black45, blurRadius: 12, offset: Offset(0, 5)),
          BoxShadow(color: Color(0x337D5A27), blurRadius: 2, spreadRadius: 1),
        ],
      ),
      child: CustomPaint(
        painter: _WoodGrainPainter(),
        child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                _barPanel(compact: compact || rowHeight < 120, offPlayer: -1),
                const SizedBox(width: 4),
                points(topLeft, top: true),
                barCount(-1),
                points(topRight, top: true),
              ],
            ),
          ),
          Container(
            height: compact || rowHeight < 120 ? 34 : 44,
            margin: const EdgeInsets.symmetric(vertical: 3),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [_boardNavy, Color(0xFF202D46), _boardNavy],
              ),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _boardGold.withValues(alpha: .85)),
              boxShadow: const [
                BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2)),
              ],
            ),
            child: Row(
              children: [
                SizedBox(width: sideWidth + 4),
                Expanded(
                  child: Row(
                    children: [
                      Expanded(
                        child: Center(
                          child: _rollControl(compact: true),
                        ),
                      ),
                      Container(
                        width: 2,
                        height: double.infinity,
                        decoration: BoxDecoration(
                          color: _boardGold,
                          boxShadow: [
                            BoxShadow(
                              color: _boardGold.withValues(alpha: .55),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Center(child: _diceTray(compact: true)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Row(
              children: [
                _barPanel(compact: compact || rowHeight < 120, offPlayer: 1),
                const SizedBox(width: 4),
                points(bottomLeft, top: false),
                barCount(1),
                points(bottomRight, top: false),
              ],
            ),
          ),
        ],
        ),
      ),
    );
  }

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
          .map((die) => AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                switchInCurve: Curves.easeOutBack,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) => ScaleTransition(
                  scale: animation,
                  child: FadeTransition(opacity: animation, child: child),
                ),
                child: Container(
                  key: ValueKey(
                      '${_engine.currentPlayer}-${_engine.dice.join('-')}-$die'),
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFFFFFFFF),
                        _boardLight,
                        Color(0xFFC8B18A)
                      ],
                    ),
                    borderRadius: BorderRadius.circular(7),
                    border:
                        Border.all(color: const Color(0xFFFFE7A0), width: 1),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black38,
                        blurRadius: 3,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: _DiePips(value: die, pipSize: compact ? 4 : 5),
                ),
              ))
          .toList(),
    );
  }

  Widget _rollControl({bool compact = false}) => SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: _engine.dice.isEmpty &&
                  !_engine.finished &&
                  !_computerThinking &&
                  !(_vsComputer && _engine.currentPlayer == -1)
              ? _roll
              : null,
          icon: Icon(Icons.casino, size: compact ? 17 : 21),
          label: Text('ریختن تاس', style: TextStyle(fontSize: compact ? 12 : 15)),
          style: FilledButton.styleFrom(
            backgroundColor: _boardGold,
            foregroundColor: _boardNavy,
            padding: EdgeInsets.symmetric(vertical: compact ? 7 : 12, horizontal: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.bold),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            elevation: 4,
          ),
        ),
      );

  Widget _barPanel({bool compact = false, required int offPlayer}) {
    final offIndex = offPlayer == 1 ? 1 : 0;
    final isCurrentPlayer = _engine.currentPlayer == offPlayer;
    return SizedBox(
      width: compact ? 36 : 48,
      child: InkWell(
        onTap: isCurrentPlayer ? _tapBearOff : null,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          constraints: BoxConstraints(minHeight: compact ? 82 : 178),
          padding: EdgeInsets.symmetric(vertical: compact ? 3 : 8, horizontal: 2),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF241B17), Color(0xFF100E0D)],
            ),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isCurrentPlayer ? _boardGold : _boardGold.withValues(alpha: .45),
              width: isCurrentPlayer ? 1.4 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(Icons.inventory_2_outlined, color: _boardGold, size: compact ? 13 : 16),
              Text(
                offPlayer == 1 ? 'طلایی' : 'مشکی',
                style: TextStyle(color: Colors.white70, fontSize: compact ? 7 : 9),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              _checker(offPlayer, size: compact ? 18 : 24),
              Text(
                '${_engine.borneOff[offIndex]}/15',
                style: TextStyle(
                  color: _boardGold,
                  fontSize: compact ? 8 : 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (isCurrentPlayer)
                Icon(Icons.touch_app_outlined, color: _boardGold, size: compact ? 12 : 15),
            ],
          ),
        ),
      ),
    );
  }

  Widget _barCount(int player, {bool compact = false}) {
    final count = _engine.bar[player == 1 ? 1 : 0];
    return Column(
      children: [
        _checker(player, size: compact ? 18 : 24),
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
              // High-contrast inlays keep both gold and dark checkers readable.
              final pointColor = position.isEven
                  ? const Color(0xFFFFFFFF)
                  : const Color(0xFFB9E7C5);
              return GestureDetector(
                onTap: () => _tapPoint(index),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: selected
                          ? _boardGold
                          : target
                              ? Colors.greenAccent
                              : Colors.transparent,
                      width: selected || target ? 1.5 : 0,
                    ),
                    boxShadow: selected
                        ? [BoxShadow(color: _boardGold.withValues(alpha: .45), blurRadius: 7)]
                        : const [],
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CustomPaint(
                        painter: _RoyalPointPainter(
                          color: pointColor,
                          top: top,
                          highlight: selected
                              ? _boardGold.withValues(alpha: .38)
                              : target
                                  ? Colors.green.withValues(alpha: .38)
                                  : Colors.transparent,
                        ),
                      ),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          if (top) ...[
                            Text('$index',
                                style: TextStyle(
                                  fontSize: compact ? 7 : 9,
                                  color: const Color(0xFFE53935),
                                  fontWeight: FontWeight.w900,
                                  shadows: const [Shadow(color: Colors.black87, blurRadius: 3)],
                                )),
                            _checkerStack(player, count.abs(),
                                top: true, compact: compact),
                          ] else ...[
                            _checkerStack(player, count.abs(),
                                top: false, compact: compact),
                            Text('$index',
                                style: TextStyle(
                                  fontSize: compact ? 7 : 9,
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  shadows: const [Shadow(color: Colors.black87, blurRadius: 3)],
                                )),
                          ],
                        ],
                      ),
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
        List.generate(shown, (_) => _checker(player, size: compact ? 13 : 21));
    return Expanded(
      child: AnimatedAlign(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutBack,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: ScaleTransition(scale: animation, child: child),
          ),
          child: Column(
            key: ValueKey('$player-$count-$top'),
            mainAxisSize: MainAxisSize.min,
            children: top ? chips : chips.reversed.toList(),
          ),
        ),
      ),
    );
  }

  Widget _checker(int player, {double size = 20}) => Container(
        width: size,
        height: size,
        margin: const EdgeInsets.symmetric(vertical: 0.5),
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
                    Color(0xFF4B4B4B),
                    Color(0xFF171717),
                    Color(0xFF050505)
                  ],
          ),
          border: Border.all(
            color:
                player == 1 ? const Color(0xFFFFE7A0) : const Color(0xFF777777),
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
                    _profileName(1), _engine.borneOff[1], _engine.bar[1], _boardGold,
                    active: _engine.currentPlayer == 1, compact: true)),
            const SizedBox(height: 6),
            Expanded(
                child: _scoreCard(
                    _profileName(-1), _engine.borneOff[0], _engine.bar[0], const Color(0xFF111111),
                    active: _engine.currentPlayer == -1, compact: true)),
          ],
        )
      : Row(
          children: [
            Expanded(
                child: _scoreCard(
                    _profileName(1), _engine.borneOff[1], _engine.bar[1], _boardGold,
                    active: _engine.currentPlayer == 1)),
            const SizedBox(width: 8),
            Expanded(
                child: _scoreCard(
                    _profileName(-1), _engine.borneOff[0], _engine.bar[0], _boardLight,
                    active: _engine.currentPlayer == -1)),
          ],
        );

  Widget _scoreCard(String title, int off, int onBar, Color color,
          {bool compact = false, bool active = false}) =>
      Container(
        width: double.infinity,
        padding: EdgeInsets.all(compact ? 6 : 10),
        decoration: BoxDecoration(
            color: const Color(0xFF1A2540),
            borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            CircleAvatar(
              radius: compact ? 12 : 16,
              backgroundColor: color.withValues(alpha: .18),
              child: Icon(Icons.person_rounded, color: color, size: compact ? 15 : 20),
            ),
            SizedBox(width: compact ? 4 : 7),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: compact ? 10 : 12)),
                  Text(
                    _vsComputer
                        ? (title == 'هوش مصنوعی' ? 'حریف رایانه‌ای' : 'بازیکن شما')
                        : 'بازیکن محلی',
                    style: TextStyle(color: Colors.white54, fontSize: compact ? 8 : 10),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                  ),
                  Text('خارج: $off · بار: $onBar', style: TextStyle(color: Colors.white70, fontSize: compact ? 9 : 11)),
                  if (active && !_engine.finished)
                    Text('نوبت فعلی', style: TextStyle(color: _boardGold, fontSize: compact ? 8 : 10, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            Text('$off/15', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: compact ? 10 : 13)),
          ],
        ),
      );
}


class _WoodGrainPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.65
      ..color = const Color(0xFFD8B45A).withValues(alpha: 0.07);
    for (var i = 0; i < 18; i++) {
      final y = size.height * (i + 1) / 19;
      final path = Path()..moveTo(0, y);
      path.cubicTo(size.width * .22, y - 4, size.width * .38, y + 3, size.width * .58, y);
      path.cubicTo(size.width * .74, y - 2, size.width * .86, y + 2, size.width, y - 1);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _WoodGrainPainter oldDelegate) => false;
}

class _DiePips extends StatelessWidget {
  const _DiePips({required this.value, required this.pipSize});
  final int value;
  final double pipSize;

  @override
  Widget build(BuildContext context) {
    const center = Alignment.center;
    const topLeft = Alignment(-0.58, -0.58);
    const topRight = Alignment(0.58, -0.58);
    const bottomLeft = Alignment(-0.58, 0.58);
    const bottomRight = Alignment(0.58, 0.58);
    const middleLeft = Alignment(-0.58, 0);
    const middleRight = Alignment(0.58, 0);
    final positions = switch (value) {
      1 => const [center],
      2 => const [topLeft, bottomRight],
      3 => const [topLeft, center, bottomRight],
      4 => const [topLeft, topRight, bottomLeft, bottomRight],
      5 => const [topLeft, topRight, center, bottomLeft, bottomRight],
      _ => const [topLeft, topRight, middleLeft, middleRight, bottomLeft, bottomRight],
    };
    return Stack(
      children: [
        for (final position in positions)
          Align(
            alignment: position,
            child: Container(
              width: pipSize,
              height: pipSize,
              decoration: BoxDecoration(
                color: const Color(0xFF172033),
                shape: BoxShape.circle,
                boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 1, offset: Offset(0, 1))],
              ),
            ),
          ),
      ],
    );
  }
}

/// Draws the alternating, pointed inlays that define a traditional backgammon
/// board. The top row points down; the bottom row points up.
class _RoyalPointPainter extends CustomPainter {
  const _RoyalPointPainter({
    required this.color,
    required this.top,
    required this.highlight,
  });

  final Color color;
  final bool top;
  final Color highlight;

  @override
  void paint(Canvas canvas, Size size) {
    final inset = size.width * 0.08;
    final tipY = top ? size.height * 0.78 : size.height * 0.22;
    final baseY = top ? 0.0 : size.height;
    final path = Path()
      ..moveTo(inset, baseY)
      ..lineTo(size.width - inset, baseY)
      ..lineTo(size.width / 2, tipY)
      ..close();

    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          begin: top ? Alignment.topCenter : Alignment.bottomCenter,
          end: top ? Alignment.bottomCenter : Alignment.topCenter,
          colors: [
            color,
            Color.lerp(color, Colors.black, 0.18)!,
          ],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..color = _boardGold.withValues(alpha: 0.48),
    );

    if (highlight != Colors.transparent) {
      canvas.drawPath(path, Paint()..color = highlight);
    }

    final sheen = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = Colors.white.withValues(alpha: 0.15);
    final sheenPath = Path()
      ..moveTo(inset + 1, baseY)
      ..lineTo(size.width / 2, tipY + (top ? 3 : -3));
    canvas.drawPath(sheenPath, sheen);
  }

  @override
  bool shouldRepaint(covariant _RoyalPointPainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.top != top ||
      oldDelegate.highlight != highlight;
}
