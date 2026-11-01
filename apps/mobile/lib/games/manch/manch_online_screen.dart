import 'dart:async';

import 'package:flutter/material.dart';

import 'iranian_manch_board.dart';
import 'manch_engine.dart';
import 'manch_game_state.dart';
import '../../services/manch_online_service.dart';

class ManchOnlineLobbyScreen extends StatefulWidget {
  const ManchOnlineLobbyScreen({super.key});

  @override
  State<ManchOnlineLobbyScreen> createState() => _ManchOnlineLobbyScreenState();
}

class _ManchOnlineLobbyScreenState extends State<ManchOnlineLobbyScreen> {
  List<Map<String, dynamic>> _matches = [];
  Map<String, dynamic>? _myMatch;
  String? _userId;
  String? _error;
  bool _loading = true;
  bool _openingGame = false;
  bool _refreshing = false;
  Timer? _poller;

  bool get _isPersian =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'fa';

  String _text(String fa, String en) => _isPersian ? fa : en;

  @override
  void initState() {
    super.initState();
    _refresh();
    _poller = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _refresh(silent: true),
    );
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if (!mounted || _refreshing || (_loading && silent)) return;
    _refreshing = true;
    if (!silent) setState(() => _loading = true);
    try {
      _userId ??= await ManchOnlineService.currentUserId();
      final mine = _myMatch;
      if (mine != null) {
        try {
          final refreshed = await ManchOnlineService.get(mine['id'].toString());
          if (!mounted) return;
          _myMatch = refreshed;
          if (refreshed['status'] == 'active') {
            _refreshing = false;
            await _openGame(refreshed['id'].toString());
            return;
          }
          if (refreshed['status'] == 'cancelled' ||
              refreshed['status'] == 'finished') {
            _myMatch = null;
          }
        } catch (error) {
          if (error.toString().contains('404')) {
            _myMatch = null;
          } else if (!silent) {
            rethrow;
          }
        }
      }
      final matches = await ManchOnlineService.listOpen();
      if (!mounted) return;
      setState(() {
        _matches = matches;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (!silent) _error = error.toString();
      });
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _create(int playerCount) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final match = await ManchOnlineService.create(playerCount: playerCount);
      if (!mounted) return;
      setState(() {
        _myMatch = match;
        _loading = false;
      });
      await _refresh(silent: true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _join(String id) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final match = await ManchOnlineService.join(id);
      if (!mounted) return;
      setState(() {
        _myMatch = match;
        _loading = false;
      });
      if (match['status'] == 'active') {
        await _openGame(id);
      } else {
        await _refresh(silent: true);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  Future<void> _cancelMine() async {
    final match = _myMatch;
    if (match == null) return;
    try {
      await ManchOnlineService.cancel(match['id'].toString());
      if (!mounted) return;
      setState(() {
        _myMatch = null;
        _error = _text('اتاق لغو شد.', 'Room cancelled.');
      });
      await _refresh(silent: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  Future<void> _openGame(String id) async {
    if (_openingGame || _userId == null || !mounted) return;
    _openingGame = true;
    _poller?.cancel();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ManchOnlineGameScreen(
          matchId: id,
          currentUserId: _userId!,
        ),
      ),
    );
    _openingGame = false;
    if (!mounted) return;
    _poller = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _refresh(silent: true),
    );
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final myMatch = _myMatch;
    return Scaffold(
      appBar: AppBar(
        title: Text(_text('منچ آنلاین', 'Online Manch')),
        actions: [
          IconButton(
            tooltip: _text('تازه‌سازی', 'Refresh'),
            onPressed: _loading ? null : _refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              _text('ساخت اتاق بازی', 'Create a room'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final count in [2, 3, 4])
                  FilledButton.tonal(
                    onPressed: _loading ? null : () => _create(count),
                    child: Text(
                      _text('$count نفره', '$count players'),
                    ),
                  ),
              ],
            ),
            if (myMatch != null) ...[
              const SizedBox(height: 20),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _text('اتاق شما', 'Your room'),
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _text(
                          'کد اتاق: ${myMatch['roomCode']?.toString() ?? '—'}',
                          'Room code: ${myMatch['roomCode']?.toString() ?? '—'}',
                        ),
                      ),
                      Text(
                        _text(
                          'بازیکنان: ${(myMatch['players'] as List?)?.length ?? 1} از ${myMatch['playerCount'] ?? 2}',
                          'Players: ${(myMatch['players'] as List?)?.length ?? 1} of ${myMatch['playerCount'] ?? 2}',
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        myMatch['status'] == 'active'
                            ? _text('بازی آماده است.', 'Game is ready.')
                            : _text(
                                'در انتظار پیوستن بازیکنان؛ اتاق پس از ۳۰ ثانیه منقضی می‌شود.',
                                'Waiting for players; the room expires after 30 seconds.',
                              ),
                      ),
                      if (myMatch['status'] == 'waiting')
                        Align(
                          alignment: AlignmentDirectional.centerEnd,
                          child: TextButton.icon(
                            onPressed: _cancelMine,
                            icon: const Icon(Icons.close),
                            label: Text(_text('لغو اتاق', 'Cancel room')),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 20),
            Text(
              _text('اتاق‌های قابل پیوستن', 'Open rooms'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (_loading && _matches.isEmpty)
              const Center(child: CircularProgressIndicator())
            else if (_matches.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Text(_text('اتاق بازی فعالی وجود ندارد.', 'No open rooms right now.')),
              )
            else
              for (final match in _matches)
                Card(
                  child: ListTile(
                    title: Text(
                      _text(
                        'اتاق ${match['roomCode']?.toString() ?? ''}',
                        'Room ${match['roomCode']?.toString() ?? ''}',
                      ),
                    ),
                    subtitle: Text(
                      _text(
                        '@${match['hostUsername']?.toString() ?? 'بازیکن'} • ${match['joinedPlayers'] ?? 1} از ${match['playerCount'] ?? 2}',
                        '@${match['hostUsername']?.toString() ?? 'player'} • ${match['joinedPlayers'] ?? 1} of ${match['playerCount'] ?? 2}',
                      ),
                    ),
                    trailing: FilledButton(
                      onPressed: _loading
                          ? null
                          : () => _join(match['id'].toString()),
                      child: Text(_text('پیوستن', 'Join')),
                    ),
                  ),
                ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ManchOnlineGameScreen extends StatefulWidget {
  const ManchOnlineGameScreen({
    super.key,
    required this.matchId,
    required this.currentUserId,
  });

  final String matchId;
  final String currentUserId;

  @override
  State<ManchOnlineGameScreen> createState() => _ManchOnlineGameScreenState();
}

class _ManchOnlineGameScreenState extends State<ManchOnlineGameScreen> {
  final _engine = const ManchEngine();
  ManchGameState? _state;
  List<Map<String, dynamic>> _players = [];
  String? _currentTurnUserId;
  String _status = 'در حال دریافت وضعیت بازی...';
  String? _error;
  String _matchStatus = 'active';
  int _stateVersion = 0;
  int? _lastDice;
  bool _busy = false;
  bool _loadingState = false;
  Timer? _poller;

  bool get _isPersian =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'fa';

  String _text(String fa, String en) => _isPersian ? fa : en;

  bool get _myTurn =>
      _currentTurnUserId == widget.currentUserId && _matchStatus == 'active';

  @override
  void initState() {
    super.initState();
    _load();
    _poller = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!mounted || _loadingState || (_busy && silent)) return;
    _loadingState = true;
    try {
      final match = await ManchOnlineService.get(widget.matchId);
      final rawState = match['gameState'];
      if (rawState is! Map) throw Exception('وضعیت بازی از سرور ناقص است.');
      final state = ManchGameState.fromJson(Map<String, Object?>.from(rawState));
      if (!mounted) return;
      setState(() {
        _state = state;
        _players = (match['players'] as List? ?? const [])
            .whereType<Map>()
            .map((player) => Map<String, dynamic>.from(player))
            .toList();
        _currentTurnUserId = match['currentTurnUserId']?.toString();
        _stateVersion = (match['stateVersion'] as num?)?.toInt() ?? 0;
        _matchStatus = match['status']?.toString() ?? 'active';
        _lastDice = state.pendingDice ?? _lastDice;
        _status = state.isFinished
            ? _text('بازی به پایان رسید.', 'The game has finished.')
            : _myTurn
                ? _text('نوبت شماست.', 'It is your turn.')
                : _text('در انتظار حرکت بازیکن دیگر...', 'Waiting for the other player...');
        _error = null;
      });
    } catch (error) {
      if (!mounted || silent) return;
      setState(() => _error = error.toString());
    } finally {
      _loadingState = false;
    }
  }

  Future<void> _roll() async {
    if (!_myTurn || _state == null || _state!.pendingDice != null || _busy) return;
    setState(() => _busy = true);
    try {
      final result = await ManchOnlineService.roll(
        widget.matchId,
        expectedStateVersion: _stateVersion,
      );
      final raw = result['state'];
      if (raw is! Map) throw Exception('پاسخ تاس از سرور ناقص است.');
      final state = ManchGameState.fromJson(Map<String, Object?>.from(raw));
      if (!mounted) return;
      setState(() {
        _state = state;
        _stateVersion = (result['stateVersion'] as num?)?.toInt() ?? _stateVersion + 1;
        _currentTurnUserId = result['currentTurnUserId']?.toString();
        _lastDice = (result['dice'] as num?)?.toInt();
        _status = result['turnLost'] == true
            ? _text('سه شش متوالی؛ نوبت خود را از دست دادی.', 'Three consecutive sixes; your turn was lost.')
            : result['autoPassed'] == true
                ? _text('حرکت قانونی نداشتی؛ نوبت بازیکن بعدی است.', 'No legal move; turn passed to the next player.')
                : result['noLegalMove'] == true
                    ? _text('حرکت قانونی نداری؛ به‌دلیل شش، دوباره تاس بینداز.', 'No legal move; roll again because you got a six.')
                    : _text('تاس انداخته شد؛ مهره را انتخاب کن.', 'Dice rolled; choose a token.');
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
      await _load(silent: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _move(ManchMove move) async {
    if (!_myTurn || _busy) return;
    setState(() => _busy = true);
    try {
      final result = await ManchOnlineService.move(
        widget.matchId,
        tokenIndex: move.tokenIndex,
        expectedStateVersion: _stateVersion,
      );
      final raw = result['state'];
      if (raw is! Map) throw Exception('پاسخ حرکت از سرور ناقص است.');
      final state = ManchGameState.fromJson(Map<String, Object?>.from(raw));
      if (!mounted) return;
      setState(() {
        _state = state;
        _stateVersion = (result['stateVersion'] as num?)?.toInt() ?? _stateVersion + 1;
        _currentTurnUserId = result['currentTurnUserId']?.toString();
        _matchStatus = result['status']?.toString() ?? _matchStatus;
        _status = state.isFinished
            ? _text('بازی تمام شد؛ برنده مشخص شد.', 'Game over; winner determined.')
            : _currentTurnUserId == widget.currentUserId
                ? _text('حرکت ثبت شد؛ تاس اضافه داری.', 'Move saved; you have an extra roll.')
                : _text('حرکت ثبت شد؛ نوبت حریف است.', 'Move saved; opponent turn.');
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
      await _load(silent: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Color _colour(ManchColour colour) => switch (colour) {
        ManchColour.red => const Color(0xFFD94747),
        ManchColour.green => const Color(0xFF239B69),
        ManchColour.yellow => const Color(0xFFF0C642),
        ManchColour.blue => const Color(0xFF397BD4),
      };

  String _colourName(ManchColour colour) => switch (colour) {
        ManchColour.red => _text('قرمز', 'Red'),
        ManchColour.green => _text('سبز', 'Green'),
        ManchColour.yellow => _text('زرد', 'Yellow'),
        ManchColour.blue => _text('آبی', 'Blue'),
      };

  @override
  Widget build(BuildContext context) {
    final state = _state;
    final activePlayer = state == null
        ? null
        : state.players[state.activePlayerIndex];
    final moves = state == null ? <ManchMove>[] : _engine.legalMoves(state);
    final activeSeat = activePlayer == null
        ? ManchSeat.red
        : ManchSeat.values.byName(activePlayer.colour.name);

    return Scaffold(
      appBar: AppBar(
        title: Text(_text('منچ آنلاین', 'Online Manch')),
        actions: [
          IconButton(
            onPressed: _busy ? null : _load,
            icon: const Icon(Icons.refresh),
            tooltip: _text('تازه‌سازی', 'Refresh'),
          ),
        ],
      ),
      body: state == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Text(_error!),
            )
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: activePlayer == null
                              ? Colors.grey
                              : _colour(activePlayer.colour),
                          child: Text((state.activePlayerIndex + 1).toString()),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(_status)),
                        Text(
                          (_lastDice ?? state.pendingDice)?.toString() ?? '—',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                      ],
                    ),
                  ),
                ),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final player in _players)
                      Chip(
                        avatar: CircleAvatar(
                          backgroundColor: _colour(
                            ManchColour.values.byName(
                              player['seatColour'].toString(),
                            ),
                          ),
                        ),
                        label: Text('@${player['username']?.toString() ?? 'player'}'),
                      ),
                  ],
                ),
                if (_myTurn && state.pendingDice == null && !state.isFinished)
                  FilledButton.icon(
                    onPressed: _busy ? null : _roll,
                    icon: const Icon(Icons.casino_outlined),
                    label: Text(_text('انداختن تاس', 'Roll dice')),
                  )
                else if (_myTurn && state.pendingDice != null)
                  Text(
                    _text('حرکت‌های مجاز', 'Legal moves'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                if (_myTurn && state.pendingDice != null)
                  for (final move in moves)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: OutlinedButton(
                        onPressed: _busy ? null : () => _move(move),
                        child: Text(
                          _text(
                            'مهره ${move.tokenIndex + 1} را حرکت بده',
                            'Move token ${move.tokenIndex + 1}',
                          ),
                        ),
                      ),
                    ),
                const SizedBox(height: 10),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
                    child: IranianManchBoard(
                      activeSeat: activeSeat,
                      gameState: state,
                      showSampleTokens: false,
                    ),
                  ),
                ),
                if (state.isFinished)
                  Text(
                    _text('برنده: ', 'Winner: ') +
                        _colourName(state.players[state.winnerIndex!].colour),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                if (_error != null)
                  Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
              ],
            ),
    );
  }
}
