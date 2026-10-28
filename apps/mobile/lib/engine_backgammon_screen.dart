import 'dart:async';
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'backgammon_engine.dart';
import 'backgammon_ai.dart';
import 'online_lobby_screen.dart';
import 'royal_backgammon_board.dart';

const _boardNavy = Color(0xFF10182B);
const _boardGold = Color(0xFFD8B45A);
const _boardLight = Color(0xFFE7D4B2);
const _boardDark = Color(0xFF352B2A);

/// Engine-connected local backgammon screen. No network or account required.
class EngineBackgammonScreen extends StatefulWidget {
  const EngineBackgammonScreen({super.key, this.engineForTesting, this.vsComputerForTesting = true});

  /// Optional engine injection keeps rule-driven UI tests deterministic.
  @visibleForTesting
  final BackgammonEngine? engineForTesting;

  @visibleForTesting
  final bool vsComputerForTesting;

  @override
  State<EngineBackgammonScreen> createState() => _EngineBackgammonScreenState();
}

class _EngineBackgammonScreenState extends State<EngineBackgammonScreen> {
  late final BackgammonEngine _engine = widget.engineForTesting ?? BackgammonEngine();
  final BackgammonAI _ai = BackgammonAI();
  bool _modeChosen = false;
  bool _vsComputer = true;
  BackgammonDifficulty _difficulty = BackgammonDifficulty.medium;
  bool _computerThinking = false;
  int _boardThemeIndex = 0;
  static const int _turnLimitSeconds = 20;
  int _secondsLeft = _turnLimitSeconds;
  int _timerPlayer = 1;
  Timer? _turnTimer;
  bool _timeoutMoveRunning = false;

  static const List<List<Color>> _boardThemes = [
    [Color(0xFF6D4026), Color(0xFF76502E), Color(0xFF3B2418)],
    [Color(0xFF176B55), Color(0xFF0D4B3D), Color(0xFF08352D)],
    [Color(0xFF315A8C), Color(0xFF203F6B), Color(0xFF152B4B)],
    [Color(0xFF7A3151), Color(0xFF54213A), Color(0xFF351529)],
    [Color(0xFF777B85), Color(0xFF4C515D), Color(0xFF30343D)],
  ];
  List<String> get _boardThemeNames => Localizations.localeOf(context).languageCode == 'en' ? ['Royal wood', 'Emerald', 'Sapphire blue', 'Burgundy', 'Silver'] : ['چوب سلطنتی', 'زمردی', 'آبی یاقوتی', 'زرشکی', 'نقره‌ای'];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_message.isEmpty) {
      _message = appText(context, 'برای شروع، تاس بریزید.', 'Roll the dice to begin.');
    }
  }

  @override
  void initState() {
    super.initState();
    _vsComputer = widget.vsComputerForTesting;
    _timerPlayer = _engine.currentPlayer;
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
    _turnTimer?.cancel();
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
  String _message = '';
  bool _gameOverDialogShown = false;

  List<BackgammonMove> get _moves => _engine.legalMoves();
  void _startTurnTimer({bool reset = false}) {
    if (!mounted || _engine.finished) {
      _turnTimer?.cancel();
      return;
    }
    if (_vsComputer && _engine.currentPlayer == -1) {
      _turnTimer?.cancel();
      return;
    }
    if (!reset && _turnTimer != null && _timerPlayer == _engine.currentPlayer) return;
    _turnTimer?.cancel();
    _timerPlayer = _engine.currentPlayer;
    _secondsLeft = _turnLimitSeconds;
    _turnTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted || _engine.finished) {
        timer.cancel();
        return;
      }
      if (_vsComputer && _engine.currentPlayer == -1) {
        timer.cancel();
        return;
      }
      if (_timerPlayer != _engine.currentPlayer) {
        timer.cancel();
        setState(() {
          _timerPlayer = _engine.currentPlayer;
          _secondsLeft = _turnLimitSeconds;
        });
        _startTurnTimer(reset: true);
        return;
      }
      if (_secondsLeft > 1) {
        setState(() => _secondsLeft--);
      } else {
        timer.cancel();
        setState(() => _secondsLeft = 0);
        _playTimedOutTurn();
      }
    });
  }

  Future<void> _playTimedOutTurn() async {
    if (_timeoutMoveRunning || !mounted || _engine.finished ||
        (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    _timeoutMoveRunning = true;
    _selectedPoint = null;
    _selectedBar = false;

    // Keep the timeout substitute readable too: reveal a fresh roll, wait three
    // seconds, then animate each legal move with the same three-second cadence
    // used by the regular computer turn.
    if (_engine.dice.isEmpty) {
      setState(() {
        final rolled = _engine.rollDice();
        _message = rolled.isEmpty
            ? appText(context, 'زمان تمام شد؛ حرکت خودکار آغاز نشد.', 'Time is up; no automatic move was made.')
            : appText(context, 'زمان تمام شد؛ تاس‌ها: ${_engine.dice.join('، ')}', 'Time is up; dice: ${_engine.dice.join(', ')}');
      });
      if (_engine.dice.isNotEmpty) {
        await Future<void>.delayed(const Duration(seconds: 3));
      }
    }

    var safety = 0;
    while (mounted && !_engine.finished && _engine.dice.isNotEmpty && safety++ < 4) {
      await Future<void>.delayed(const Duration(seconds: 3));
      if (!mounted || _engine.finished) break;
      var moved = false;
      setState(() {
        final move = _ai.chooseMove(_engine, difficulty: _difficulty);
        if (move != null) moved = _engine.playMove(move);
        _message = _engine.finished
            ? appText(context, 'بازی با پایان زمان و حرکت خودکار تمام شد.', 'The game ended after the timer and automatic move.')
            : moved
                ? appText(context, 'حرکت خودکار انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}', 'Automatic move made; remaining dice: ${_engine.dice.join(', ')}')
                : appText(context, 'حرکت قانونی دیگری باقی نمانده است.', 'No legal moves remain.');
      });
      if (!moved) break;
    }

    if (mounted && !_engine.finished) {
      setState(() {
        if (_engine.dice.isEmpty) {
          _message = appText(context, 'زمان تمام شد؛ حرکت‌های مجاز این نوبت انجام شد.', 'Time is up; legal moves for this turn were completed.');
        }
      });
    }
    _timeoutMoveRunning = false;
    if (!mounted) return;
    if (_engine.finished) {
      _turnTimer?.cancel();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else {
      _timerPlayer = _engine.currentPlayer;
      _secondsLeft = _turnLimitSeconds;
      _startTurnTimer(reset: true);
      _scheduleComputerTurn();
    }
  }

  Widget _turnCountdown(int player, {bool compact = false}) {
    if (_vsComputer && player == -1) return const SizedBox.shrink();
    final active = _engine.currentPlayer == player;
    final seconds = active && _timerPlayer == player ? _secondsLeft : _turnLimitSeconds;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 3 : 5, vertical: 2),
      decoration: BoxDecoration(
        color: active && seconds <= 5 ? Colors.red.shade900 : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: active ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24)),
      ),
      child: Text('⏱ $seconds',
        maxLines: 1,
        style: TextStyle(
          color: active && seconds <= 5 ? Theme.of(context).colorScheme.onSurface : Theme.of(context).colorScheme.primary,
          fontSize: compact ? 7 : 10,
          fontWeight: FontWeight.w800,
        )),
    );
  }


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
        _message = appText(context, 'بازی تمام شده است.', 'The game is over.');
      } else if (dice.isEmpty) {
        _message = appText(context, 'حرکت مجاز وجود نداشت؛ نوبت عوض شد.', 'No legal move was available; the turn changed.');
      } else {
        _message =
            appText(context, 'نوبت ${_playerName(_engine.currentPlayer)} · تاس: ${dice.join('، ')}', 'Turn: ${_playerName(_engine.currentPlayer)} · Dice: ${dice.join(', ')}');
      }
      if (before != _engine.currentPlayer && dice.isEmpty) {
        _message =
            appText(context, 'حرکتی نبود؛ نوبت ${_playerName(_engine.currentPlayer)} است.', 'No move was available; it is ${_playerName(_engine.currentPlayer)}’s turn.');
      }
    });
    _startTurnTimer();
    _scheduleComputerTurn();
  }

  void _reset() {
    setState(() {
      _engine.reset();
      _gameOverDialogShown = false;
      _computerThinking = false;
      _selectedPoint = null;
      _selectedBar = false;
      _message = appText(context, 'بازی از ابتدا شروع شد. تاس بریزید.', 'Game restarted. Roll the dice.');
      _timerPlayer = _engine.currentPlayer;
      _secondsLeft = _turnLimitSeconds;
    });
    _startTurnTimer(reset: true);
  }

  String _playerName(int player) => player == 1 ? appText(context, 'طلایی', 'Gold') : appText(context, 'روشن', 'Light');

  String _profileName(int player) => _vsComputer
      ? (player == 1 ? appText(context, 'شما', 'You') : appText(context, 'هوش مصنوعی', 'AI'))
      : (player == 1 ? appText(context, 'بازیکن ۱', 'Player 1') : appText(context, 'بازیکن ۲', 'Player 2'));

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
        _message = appText(context, 'مهره در بار است؛ یکی از خانه‌های سبزرنگ برای ورود را انتخاب کنید.', 'A checker is on the bar; select a green point to re-enter.');
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
        _message = appText(context, 'مقصد را انتخاب کنید؛ اگر مسیر قانونی باشد، حرکت تجمعی با تاس‌ها هم انجام می‌شود.', 'Choose a destination. If the route is legal, the dice can be combined for a cumulative move.');
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
    final playerAtStart = _engine.currentPlayer;
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
      _message = appText(context, 'حرکت تجمعی کامل نشد؛ لطفاً دوباره انتخاب کنید.', 'The cumulative move could not be completed. Please choose again.');
    } else if (_engine.finished) {
      _message = appText(context, 'تبریک! بازیکن ${_playerName(_engine.winner!)} برنده شد.', 'Congratulations! ${_playerName(_engine.winner!)} won the game.');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else if (_engine.dice.isEmpty) {
      _message = appText(context, 'نوبت ${_playerName(_engine.currentPlayer)} است؛ تاس بریزید.', 'It is ${_playerName(_engine.currentPlayer)}’s turn. Roll the dice.');
    } else {
      _message = appText(context, 'حرکت تجمعی انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}', 'Cumulative move completed; remaining dice: ${_engine.dice.join(', ')}');
    }
    _startTurnTimer();
    _scheduleComputerTurn();
  }

  void _tapBearOff() {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      if (_selectedPoint == null || _selectedBar) {
        _message = appText(context, 'ابتدا مهره‌ای را که می‌خواهید خارج کنید انتخاب کنید.', 'Select the checker you want to bear off first.');
        return;
      }
      final candidates = _moves
          .where((m) => !m.fromBar && m.from == _selectedPoint && m.to == -1)
          .toList();
      if (candidates.isEmpty) {
        _message = appText(context, 'با تاس فعلی، خارج کردن این مهره مجاز نیست.', 'This checker cannot be borne off with the current dice.');
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
      _message = appText(context, 'این حرکت مجاز نیست.', 'That move is not legal.');
      return;
    }
    if (_engine.finished) {
      _message = appText(context, 'تبریک! بازیکن ${_playerName(_engine.winner!)} برنده شد.', 'Congratulations! ${_playerName(_engine.winner!)} won the game.');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else if (_engine.dice.isEmpty) {
      _message = appText(context, 'نوبت ${_playerName(_engine.currentPlayer)} است؛ تاس بریزید.', 'It is ${_playerName(_engine.currentPlayer)}’s turn. Roll the dice.');
    } else {
      _message = appText(context, 'حرکت انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}', 'Move completed; remaining dice: ${_engine.dice.join(', ')}');
    }
    _startTurnTimer();
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
    Future<void>.delayed(const Duration(seconds: 3), () {
      if (!mounted) return;
      setState(() {
        if (!_vsComputer || _engine.finished || _engine.currentPlayer != -1) {
          _computerThinking = false;
          return;
        }
        if (_engine.dice.isEmpty) {
          final rolled = _engine.rollDice();
          if (rolled.isEmpty) {
            _message = appText(context, 'نوبت کامپیوتر بدون حرکت تمام شد.', 'The computer turn ended without a move.');
            _computerThinking = false;
            return;
          }
          // Show the rolled dice for a full three seconds before the first move.
          _computerThinking = false;
          _message = appText(context, 'تاس کامپیوتر: ${_engine.dice.join('، ')}', 'Computer dice: ${_engine.dice.join(', ')}');
          return;
        }
        final move = _ai.chooseMove(_engine, difficulty: _difficulty);
        if (move != null) _engine.playMove(move);
        _computerThinking = false;
        if (_engine.finished) {
          _message = appText(context, 'کامپیوتر برنده شد.', 'The computer won.');
        } else if (_engine.currentPlayer == 1) {
          _message = appText(context, 'نوبت شماست؛ تاس بریزید.', 'Your turn. Roll the dice.');
        } else {
          _message =
              appText(context, 'نوبت کامپیوتر است؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}', 'Computer turn; remaining dice: ${_engine.dice.join(', ')}');
        }
      });
      if (!_engine.finished && _engine.currentPlayer != _timerPlayer) {
        _timerPlayer = _engine.currentPlayer;
        _secondsLeft = _turnLimitSeconds;
      }
      _startTurnTimer(reset: true);
      if (_vsComputer &&
          !_engine.finished &&
          _engine.currentPlayer == -1 &&
          _engine.dice.isNotEmpty) {
        _scheduleComputerTurn();
      }
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
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: AlertDialog(
          backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
          icon: Icon(Icons.emoji_events, color: Theme.of(context).colorScheme.primary, size: 42),
          title: Text(appText(context, 'پایان بازی', 'Game over'),
              style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
          content: Text(appText(context, 'تبریک! بازیکن $winner برنده شد 🎉', 'Congratulations! $winner won 🎉'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 17)),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _reset();
              },
              icon: const Icon(Icons.refresh),
              label: Text(appText(context, 'بازی مجدد', 'Play again')),
              style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary),
            ),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                navigator.maybePop();
              },
              icon: const Icon(Icons.exit_to_app),
              label: Text(appText(context, 'خروج از بازی', 'Exit game')),
              style: OutlinedButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.onSurface,
                  side: BorderSide(color: Theme.of(context).colorScheme.primary)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_modeChosen) return _entryScreen();
    final hasCheckerOnBar =
        _engine.bar[_engine.currentPlayer == 1 ? 1 : 0] > 0;
    final legalTargets = _moves
        .where((m) => hasCheckerOnBar || _selectedBar
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
      textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: MediaQuery.orientationOf(context) == Orientation.landscape
            ? null
            : AppBar(
                toolbarHeight: 48,
                backgroundColor: Theme.of(context).colorScheme.surface,
                foregroundColor: Theme.of(context).colorScheme.primary,
                title: Text(appText(context, 'تخته‌نرد سلطنتی', 'Royal Backgammon'),
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                actions: [
                  IconButton(
                    tooltip: appText(context, 'شروع مجدد', 'Restart'),
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
                      label: Text(appText(context, 'شروع مجدد', 'Restart')),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Theme.of(context).colorScheme.primary,
                        side: BorderSide(color: Theme.of(context).colorScheme.primary),
                        padding: const EdgeInsets.symmetric(
                            vertical: 12, horizontal: 20),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    appText(context, 'نسخه آزمایشی محلی · تمرین با هوش مصنوعی', 'Local test version · practice with AI'),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.54), fontSize: 12),
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
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            backgroundColor: Theme.of(context).colorScheme.surface,
            foregroundColor: Theme.of(context).colorScheme.primary,
            title: Text(appText(context, 'تخته‌نرد سلطنتی', 'Royal Backgammon')),
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
                    Icon(Icons.workspace_premium, color: Theme.of(context).colorScheme.primary, size: 64),
                    const SizedBox(height: 16),
                    Text(appText(context, 'روش بازی را انتخاب کنید', 'Choose a game mode'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 24, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 10),
                    Text(appText(context, 'بازی آفلاین برای تمرین به اینترنت نیاز ندارد. برای رقابت با بازیکنان دیگر، بازی آنلاین را انتخاب کنید.', 'Offline practice does not require internet. Choose online play to compete with other players.'),
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), height: 1.5)),
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () {
                        setState(() {
                          _modeChosen = true;
                          _engine.reset();
                          _message = appText(context, 'بازی آفلاین با هوش مصنوعی؛ تاس بریزید.', 'Offline game with AI; roll the dice.');
                          _timerPlayer = _engine.currentPlayer;
                          _secondsLeft = _turnLimitSeconds;
                        });
                        _startTurnTimer(reset: true);
                      },
                      icon: const Icon(Icons.psychology),
                      label: Text(appText(context, 'بازی آفلاین با هوش مصنوعی', 'Offline vs AI')),
                      style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary, padding: const EdgeInsets.symmetric(vertical: 16)),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OnlineLobbyScreen()));
                      },
                      icon: const Icon(Icons.public),
                      label: Text(appText(context, 'بازی آنلاین', 'Online game')),
                      style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.primary, side: BorderSide(color: Theme.of(context).colorScheme.primary), padding: const EdgeInsets.symmetric(vertical: 16)),
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
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Theme.of(context).colorScheme.primary.withValues(alpha: .4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Text(appText(context, 'تم صفحه بازی:', 'Board theme:'), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontSize: compact ? 10 : 12)),
              const SizedBox(width: 8),
              Expanded(child: DropdownButtonHideUnderline(child: DropdownButton<int>(
                value: _boardThemeIndex,
                isExpanded: true,
                dropdownColor: Theme.of(context).colorScheme.surface,
                style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: compact ? 11 : 13),
                items: List.generate(_boardThemeNames.length, (i) => DropdownMenuItem(value: i, child: Text(_boardThemeNames[i]))),
                onChanged: (value) { if (value != null) setState(() => _boardThemeIndex = value); },
              ))),
            ]),
            if (_vsComputer)
              Row(children: [
                Text(appText(context, 'سختی:', 'Difficulty:'),
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontSize: compact ? 10 : 12)),
                const SizedBox(width: 8),
                Expanded(
                    child: DropdownButtonHideUnderline(
                  child: DropdownButton<BackgammonDifficulty>(
                    value: _difficulty,
                    isExpanded: true,
                    dropdownColor: Theme.of(context).colorScheme.surface,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.primary, fontSize: compact ? 11 : 13),
                    items: [
                      DropdownMenuItem(
                          value: BackgammonDifficulty.easy,
                          child: Text(appText(context, 'آسان', 'Easy'))),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.medium,
                          child: Text(appText(context, 'متوسط', 'Medium'))),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.hard, child: Text(appText(context, 'سخت', 'Hard'))),
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
    // Keep the vertical side card available for future controls and information.
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
                Expanded(child: _scoreRow(compact: true)),
                if (_vsComputer) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _reset,
                      icon: const Icon(Icons.restart_alt, size: 18),
                      label: Text(appText(context, 'شروع مجدد', 'Restart')),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Theme.of(context).colorScheme.primary,
                        side: BorderSide(color: Theme.of(context).colorScheme.primary),
                        padding: const EdgeInsets.symmetric(
                            vertical: 9, horizontal: 8),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _board(Set<int> legalTargets,
      {required double rowHeight, bool compact = false}) {
    return RoyalBackgammonBoard(
      points: _engine.points,
      selectedPoint: _selectedPoint,
      legalTargets: legalTargets,
      barWhite: _engine.bar[1],
      barBlack: _engine.bar[0],
      offWhite: _engine.borneOff[1],
      offBlack: _engine.borneOff[0],
      dice: _engine.dice,
      onPointTap: _tapPoint,
      onBearOff: _tapBearOff,
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
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.casino_outlined, color: Colors.white54, size: 21),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              appText(context, 'تاس‌های بازی', 'Game dice'),
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
          label: Text(appText(context, 'ریختن تاس', 'Roll dice'), style: TextStyle(fontSize: compact ? 12 : 15)),
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
          padding: EdgeInsets.symmetric(vertical: compact ? 1 : 8, horizontal: 2),
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
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
              Icon(Icons.inventory_2_outlined, color: _boardGold, size: compact ? 10 : 16),
              Text(
                offPlayer == 1 ? appText(context, 'طلایی', 'Gold') : appText(context, 'مشکی', 'Black'),
                style: TextStyle(color: Colors.white70, fontSize: compact ? 6 : 9),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              _checker(offPlayer, size: compact ? 20 : 42),
              Text(
                '${_engine.borneOff[offIndex]}/15',
                style: TextStyle(
                  color: _boardGold,
                  fontSize: compact ? 8 : 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
              _turnCountdown(offPlayer, compact: compact),
              if (isCurrentPlayer)
                Icon(Icons.touch_app_outlined, color: _boardGold, size: compact ? 9 : 15),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _barCount(int player, {bool compact = false}) {
    final count = _engine.bar[player == 1 ? 1 : 0];
    return Column(
      children: [
        _checker(player, size: compact ? 26 : 42),
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
                key: ValueKey('backgammon-point-$index'),
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
    final checkerSize = compact ? 26.0 : 42.0;
    final overlapStep = compact ? 15.0 : 24.0;
    return Expanded(
      child: LayoutBuilder(
        builder: (context, constraints) => AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutBack,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: ScaleTransition(scale: animation, child: child),
          ),
          child: Stack(
            key: ValueKey('$player-$count-$top'),
            clipBehavior: Clip.none,
            children: [
              for (var i = 0; i < shown; i++)
                Positioned(
                  top: top ? i * overlapStep : null,
                  bottom: top ? null : i * overlapStep,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: _checker(player, size: checkerSize),
                  ),
                ),
            ],
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
              child: _profileCircle(
                player: 1,
                color: _boardGold,
                active: _engine.currentPlayer == 1,
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _profileCircle(
                player: -1,
                color: _boardLight,
                active: _engine.currentPlayer == -1,
              ),
            ),
          ],
        )
      : Row(
          children: [
            Expanded(
              child: _profileCircle(
                player: 1,
                color: _boardGold,
                active: _engine.currentPlayer == 1,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _profileCircle(
                player: -1,
                color: _boardLight,
                active: _engine.currentPlayer == -1,
              ),
            ),
          ],
        );

  Widget _profileCircle({
    required int player,
    required Color color,
    required bool active,
  }) {
    final name = _profileName(player);
    final borderColor = active ? _boardGold : Colors.grey.shade600;
    return InkWell(
      key: ValueKey('player-profile-$player'),
      borderRadius: BorderRadius.circular(14),
      onTap: () => _showPlayerProfile(player),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
        decoration: BoxDecoration(
          color: active
              ? _boardGold.withValues(alpha: .13)
              : const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor, width: active ? 2.2 : 1),
          boxShadow: active
              ? [BoxShadow(color: _boardGold.withValues(alpha: .22), blurRadius: 9)]
              : const [],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? _boardGold : const Color(0xFF303746),
                border: Border.all(color: borderColor, width: active ? 2.5 : 1.5),
                boxShadow: active
                    ? [BoxShadow(color: _boardGold.withValues(alpha: .35), blurRadius: 8)]
                    : const [],
              ),
              child: Icon(
                player == -1 && _vsComputer ? Icons.smart_toy_rounded : Icons.person_rounded,
                color: active ? _boardNavy : Colors.grey.shade300,
                size: 27,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              name,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: active ? _boardGold : Colors.white70,
                fontSize: compactProfileFont,
                fontWeight: FontWeight.w800,
              ),
            ),
            if (active)
              Text(appText(context, 'نوبت حرکت', 'Move turn'), style: TextStyle(color: _boardGold, fontSize: 9)),
          ],
        ),
      ),
    );
  }

  static const double compactProfileFont = 11;

  void _showPlayerProfile(int player) {
    final name = _profileName(player);
    showDialog<void>(
      context: context,
      builder: (dialogContext) => Directionality(
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: AlertDialog(
          backgroundColor: const Color(0xFF1A2540),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: _boardGold, width: 1),
          ),
          title: Row(
            children: [
              CircleAvatar(
                backgroundColor: _boardGold,
                foregroundColor: _boardNavy,
                child: Icon(player == -1 && _vsComputer
                    ? Icons.smart_toy_rounded
                    : Icons.person_rounded),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(name, style: const TextStyle(color: _boardGold))),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _profileStatRow(appText(context, 'تعداد بازی', 'Games played'), appText(context, 'هنوز ثبت نشده', 'Not recorded yet')),
              _profileStatRow(appText(context, 'امتیاز', 'Rating'), appText(context, 'هنوز ثبت نشده', 'Not recorded yet')),
              _profileStatRow(appText(context, 'تعداد برد', 'Wins'), appText(context, 'هنوز ثبت نشده', 'Not recorded yet')),
              _profileStatRow(appText(context, 'سطح بازیکن', 'Player level'), player == -1 && _vsComputer
                  ? appText(context, 'هوش مصنوعی · متوسط', 'AI · Medium')
                  : appText(context, 'هنوز تعیین نشده', 'Not set yet')),
              const SizedBox(height: 8),
              Text(
                appText(context, 'آمار واقعی پس از اتصال سابقه بازی و رتبه‌بندی نمایش داده می‌شود.', 'Real statistics will appear after game history and ranking are connected.'),
                style: TextStyle(color: Colors.white60, fontSize: 12),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(appText(context, 'بستن', 'Close'), style: TextStyle(color: _boardGold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _profileStatRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(color: Colors.white70))),
            const SizedBox(width: 8),
            Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
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
