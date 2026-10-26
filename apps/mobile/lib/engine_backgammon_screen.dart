import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'backgammon_engine.dart';
import 'backgammon_ai.dart';
import 'l10n/app_localizations.dart';

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
  bool _vsComputer = true;
  BackgammonDifficulty _difficulty = BackgammonDifficulty.medium;
  bool _computerThinking = false;
  int _boardThemeIndex = 0;

  static const List<List<Color>> _boardThemes = [
    [Color(0xFF98683B), Color(0xFF76502E), Color(0xFF4D301D)],
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
  String _message = AppLocalizations.of(context)!.startRollPrompt;
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
        _message = AppLocalizations.of(context)!.gameFinished;
      } else if (dice.isEmpty) {
        _message = AppLocalizations.of(context)!.noLegalMoveTurnChanged;
      } else {
        _message = AppLocalizations.of(context)!.turnRolledDice(_playerName(_engine.currentPlayer), dice.join(', '));
      }
      if (before != _engine.currentPlayer && dice.isEmpty) {
        _message = AppLocalizations.of(context)!.turnChangedPlayer(_playerName(_engine.currentPlayer));
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
      _message = AppLocalizations.of(context)!.gameRestarted;
    });
  }

  String _playerName(int player) => player == 1 ? AppLocalizations.of(context)!.goldenPlayer : AppLocalizations.of(context)!.lightPlayer;

  void _tapPoint(int point) {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
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
        _message = AppLocalizations.of(context)!.chooseHighlightedPoint;
      } else {
        _selectedPoint = null;
        _selectedBar = false;
      }
    });
  }

  void _tapBearOff() {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      if (_selectedPoint == null || _selectedBar) {
        _message = AppLocalizations.of(context)!.selectCheckerToBearOff;
        return;
      }
      final candidates = _moves
          .where((m) => !m.fromBar && m.from == _selectedPoint && m.to == -1)
          .toList();
      if (candidates.isEmpty) {
        _message = AppLocalizations.of(context)!.bearOffNotAllowed;
        return;
      }
      _play(candidates.first);
    });
  }

  void _tapBar() {
    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) {
      return;
    }
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      final moves = _moves.where((m) => m.fromBar).toList();
      if (moves.isEmpty) {
        _message = AppLocalizations.of(context)!.noCheckerCanEnter;
        return;
      }
      _selectedBar = true;
      _selectedPoint = null;
      _message = AppLocalizations.of(context)!.chooseHighlightedEntry;
    });
  }

  void _play(BackgammonMove move) {
    final ok = _engine.playMove(move);
    _selectedPoint = null;
    _selectedBar = false;
    if (!ok) {
      _message = AppLocalizations.of(context)!.illegalMove;
      return;
    }
    if (_engine.finished) {
      _message = AppLocalizations.of(context)!.congratulationsWinner(_playerName(_engine.winner!));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showGameOverDialog();
      });
    } else if (_engine.dice.isEmpty) {
      _message = AppLocalizations.of(context)!.turnRollPrompt(_playerName(_engine.currentPlayer));
    } else {
      _message = AppLocalizations.of(context)!.moveDoneRemainingDice(_engine.dice.join('، '));
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
            _message = AppLocalizations.of(context)!.computerNoMoves;
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
          _message = AppLocalizations.of(context)!.computerWins;
        } else if (_engine.currentPlayer == 1) {
          _message = AppLocalizations.of(context)!.yourTurnRoll;
        } else {
          _message = AppLocalizations.of(context)!.computerTurnDice(_engine.dice.join('، '))
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
      _message = vsComputer ? AppLocalizations.of(context)!.aiGameStart : AppLocalizations.of(context)!.localTwoPlayerStart;
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
        textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
        child: AlertDialog(
          backgroundColor: const Color(0xFF1A2540),
          icon: const Icon(Icons.emoji_events, color: _boardGold, size: 42),
          title: Text(AppLocalizations.of(context)!.gameOverTitle,
              style: TextStyle(color: _boardGold, fontWeight: FontWeight.bold)),
          content: Text(AppLocalizations.of(context)!.congratulationsWinner(winner),
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
              label: Text(AppLocalizations.of(context)!.playAgain),
              style: FilledButton.styleFrom(
                  backgroundColor: _boardGold, foregroundColor: _boardNavy),
            ),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                navigator.maybePop();
              },
              icon: const Icon(Icons.exit_to_app),
              label: Text(AppLocalizations.of(context)!.exitGame),
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
                title: Text(AppLocalizations.of(context)!.backgammonTitle,
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                actions: [
                  IconButton(
                    tooltip: AppLocalizations.of(context)!.resetGame,
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
                      label: Text(AppLocalizations.of(context)!.resetGame),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: _boardGold,
                        side: const BorderSide(color: _boardGold),
                        padding: const EdgeInsets.symmetric(
                            vertical: 12, horizontal: 20),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    AppLocalizations.of(context)!.localDemoNote,
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
                label: Text(compact ? AppLocalizations.of(context)!.modeAICompact : AppLocalizations.of(context)!.modeVsAI,
                    style: TextStyle(fontSize: compact ? 10 : 12)),
                selected: _vsComputer,
                onSelected: _computerThinking ? null : (_) => _changeMode(true),
                selectedColor: _boardGold,
                labelStyle:
                    TextStyle(color: _vsComputer ? _boardNavy : Colors.white),
                visualDensity: VisualDensity.compact,
              ),
              ChoiceChip(
                label: Text(compact ? AppLocalizations.of(context)!.twoPlayersCompact : AppLocalizations.of(context)!.modeTwoPlayers,
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
              Text(AppLocalizations.of(context)!.boardThemeLabel, style: TextStyle(color: Colors.white70, fontSize: compact ? 10 : 12)),
              const SizedBox(width: 8),
              Expanded(child: DropdownButtonHideUnderline(child: DropdownButton<int>(
                value: _boardThemeIndex,
                isExpanded: true,
                dropdownColor: _boardNavy,
                style: TextStyle(color: _boardGold, fontSize: compact ? 11 : 13),
                items: List.generate(_boardThemeNames.length, (i) => DropdownMenuItem(value: i, child: Text(switch (i) { 0 => AppLocalizations.of(context)!.themeRoyalWood, 1 => AppLocalizations.of(context)!.themeEmeraldBoard, 2 => AppLocalizations.of(context)!.themeSapphireBoard, 3 => AppLocalizations.of(context)!.themeBurgundyBoard, _ => AppLocalizations.of(context)!.themeSilverBoard }))),
                onChanged: (value) { if (value != null) setState(() => _boardThemeIndex = value); },
              ))),
            ]),
            if (_vsComputer)
              Row(children: [
                Text(AppLocalizations.of(context)!.difficultyLabel,
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
                    items: [
                      DropdownMenuItem(
                          value: BackgammonDifficulty.easy,
                          child: Text(AppLocalizations.of(context)!.difficultyEasy)),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.medium,
                          child: Text(AppLocalizations.of(context)!.difficultyMedium)),
                      DropdownMenuItem(
                          value: BackgammonDifficulty.hard, child: Text(AppLocalizations.of(context)!.difficultyHard)),
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
                _modeControls(compact: true),
                const SizedBox(height: 6),
                Expanded(flex: 3, child: _statusPanel(compact: true)),
                const SizedBox(height: 8),
                Expanded(flex: 2, child: _scoreRow(compact: true)),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _reset,
                    icon: const Icon(Icons.restart_alt, size: 18),
                    label: Text(AppLocalizations.of(context)!.resetGame),
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
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: _boardThemes[_boardThemeIndex],
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
                      onPressed: _engine.dice.isEmpty &&
                              !_engine.finished &&
                              !_computerThinking &&
                              !(_vsComputer && _engine.currentPlayer == -1)
                          ? _roll
                          : null,
                      icon: const Icon(Icons.casino, size: 18),
                      label: Text(AppLocalizations.of(context)!.rollDice),
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
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: _tapBearOff,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 54,
                      padding: const EdgeInsets.symmetric(
                          vertical: 3, horizontal: 2),
                      decoration: BoxDecoration(
                        color: _selectedPoint != null
                            ? _boardGold.withValues(alpha: .22)
                            : Colors.white.withValues(alpha: .06),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _selectedPoint != null
                              ? _boardGold
                              : Colors.white24,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.exit_to_app, color: _boardGold, size: 17),
                          Text(AppLocalizations.of(context)!.bearOffShort,
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              )),
                          Text(
                              '${_engine.borneOff[_engine.currentPlayer == 1 ? 1 : 0]}/15',
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 9)),
                        ],
                      ),
                    ),
                  ),
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
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.casino_outlined, color: Colors.white54, size: 21),
          SizedBox(width: 4),
          Flexible(
            child: Text(
              AppLocalizations.of(context)!.diceTrayLabel,
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
                  child: Text(
                    '$die',
                    style: TextStyle(
                      color: _boardNavy,
                      fontSize: compact ? 14 : 16,
                      fontWeight: FontWeight.w900,
                    ),
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
                Text(AppLocalizations.of(context)!.barLabel,
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
        List.generate(shown, (_) => _checker(player, size: compact ? 10 : 17));
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
                    AppLocalizations.of(context)!.goldenPlayer, _engine.borneOff[1], _engine.bar[1], _boardGold,
                    compact: true)),
            const SizedBox(height: 6),
            Expanded(
                child: _scoreCard(
                    AppLocalizations.of(context)!.lightPlayer, _engine.borneOff[0], _engine.bar[0], _boardLight,
                    compact: true)),
          ],
        )
      : Row(
          children: [
            Expanded(
                child: _scoreCard(
                    AppLocalizations.of(context)!.goldenPlayer, _engine.borneOff[1], _engine.bar[1], _boardGold)),
            const SizedBox(width: 8),
            Expanded(
                child: _scoreCard(
                    AppLocalizations.of(context)!.lightPlayer, _engine.borneOff[0], _engine.bar[0], _boardLight)),
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
                child: Text(AppLocalizations.of(context)!.bearOffStatus(title, off, onBar),
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
