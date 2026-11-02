import 'dart:async';
import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'uno_chat_panel.dart';

class UnoOnlineScreen extends StatefulWidget {
  const UnoOnlineScreen({
    super.key,
    required this.serverUrl,
    required this.accessToken,
    required this.playerId,
  });

  final String serverUrl;
  final String accessToken;
  final String playerId;

  @override
  State<UnoOnlineScreen> createState() => _UnoOnlineScreenState();
}

class _UnoOnlineScreenState extends State<UnoOnlineScreen> {
  io.Socket? _socket;
  Map<String, dynamic>? _room;
  Map<String, dynamic>? _game;
  List<dynamic> _hand = [];
  String? _drawnCardId;
  final List<Map<String, dynamic>> _messages = [];
  final _codeController = TextEditingController();
  final _chatController = TextEditingController();
  bool _busy = false;
  String? _error;

  bool get _isPersian => Localizations.localeOf(context).languageCode == 'fa';
  String _t(String fa, String en) => _isPersian ? fa : en;

  @override
  void initState() {
    super.initState();
    _connect();
  }

  void _connect() {
    final socket = io.io(
      widget.serverUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': widget.accessToken})
          .disableAutoConnect()
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) {
      if (mounted) setState(() => _error = null);
      final code = _room?['code']?.toString();
      if (code != null) _restoreRoom(code);
    });
    socket.onConnectError((error) { if (mounted) setState(() => _error = _t('اتصال به سرور برقرار نشد: $error', 'Could not connect to server: $error')); });
    socket.on('uno:room:state', (data) {
      if (!mounted) return;
      final room = Map<String, dynamic>.from(data as Map);
      setState(() => _room = room);
    });
    socket.on('uno:game:state', (data) {
      if (!mounted) return;
      setState(() => _game = Map<String, dynamic>.from(data as Map));
    });
    socket.on('uno:game:private', (data) {
      if (!mounted) return;
      final privateState = Map<String, dynamic>.from(data as Map);
      setState(() => _drawnCardId = privateState['drawnCardId'] as String?);
    });
    socket.on('uno:game:hand', (data) {
      if (!mounted) return;
      setState(() => _hand = List<dynamic>.from(data as List));
    });
    socket.on('uno:chat:message', (data) {
      if (!mounted) return;
      setState(() => _messages.add(Map<String, dynamic>.from(data as Map)));
    });
    socket.connect();
  }

  Future<void> _restoreRoom(String code) async {
    try {
      final result = await _emit('uno:room:reconnect', {'code': code});
      if (result['ok'] != true || !mounted) return;
      final data = Map<String, dynamic>.from(result['data'] as Map);
      final room = Map<String, dynamic>.from(data['room'] as Map);
      setState(() => _room = room);
      if (data['game'] is Map) {
        setState(() => _game = Map<String, dynamic>.from(data['game'] as Map));
        if (data['hand'] is List) setState(() => _hand = List<dynamic>.from(data['hand'] as List));
      }
    } catch (_) { /* Reconnect is best-effort; the next room action reports errors. */ }
  }

  Future<Map<String, dynamic>> _emit(String event, Map<String, dynamic> payload) async {
    final completer = Completer<Map<String, dynamic>>();
    _socket?.emitWithAck(event, payload, ack: (data) {
      if (!completer.isCompleted) completer.complete(Map<String, dynamic>.from(data as Map));
    });
    return completer.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () => {'ok': false, 'error': {'message': _t('پاسخی از سرور دریافت نشد.', 'The server did not respond.')}},
    );
  }

  Future<void> _run(String event, Map<String, dynamic> payload) async {
    if (!mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      final result = await _emit(event, payload);
      if (!mounted) return;
      if (result['ok'] != true) {
        final error = Map<String, dynamic>.from(result['error'] as Map? ?? {});
        throw StateError(error['message']?.toString() ?? _t('عملیات انجام نشد.', 'The operation failed.'));
      }
      final data = result['data'];
      if (event == 'uno:room:create' || event == 'uno:room:join') {
        final map = Map<String, dynamic>.from(data as Map);
        final room = Map<String, dynamic>.from(map['room'] as Map);
        setState(() {
          _room = room;
          _game = null;
          _hand = [];
          _drawnCardId = null;
          _messages.clear();
        });
      }
      if (event == 'uno:room:leave') {
        setState(() {
          _room = null;
          _game = null;
          _hand = [];
          _drawnCardId = null;
          _messages.clear();
        });
      }
      if (event == 'uno:room:start') {
        final map = Map<String, dynamic>.from(data as Map);
        setState(() => _game = Map<String, dynamic>.from(map['game'] as Map));
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString().replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _playCard(Map<String, dynamic> card) async {
    String? chosenColor;
    if (card['color'] == 'wild') {
      chosenColor = await showModalBottomSheet<String>(
        context: context,
        builder: (context) => SafeArea(
          child: Wrap(children: ['red', 'yellow', 'green', 'blue'].map((color) =>
            ListTile(leading: CircleAvatar(backgroundColor: _cardColor(color)), title: Text(_colorName(color)), onTap: () => Navigator.pop(context, color)),
          ).toList()),
        ),
      );
      if (chosenColor == null) return;
    }
    final code = _room?['code']?.toString() ?? '';
    await _run('uno:game:action', {'code': code, 'action': {'type': 'play', 'cardId': card['id'], if (chosenColor != null) 'chosenColor': chosenColor}});
  }

  Future<void> _sendChat() async {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    final code = _room?['code']?.toString() ?? '';
    await _run('uno:chat:send', {'code': code, 'text': text});
    if (mounted && _error == null) _chatController.clear();
  }

  Color _cardColor(Object? color) => switch (color) {
    'red' => Colors.red.shade700,
    'yellow' => Colors.amber.shade600,
    'green' => Colors.green.shade700,
    'blue' => Colors.blue.shade700,
    _ => Colors.black87,
  };
  String _colorName(String color) => switch (color) {'red' => _t('قرمز', 'Red'), 'yellow' => _t('زرد', 'Yellow'), 'green' => _t('سبز', 'Green'), _ => _t('آبی', 'Blue')};

  @override
  void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    _codeController.dispose();
    _chatController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    return Scaffold(
      appBar: AppBar(title: Text(_t('UNO آنلاین', 'Online UNO'))),
      body: _busy ? const Center(child: CircularProgressIndicator()) : room == null ? _buildLobby() : _buildRoom(room),
    );
  }

  Widget _buildLobby() => ListView(padding: const EdgeInsets.all(20), children: [
    Text(_t('یک میز بساز یا با کد میز وارد شو.', 'Create a table or join with its code.'), style: const TextStyle(fontSize: 18)),
    const SizedBox(height: 16),
    FilledButton.icon(onPressed: () => _run('uno:room:create', {}), icon: const Icon(Icons.add), label: Text(_t('ساخت میز جدید', 'Create table'))),
    const SizedBox(height: 18),
    TextField(controller: _codeController, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: _t('کد میز', 'Table code'), border: OutlineInputBorder())),
    const SizedBox(height: 8),
    OutlinedButton(onPressed: () => _run('uno:room:join', {'code': _codeController.text}), child: Text(_t('ورود به میز', 'Join table'))),
    if (_error != null) _errorText(),
  ]);

  Widget _buildRoom(Map<String, dynamic> room) {
    final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
    final isHost = room['hostId'] == widget.playerId;
    final ready = players.firstWhere((p) => p['id'] == widget.playerId, orElse: () => {})['ready'] == true;
    final code = room['code'].toString();
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${_t('کد میز', 'Table code')}: $code', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
        Text(_t('ظرفیت: ${players.length}/6 — حداقل ۲ نفر', 'Players: ${players.length}/6 — minimum 2')),
        Text(_t('برد لازم برای قهرمانی: ${room['matchToWin'] ?? 1}  |  دست‌های انجام‌شده: ${room['roundsPlayed'] ?? 0}', 'Wins to win match: ${room['matchToWin'] ?? 1}  |  Rounds played: ${room['roundsPlayed'] ?? 0}')),
        if (isHost && (room['roundsPlayed'] ?? 0) == 0)
          Row(children: [
            Expanded(child: Text(_t('تعداد برد لازم برای قهرمانی', 'Wins needed to win the match'))),
            DropdownButton<int>(
              value: (room['matchToWin'] as int?) ?? 1,
              items: const [1, 3, 5].map((value) => DropdownMenuItem<int>(
                value: value,
                child: Text(_t('$value برد', '$value wins')),
              )).toList(),
              onChanged: (value) {
                if (value != null) _run('uno:room:match-to-win', {'code': code, 'rounds': value});
              },
            ),
          ]),
        const Divider(),
        ...players.map((p) => ListTile(
          dense: true, leading: Icon(p['id'] == room['hostId'] ? Icons.workspace_premium : Icons.person),
          title: Text('@${p['username']}'),
          subtitle: Text('${p['ready'] == true ? _t('آماده', 'Ready') : _t('در انتظار آمادگی', 'Not ready')} • ${_t('برد', 'Wins')}: ${(room['roundsWon'] as Map?)?[p['id']] ?? 0} • ${_t('امتیاز', 'Points')}: ${(room['totalPoints'] as Map?)?[p['id']] ?? 0}'),

        )),
        if (room['status'] == 'waiting' || room['status'] == 'ready')
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => _run('uno:room:ready', {'code': code, 'ready': !ready}), child: Text(ready ? _t('لغو آمادگی', 'Not ready') : _t('آماده‌ام', 'Ready')))),
            const SizedBox(width: 8),
            if (isHost) Expanded(child: FilledButton(onPressed: room['status'] == 'ready' ? () => _run('uno:room:start', {'code': code}) : null, child: Text(_t('شروع بازی', 'Start game')))),
          ]),
        if (room['status'] == 'waiting')
          Text((room['roundsPlayed'] ?? 0) > 0
              ? _t('این دست تمام شد؛ برای دست بعد همه بازیکنان باید دوباره آماده شوند.', 'This round is over; everyone must ready up again for the next round.')
              : _t('شروع بازی فقط پس از آمادگی همه و با دستور میزبان امکان‌پذیر است.', 'The host can start only after every player is ready.')),
        if (room['status'] == 'finished')
          Text('${_t('قهرمان مسابقه', 'Match champion')}: @${players.firstWhere((p) => p['id'] == room['matchWinnerId'], orElse: () => {})['username'] ?? ''}'),
        if (isHost) SwitchListTile(title: Text(_t('فعال‌بودن چت', 'Enable chat')), value: room['chatEnabled'] == true, onChanged: (value) => _run('uno:room:communication', {'code': code, 'setting': 'chatEnabled', 'enabled': value})),
        if (room['status'] != 'playing') TextButton.icon(onPressed: () => _run('uno:room:leave', {'code': code}), icon: const Icon(Icons.exit_to_app), label: Text(_t('خروج از میز', 'Leave table'))),
      ]))),
      if (_game != null) _buildGame(code),
      _buildChat(room),
      if (_error != null) _errorText(),
    ]);
  }

  Widget _buildGame(String code) {
    final game = _game!;
    final top = Map<String, dynamic>.from(game['discardTop'] as Map);
    final currentId = game['currentPlayerId'];
    final myTurn = currentId == widget.playerId;
    final pendingWild4 = game['pendingWild4'] is Map && (game['pendingWild4'] as Map)['targetId'] == widget.playerId;
    final openingColorPending = game['openingColorPendingPlayerId'] == widget.playerId;
    final gameOver = game['winnerId'] != null;
    final winner = gameOver ? List<Map<String, dynamic>>.from((game['players'] as List).map((p) => Map<String, dynamic>.from(p as Map))).firstWhere((p) => p['id'] == game['winnerId'], orElse: () => {}) : <String, dynamic>{};
    final color = game['activeColor']?.toString() ?? top['color'].toString();
    return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [
      Text(gameOver
          ? (_room?['matchWinnerId'] != null
              ? '${_t('قهرمان مسابقه', 'Match champion')}: @${winner['username'] ?? ''} • ${_t('امتیاز این دست', 'Round points')}: ${game['winnerScore'] ?? 0}'
              : '${_t('برنده این دست', 'Round winner')}: @${winner['username'] ?? ''} • ${_t('امتیاز', 'Points')}: ${game['winnerScore'] ?? 0}')
          : (myTurn ? _t('نوبت شماست', 'Your turn') : _t('نوبت بازیکن دیگر', 'Another player’s turn'))),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _unoCard(top, large: true),
        const SizedBox(width: 14),
        Column(children: [Text('${_t('رنگ فعال', 'Active color')}: ${_colorName(color)}'), Text('${_t('کارت‌های باقی‌مانده', 'Cards in draw pile')}: ${game['drawCount']}')]),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 6, runSpacing: 6, alignment: WrapAlignment.center, children: _hand.map((raw) => InkWell(
        onTap: myTurn && !gameOver && !pendingWild4 && !openingColorPending && (_drawnCardId == null || Map<String, dynamic>.from(raw as Map)['id'] == _drawnCardId) ? () => _playCard(Map<String, dynamic>.from(raw as Map)) : null,
        child: _unoCard(Map<String, dynamic>.from(raw as Map)),
      )).toList()),
      if (myTurn && !gameOver && openingColorPending) Wrap(spacing: 8, children: [
        for (final option in const ['red', 'yellow', 'green', 'blue'])
          FilledButton(onPressed: _busy ? null : () => _run('uno:game:action', {'code': code, 'action': {'type': 'chooseColor', 'color': option}}), child: Text(_colorName(option))),
      ]),
      if (myTurn && !gameOver && !openingColorPending) Wrap(spacing: 8, children: [
        if (pendingWild4) ...[
          FilledButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'challengeWild4'}}), child: Text(_t('چالش +۴', 'Challenge +4'))),
          OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'draw'}}), child: Text(_t('قبول +۴ و برداشتن ۴ کارت', 'Accept +4 (draw four)'))),
        ] else if (_drawnCardId == null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'draw'}}), child: Text(_t('برداشتن کارت', 'Draw card'))),
        if (_drawnCardId != null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'pass'}}), child: Text(_t('پایان نوبت', 'End turn'))),
      ]),
      if (game['unoPendingPlayerId'] != null && game['unoPendingPlayerId'] != widget.playerId && !gameOver)
        OutlinedButton(onPressed: _busy ? null : () => _run('uno:game:action', {'code': code, 'action': {'type': 'catchUno'}}), child: Text(_t('اعلام تخلف UNO', 'Catch UNO'))),
      if (game['unoPendingPlayerId'] == widget.playerId) TextButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'callUno'}}), child: Text(_t('UNO!', 'UNO!'))),
    ])));
  }

  Widget _unoCard(Map<String, dynamic> card, {bool large = false}) {
    final color = _cardColor(card['color']);
    return Container(
      width: large ? 70 : 48, height: large ? 104 : 72,
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(9), border: Border.all(color: Colors.white, width: 2)),
      alignment: Alignment.center,
      child: Text(card['face'].toString().toUpperCase(), style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: large ? 18 : 12)),
    );
  }

  Widget _buildChat(Map<String, dynamic> room) => UnoChatPanel(
        controller: _chatController,
        messages: _messages,
        enabled: room['chatEnabled'] == true,
        onSend: _sendChat,
      );

  Widget _errorText() => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Text(_error!, style: const TextStyle(color: Colors.red)),
  );
}
