import 'dart:math';

import 'package:flutter/material.dart';

import '../../l10n/app_text.dart';

import 'iranian_manch_board.dart';
import 'manch_bot.dart';
import 'manch_engine.dart';
import 'manch_game_state.dart';
import 'manch_rule_profile.dart';
import 'manch_save_store.dart';

/// Local pass-and-play mode. Online play uses a separate server-authoritative
/// controller; this widget deliberately keeps all state on this device.
class ManchOfflineGameScreen extends StatefulWidget {
  const ManchOfflineGameScreen({
    super.key,
    this.playerCount = 2,
    this.profile = const ManchRuleProfile(),
    this.diceRoller,
    this.botPlayers = const {},
    this.botDifficulty = ManchBotDifficulty.normal,
    this.saveStore,
  }) : assert(playerCount >= 2 && playerCount <= 4);

  final int playerCount;
  final ManchRuleProfile profile;
  final int Function()? diceRoller;
  final Set<ManchColour> botPlayers;
  final ManchBotDifficulty botDifficulty;
  final ManchSaveStore? saveStore;

  @override
  State<ManchOfflineGameScreen> createState() => _ManchOfflineGameScreenState();
}

class _ManchOfflineGameScreenState extends State<ManchOfflineGameScreen> {
  final _engine = const ManchEngine();
  final _random = Random();
  final _bot = const ManchBot();
  late final ManchSaveStore _saveStore =
      widget.saveStore ?? const SecureManchSaveStore();
  late final Set<ManchColour> _botPlayers =
      Set<ManchColour>.unmodifiable(widget.botPlayers);
  late ManchBotDifficulty _botDifficulty = widget.botDifficulty;
  late ManchGameState _state;
  int? _lastDice;
  bool _matchStarted = false;
  String _message = 'برای شروع نوبت، تاس را بینداز.';
  bool _messageLocalized = false;

  @override
  void initState() {
    super.initState();
    _state = _engine.newGame(
      playerCount: widget.playerCount,
      profile: widget.profile,
    );
    if (_isBotTurn) _scheduleBotTurn();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_messageLocalized) {
      _message = _text(
        'برای شروع نوبت، تاس را بینداز.',
        'Roll the die to start your turn.',
      );
      _messageLocalized = true;
    }
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
    _matchStarted = true;
    var next = _engine.roll(_state, dice);
    final moves = _engine.legalMoves(next);
    if (next.pendingDice == null) {
      setState(() {
        _state = next;
        _lastDice = dice;
        _message = _text('هوش مصنوعی سه شش متوالی آورد و نوبتش را از دست داد.', 'The AI rolled three consecutive sixes and lost its turn.');
      });
    } else if (moves.isEmpty) {
      final playerIndex = next.activePlayerIndex;
      next = _engine.passTurn(next);
      setState(() {
        _state = next;
        _lastDice = dice;
        _message = next.activePlayerIndex == playerIndex
            ? _text('هوش مصنوعی شش آورد اما حرکت ندارد؛ دوباره تاس می‌اندازد.', 'The AI rolled a six but has no legal move; it rolls again.')
            : _text('هوش مصنوعی حرکت قانونی نداشت.', 'The AI had no legal move.');
      });
    } else {
      final chosen = _bot.chooseMove(
        next,
        difficulty: _botDifficulty,
      )!;
      next = _engine.move(next, chosen.tokenIndex);
      setState(() {
        _state = next;
        _lastDice = dice;
        _message = next.isFinished
            ? _text('هوش مصنوعی برنده شد!', 'The AI wins!')
            : _text('هوش مصنوعی مهره خود را حرکت داد.', 'The AI moved a token.');
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
    _matchStarted = true;
    var next = _engine.roll(_state, dice);
    var message = _text('عدد تاس: $dice', 'Dice: $dice');
    if (next.pendingDice == null) {
      message = _text('سه شش متوالی؛ نوبت خود را از دست دادی.', 'Three consecutive sixes; you lose your turn.');
    } else if (_engine.legalMoves(next).isEmpty) {
      final currentPlayer = next.activePlayerIndex;
      next = _engine.passTurn(next);
      message = next.activePlayerIndex == currentPlayer
          ? _text('شش آمد اما حرکت قانونی نداشتی؛ دوباره تاس بینداز.', 'You rolled a six but have no legal move; roll again.')
          : _text('حرکت قانونی نداشتی؛ نوبت بازیکن بعدی است.', 'No legal move; the next player takes a turn.');
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
          ? _text('بازیکن $winnerName برنده شد!', 'Player $winnerName wins!')
          : next.activePlayerIndex == move.playerIndex
              ? _text('حرکت انجام شد؛ نوبت اضافه داری.', 'Move completed; you get another turn.')
              : _text('حرکت انجام شد؛ نوبت بازیکن بعدی است.', 'Move completed; next player\'s turn.');
    });
    if (mounted && !next.isFinished && _isBotTurn) _scheduleBotTurn();
  }

  Future<void> _saveGame() async {
    try {
      await _saveStore.save(_state);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_text('بازی ذخیره شد.', 'Game saved.'))),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_text('ذخیره بازی انجام نشد: $error', 'Could not save game: $error'))),
      );
    }
  }

  Future<void> _restoreGame() async {
    try {
      final restored = await _saveStore.load();
      if (!mounted) return;
      if (restored == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_text('بازی ذخیره‌شده‌ای پیدا نشد.', 'No saved game was found.'))),
        );
        return;
      }
      setState(() {
        _state = restored;
        _matchStarted = restored.turnNumber > 1 ||
            restored.pendingDice != null ||
            restored.players.any((player) => player.tokens.any((position) => position != -1));
        _lastDice = restored.pendingDice;
        _message = _text('بازی ذخیره‌شده بازیابی شد.', 'Saved game restored.');
      });
      if (_isBotTurn) _scheduleBotTurn();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_text('بازیابی انجام نشد: $error', 'Could not restore game: $error'))),
      );
    }
  }

  void _restart() {
    setState(() {
      _state = _engine.newGame(
        playerCount: widget.playerCount,
        profile: widget.profile,
      );
      _matchStarted = false;
      _lastDice = null;
      _message = _text('بازی تازه شروع شد؛ تاس را بینداز.', 'A new game has started; roll the die.');
    });
    if (_isBotTurn) _scheduleBotTurn();
  }

  Color _colour(ManchColour colour) => switch (colour) {
        ManchColour.red => const Color(0xFFD94747),
        ManchColour.green => const Color(0xFF239B69),
        ManchColour.yellow => const Color(0xFFF0C642),
        ManchColour.blue => const Color(0xFF397BD4),
      };

  String _text(String fa, String en) => appText(context, fa, en);

  String _playerName(ManchColour colour) => switch (colour) {
        ManchColour.red => _text('قرمز', 'Red'),
        ManchColour.green => _text('سبز', 'Green'),
        ManchColour.yellow => _text('زرد', 'Yellow'),
        ManchColour.blue => _text('آبی', 'Blue'),
      };

  ManchSeat _seat(ManchColour colour) => ManchSeat.values.byName(colour.name);

  String _positionLabel(int progress) {
    if (progress == -1) return _text('حیاط', 'Yard');
    if (progress == ManchEngine.finish) return _text('پایان', 'Finished');
    if (progress >= 52) return _text('خانه ${progress - 51} از 5', 'Home ${progress - 51} of 5');
    return _text('مسیر ${progress + 1} از 52', 'Track ${progress + 1} of 52');
  }

  @override
  Widget build(BuildContext context) {
    final activePlayer = _state.players[_state.activePlayerIndex];
    final legalMoves = _engine.legalMoves(_state);

    return Scaffold(
      appBar: AppBar(
        title: Text(_text('منچ ایرانی — بازی آفلاین', 'Iranian Manch — Offline')),
        actions: [
          IconButton(
            tooltip: _text('شروع دوباره', 'Restart'),
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
                              _text('نوبت بازیکن ${_playerName(activePlayer.colour)}', "${_playerName(activePlayer.colour)}'s turn"),
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
              if (_botPlayers.isNotEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    child: Row(
                      children: [
                        Expanded(child: Text(_text('سطح هوش مصنوعی', 'AI difficulty'))),
                        DropdownButton<ManchBotDifficulty>(
                          value: _botDifficulty,
                          onChanged: !_matchStarted && _state.pendingDice == null
                              ? (value) {
                                  if (value != null) {
                                    setState(() => _botDifficulty = value);
                                  }
                                }
                              : null,
                          items: [
                            DropdownMenuItem(
                              value: ManchBotDifficulty.easy,
                              child: Text(_text('آسان', 'Easy')),
                            ),
                            DropdownMenuItem(
                              value: ManchBotDifficulty.normal,
                              child: Text(_text('معمولی', 'Normal')),
                            ),
                            DropdownMenuItem(
                              value: ManchBotDifficulty.hard,
                              child: Text(_text('سخت', 'Hard')),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              if (!_state.isFinished && _isBotTurn)
                FilledButton.icon(
                  onPressed: null,
                  icon: const Icon(Icons.smart_toy_outlined),
                  label: Text(_text('هوش مصنوعی در حال بازی است...', 'AI is thinking...')),
                )
              else if (!_state.isFinished && _state.pendingDice == null)
                FilledButton.icon(
                  onPressed: _rollDice,
                  icon: const Icon(Icons.casino_outlined),
                  label: Text(_text('انداختن تاس', 'Roll die')),
                ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed: _saveGame,
                    icon: const Icon(Icons.save_outlined),
                    label: Text(_text('ذخیره', 'Save')),
                  ),
                  OutlinedButton.icon(
                    onPressed: _restoreGame,
                    icon: const Icon(Icons.restore_rounded),
                    label: Text(_text('بازیابی', 'Restore')),
                  ),
                ],
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
                  label: Text(_text('بازی جدید', 'New game')),
                )
              else if (_state.pendingDice != null) ...[
                Text(
                  _text('حرکت‌های مجاز', 'Legal moves'),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                for (final move in legalMoves)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: OutlinedButton(
                      onPressed: () => _moveToken(move),
                      child: Text(
                        _text('مهره ${move.tokenIndex + 1}: ${_positionLabel(move.fromProgress)} ← ${_positionLabel(move.toProgress)}', 'Token ${move.tokenIndex + 1}: ${_positionLabel(move.fromProgress)} ← ${_positionLabel(move.toProgress)}'),
                      ),
                    ),
                  ),
              ],
              const SizedBox(height: 12),
              Text(
                _text('وضعیت مهره‌ها', 'Token status'),
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
                              _text('بازیکن ${_playerName(_state.players[p].colour)}', 'Player ${_playerName(_state.players[p].colour)}'),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const Spacer(),
                            if (p == _state.activePlayerIndex)
                              Text(_text('نوبت فعلی', 'Current turn')),
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
