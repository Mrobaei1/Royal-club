import 'dart:math';

import 'package:flutter/material.dart';

import 'iranian_manch_board.dart';
import 'manch_bot.dart';
import 'manch_engine.dart';
import 'manch_game_state.dart';
import 'manch_rule_profile.dart';

/// Local pass-and-play mode. Online play uses a separate server-authoritative
/// controller; this widget deliberately keeps all state on this device.
class ManchOfflineGameScreen extends StatefulWidget {
  const ManchOfflineGameScreen({
    super.key,
    this.playerCount = 2,
    this.profile = const ManchRuleProfile(),
    this.diceRoller,
    this.botPlayers = const {},
  }) : assert(playerCount >= 2 && playerCount <= 4);

  final int playerCount;
  final ManchRuleProfile profile;
  final int Function()? diceRoller;
  final Set<ManchColour> botPlayers;

  @override
  State<ManchOfflineGameScreen> createState() => _ManchOfflineGameScreenState();
}

class _ManchOfflineGameScreenState extends State<ManchOfflineGameScreen> {
  final _engine = const ManchEngine();
  final _random = Random();
  final _bot = const ManchBot();
  late final Set<ManchColour> _botPlayers =
      Set<ManchColour>.unmodifiable(widget.botPlayers);
  late ManchGameState _state;
  int? _lastDice;
  String _message = 'برای شروع نوبت، تاس را بینداز.';

  @override
  void initState() {
    super.initState();
    _state = _engine.newGame(
      playerCount: widget.playerCount,
      profile: widget.profile,
    );
    if (_isBotTurn) _scheduleBotTurn();
  }

  bool get _isBotTurn =>
      _botPlayers.contains(_state.players[_state.activePlayerIndex].colour);

  void _scheduleBotTurn() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _runBotTurn());
  }

  void _runBotTurn() {
    if (!mounted || _state.isFinished || !_isBotTurn ||
        _state.pendingDice != null) {
      return;
    }
    final dice = widget.diceRoller?.call() ?? _random.nextInt(6) + 1;
    if (dice < 1 || dice > 6) {
      throw StateError('Dice roller must return a value from 1 to 6.');
    }
    var next = _engine.roll(_state, dice);
    final moves = _engine.legalMoves(next);
    if (moves.isEmpty) {
      final playerIndex = next.activePlayerIndex;
      next = _engine.passTurn(next);
      setState(() {
        _state = next;
        _lastDice = dice;
        _message = next.activePlayerIndex == playerIndex
            ? 'هوش مصنوعی شش آورد اما حرکت ندارد؛ دوباره تاس می‌اندازد.'
            : 'هوش مصنوعی حرکت قانونی نداشت.';
      });
    } else {
      final chosen = _bot.chooseMove(next)!;
      next = _engine.move(next, chosen.tokenIndex);
      setState(() {
        _state = next;
        _lastDice = dice;
        _message = next.isFinished
            ? 'هوش مصنوعی برنده شد!'
            : 'هوش مصنوعی مهره خود را حرکت داد.';
      });
    }
    if (mounted && !next.isFinished && _isBotTurn) _scheduleBotTurn();
  }

  void _rollDice() {
    if (_state.isFinished || _state.pendingDice != null || _isBotTurn) return;
    final dice = widget.diceRoller?.call() ?? _random.nextInt(6) + 1;
    if (dice < 1 || dice > 6) {
      throw StateError('Dice roller must return a value from 1 to 6.');
    }
    var next = _engine.roll(_state, dice);
    var message = 'عدد تاس: $dice';
    if (_engine.legalMoves(next).isEmpty) {
      final currentPlayer = next.activePlayerIndex;
      next = _engine.passTurn(next);
      message = next.activePlayerIndex == currentPlayer
          ? 'شش آمد اما حرکت قانونی نداشتی؛ دوباره تاس بینداز.'
          : 'حرکت قانونی نداشتی؛ نوبت بازیکن بعدی است.';
    }
    setState(() {
      _state = next;
      _lastDice = dice;
      _message = message;
    });
    if (mounted && !next.isFinished && _isBotTurn) _scheduleBotTurn();
  }

  void _moveToken(ManchMove move) {
    if (_state.pendingDice == null || _state.isFinished || _isBotTurn) return;
    final next = _engine.move(_state, move.tokenIndex);
    final won = next.isFinished;
    final winnerName = won
        ? _playerName(next.players[next.winnerIndex ?? 0].colour)
        : '';
    setState(() {
      _state = next;
      _message = won
          ? 'بازیکن $winnerName برنده شد!'
          : next.activePlayerIndex == move.playerIndex
              ? 'حرکت انجام شد؛ نوبت اضافه داری.'
              : 'حرکت انجام شد؛ نوبت بازیکن بعدی است.';
    });
    if (mounted && !next.isFinished && _isBotTurn) _scheduleBotTurn();
  }

  void _restart() {
    setState(() {
      _state = _engine.newGame(
        playerCount: widget.playerCount,
        profile: widget.profile,
      );
      _lastDice = null;
      _message = 'بازی تازه شروع شد؛ تاس را بینداز.';
    });
    if (_isBotTurn) _scheduleBotTurn();
  }

  Color _colour(ManchColour colour) => switch (colour) {
        ManchColour.red => const Color(0xFFD94747),
        ManchColour.green => const Color(0xFF239B69),
        ManchColour.yellow => const Color(0xFFF0C642),
        ManchColour.blue => const Color(0xFF397BD4),
      };

  String _playerName(ManchColour colour) => switch (colour) {
        ManchColour.red => 'قرمز',
        ManchColour.green => 'سبز',
        ManchColour.yellow => 'زرد',
        ManchColour.blue => 'آبی',
      };

  ManchSeat _seat(ManchColour colour) => ManchSeat.values.byName(colour.name);

  String _positionLabel(int progress) {
    if (progress == -1) return 'حیاط';
    if (progress == ManchEngine.finish) return 'پایان';
    if (progress >= 52) return 'خانه ${progress - 51} از 5';
    return 'مسیر ${progress + 1} از 52';
  }

  @override
  Widget build(BuildContext context) {
    final activePlayer = _state.players[_state.activePlayerIndex];
    final legalMoves = _engine.legalMoves(_state);

    return Scaffold(
      appBar: AppBar(
        title: const Text('منچ ایرانی — بازی آفلاین'),
        actions: [
          IconButton(
            tooltip: 'شروع دوباره',
            onPressed: _restart,
            icon: const Icon(Icons.restart_alt_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: _colour(activePlayer.colour),
                        child: Text(
                          (_state.activePlayerIndex + 1).toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'نوبت بازیکن ${_playerName(activePlayer.colour)}',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(_message),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                        child: Text(
                          _lastDice?.toString() ?? '—',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: IranianManchBoard(
                    activeSeat: _seat(activePlayer.colour),
                    gameState: _state,
                    showSampleTokens: false,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              if (_state.isFinished)
                FilledButton.icon(
                  onPressed: _restart,
                  icon: const Icon(Icons.refresh),
                  label: const Text('بازی جدید'),
                )
              else if (_isBotTurn)
                const FilledButton.icon(
                  onPressed: null,
                  icon: Icon(Icons.smart_toy_outlined),
                  label: Text('هوش مصنوعی در حال بازی است...'),
                )
              else if (_state.pendingDice == null)
                FilledButton.icon(
                  onPressed: _rollDice,
                  icon: const Icon(Icons.casino_outlined),
                  label: const Text('انداختن تاس'),
                )
              else ...[
                Text(
                  'حرکت‌های مجاز',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                for (final move in legalMoves)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton(
                      onPressed: () => _moveToken(move),
                      child: Text(
                        'مهره ${move.tokenIndex + 1}: ${_positionLabel(move.fromProgress)} ← ${_positionLabel(move.toProgress)}',
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 12),
              Text(
                'وضعیت مهره‌ها',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              for (var p = 0; p < _state.players.length; p++)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 7,
                              backgroundColor:
                                  _colour(_state.players[p].colour),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'بازیکن ${_playerName(_state.players[p].colour)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Spacer(),
                            if (p == _state.activePlayerIndex)
                              const Text('نوبت فعلی'),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: [
                            for (var t = 0; t < 4; t++)
                              Chip(
                                label: Text(
                                  '${t + 1}: ${_positionLabel(_state.players[p].tokens[t])}',
                                ),
                                visualDensity: VisualDensity.compact,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
