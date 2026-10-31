import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:permission_handler/permission_handler.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'uno_voice_mesh.dart';

class UnoOnlineScreen extends StatefulWidget {
  const UnoOnlineScreen({
    super.key,
    required this.serverUrl,
    required this.accessToken,
    required this.playerId,
    this.turnUrl,
    this.turnUsername,
    this.turnCredential,
  });

  final String serverUrl;
  final String accessToken;
  final String playerId;
  final String? turnUrl;
  final String? turnUsername;
  final String? turnCredential;

  @override
  State<UnoOnlineScreen> createState() => _UnoOnlineScreenState();
}

class _UnoOnlineScreenState extends State<UnoOnlineScreen> {
  io.Socket? _socket;
  UnoVoiceMesh? _voice;
  Map<String, dynamic>? _room;
  Map<String, dynamic>? _game;
  List<dynamic> _hand = [];
  String? _drawnCardId;
  final List<Map<String, dynamic>> _messages = [];
  final _codeController = TextEditingController();
  final _chatController = TextEditingController();
  bool _busy = false;
  bool _micMuted = true;
  String? _error;

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
    socket.onConnectError((error) { if (mounted) setState(() => _error = 'اتصال به سرور برقرار نشد: $error'); });
    socket.on('uno:room:state', (data) {
      if (!mounted) return;
      final room = Map<String, dynamic>.from(data as Map);
      setState(() => _room = room);
      _syncRemoteMute(room);
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
    socket.on('uno:voice:signal', (data) async {
      final signal = Map<String, dynamic>.from(data as Map);
      if (signal['targetId'] != widget.playerId) return;
      final voice = _voice;
      if (voice == null) return;
      await voice.handleSignal(
        fromId: signal['fromId'] as String,
        kind: signal['kind'] as String,
        data: Map<String, dynamic>.from(signal['data'] as Map),
      );
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
      await _setupVoice();
      _syncRemoteMute(room);
      if (data['game'] is Map) {
        setState(() => _game = Map<String, dynamic>.from(data['game'] as Map));
        if (data['hand'] is List) setState(() => _hand = List<dynamic>.from(data['hand'] as List));
      }
    } catch (_) { /* Reconnect is best-effort; the next room action reports errors. */ }
  }

  void _syncRemoteMute(Map<String, dynamic> room) {
    final voice = _voice;
    if (voice == null) return;
    final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
    for (final player in players) {
      if (player['id'] == widget.playerId && player['muted'] == true && !_micMuted) {
        unawaited(voice.setMuted(true));
        if (mounted) setState(() => _micMuted = true);
      }
      if (player['id'] != widget.playerId) {
        unawaited(voice.setRemoteMuted(player['id'] as String, player['muted'] == true));
      }
    }
    if (room['voiceEnabled'] != true && !_micMuted) {
      unawaited(voice.setMuted(true));
      if (mounted) setState(() => _micMuted = true);
    }
  }

  Future<Map<String, dynamic>> _emit(String event, Map<String, dynamic> payload) async {
    final completer = Completer<Map<String, dynamic>>();
    _socket?.emitWithAck(event, payload, ack: (data) {
      if (!completer.isCompleted) completer.complete(Map<String, dynamic>.from(data as Map));
    });
    return completer.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () => {'ok': false, 'error': {'message': 'پاسخی از سرور دریافت نشد.'}},
    );
  }

  Future<void> _run(String event, Map<String, dynamic> payload) async {
    setState(() { _busy = true; _error = null; });
    try {
      final result = await _emit(event, payload);
      if (result['ok'] != true) {
        final error = Map<String, dynamic>.from(result['error'] as Map? ?? {});
        throw StateError(error['message']?.toString() ?? 'عملیات انجام نشد.');
      }
      final data = result['data'];
      if (event == 'uno:room:create' || event == 'uno:room:join') {
        final map = Map<String, dynamic>.from(data as Map);
        final room = Map<String, dynamic>.from(map['room'] as Map);
        setState(() => _room = room);
        await _setupVoice();
      }
      if (event == 'uno:room:start') {
        final map = Map<String, dynamic>.from(data as Map);
        setState(() => _game = Map<String, dynamic>.from(map['game'] as Map));
      }
    } catch (error) {
      setState(() => _error = error.toString().replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setupVoice() async {
    _voice ??= UnoVoiceMesh(
      localPlayerId: widget.playerId,
      turnUrl: widget.turnUrl,
      turnUsername: widget.turnUsername,
      turnCredential: widget.turnCredential,
      sendSignal: (targetId, kind, data) {
        final code = _room?['code']?.toString();
        if (code != null) _socket?.emit('uno:voice:signal', {'code': code, 'targetId': targetId, 'kind': kind, 'data': data});
      },
    );
    try {
      final servers = await _fetchIceServers();
      await _voice!.setIceServers(servers);
    } catch (_) {
      // STUN fallback remains configured if the optional TURN service is unavailable.
    }
  }

  Future<List<Map<String, dynamic>>> _fetchIceServers() async {
    final baseUrl = widget.serverUrl.replaceFirst(RegExp(r'/+
    final room = _room;
    if (room == null) return;
    try {
      await _setupVoice();
      if (_micMuted) {
        final permission = await Permission.microphone.request();
        if (!permission.isGranted) throw StateError('برای گفت‌وگوی صوتی باید مجوز میکروفون را فعال کنی.');
        final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
        await _voice!.enableMicrophone(players.where((p) => p['id'] != widget.playerId).map((p) => p['id'] as String));
        await _voice!.setMuted(false);
        setState(() => _micMuted = false);
      } else {
        await _voice!.setMuted(true);
        setState(() => _micMuted = true);
      }
      await _emit('uno:voice:mute', {'code': room['code'], 'targetId': widget.playerId, 'muted': _micMuted});
    } catch (error) {
      setState(() => _error = error.toString());
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
    if (_error == null) _chatController.clear();
  }

  Color _cardColor(Object? color) => switch (color) {
    'red' => Colors.red.shade700,
    'yellow' => Colors.amber.shade600,
    'green' => Colors.green.shade700,
    'blue' => Colors.blue.shade700,
    _ => Colors.black87,
  };
  String _colorName(String color) => switch (color) {'red' => 'قرمز', 'yellow' => 'زرد', 'green' => 'سبز', _ => 'آبی'};

  @override
  void dispose() {
    _voice?.dispose();
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
      appBar: AppBar(title: const Text('UNO آنلاین'), actions: [
        if (room != null) IconButton(
          tooltip: _micMuted ? 'روشن‌کردن میکروفون' : 'خاموش‌کردن میکروفون',
          icon: Icon(_micMuted ? Icons.mic_off : Icons.mic),
          onPressed: room['voiceEnabled'] == true ? _toggleMic : null,
        ),
      ]),
      body: _busy ? const Center(child: CircularProgressIndicator()) : room == null ? _buildLobby() : _buildRoom(room),
    );
  }

  Widget _buildLobby() => ListView(padding: const EdgeInsets.all(20), children: [
    const Text('یک میز بساز یا با کد میز وارد شو.', style: TextStyle(fontSize: 18)),
    const SizedBox(height: 16),
    FilledButton.icon(onPressed: () => _run('uno:room:create', {}), icon: const Icon(Icons.add), label: const Text('ساخت میز جدید')),
    const SizedBox(height: 18),
    TextField(controller: _codeController, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'کد میز', border: OutlineInputBorder())),
    const SizedBox(height: 8),
    OutlinedButton(onPressed: () => _run('uno:room:join', {'code': _codeController.text}), child: const Text('ورود به میز')),
    if (_error != null) _errorText(),
  ]);

  Widget _buildRoom(Map<String, dynamic> room) {
    final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
    final isHost = room['hostId'] == widget.playerId;
    final ready = players.firstWhere((p) => p['id'] == widget.playerId, orElse: () => {})['ready'] == true;
    final code = room['code'].toString();
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('کد میز: $code', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
        Text('ظرفیت: ${players.length}/6 — حداقل ۲ نفر'),
        const Divider(),
        ...players.map((p) => ListTile(
          dense: true, leading: Icon(p['id'] == room['hostId'] ? Icons.workspace_premium : Icons.person),
          title: Text('@${p['username']}'), subtitle: Text(p['ready'] == true ? 'آماده' : 'در انتظار آمادگی'),
          trailing: isHost && p['id'] != widget.playerId
              ? IconButton(icon: Icon(p['muted'] == true ? Icons.mic_off : Icons.mic), onPressed: () => _run('uno:voice:mute', {'code': code, 'targetId': p['id'], 'muted': p['muted'] != true}))
              : Icon(p['muted'] == true ? Icons.mic_off : Icons.mic),
        )),
        if (room['status'] == 'waiting' || room['status'] == 'ready')
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => _run('uno:room:ready', {'code': code, 'ready': !ready}), child: Text(ready ? 'لغو آمادگی' : 'آماده‌ام'))),
            const SizedBox(width: 8),
            if (isHost) Expanded(child: FilledButton(onPressed: room['status'] == 'ready' ? () => _run('uno:room:start', {'code': code}) : null, child: const Text('شروع بازی'))),
          ]),
        if (room['status'] == 'waiting') const Text('شروع بازی فقط پس از آمادگی همه و با دستور میزبان امکان‌پذیر است.'),
        if (isHost) SwitchListTile(title: const Text('فعال‌بودن چت'), value: room['chatEnabled'] == true, onChanged: (value) => _run('uno:room:communication', {'code': code, 'setting': 'chatEnabled', 'enabled': value})),
        if (isHost) SwitchListTile(title: const Text('فعال‌بودن گفت‌وگوی صوتی'), value: room['voiceEnabled'] == true, onChanged: (value) => _run('uno:room:communication', {'code': code, 'setting': 'voiceEnabled', 'enabled': value})),
        if (room['status'] != 'playing') TextButton.icon(onPressed: () => _run('uno:room:leave', {'code': code}), icon: const Icon(Icons.exit_to_app), label: const Text('خروج از میز')),
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
    final gameOver = game['winnerId'] != null;
    final winner = gameOver ? List<Map<String, dynamic>>.from((game['players'] as List).map((p) => Map<String, dynamic>.from(p as Map))).firstWhere((p) => p['id'] == game['winnerId'], orElse: () => {}) : <String, dynamic>{};
    final color = game['activeColor']?.toString() ?? top['color'].toString();
    return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [
      Text(gameOver ? 'برنده: @${winner['username'] ?? ''}' : (myTurn ? 'نوبت شماست' : 'نوبت بازیکن دیگر')),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _unoCard(top, large: true),
        const SizedBox(width: 14),
        Column(children: [Text('رنگ فعال: ${_colorName(color)}'), Text('کارت‌های باقی‌مانده: ${game['drawCount']}')]),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 6, runSpacing: 6, alignment: WrapAlignment.center, children: _hand.map((raw) => InkWell(
        onTap: myTurn && !gameOver && (_drawnCardId == null || Map<String, dynamic>.from(raw as Map)['id'] == _drawnCardId) ? () => _playCard(Map<String, dynamic>.from(raw as Map)) : null,
        child: _unoCard(Map<String, dynamic>.from(raw as Map)),
      )).toList()),
      if (myTurn && !gameOver) Wrap(spacing: 8, children: [
        if (_drawnCardId == null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'draw'}}), child: const Text('برداشتن کارت')),
        if (_drawnCardId != null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'pass'}}), child: const Text('پایان نوبت')),
        if (game['unoPendingPlayerId'] != null && game['unoPendingPlayerId'] != widget.playerId) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'catchUno'}}), child: const Text('اعلام تخلف UNO')),
      ]),
      if (game['unoPendingPlayerId'] == widget.playerId) TextButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'callUno'}}), child: const Text('UNO!')),
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

  Widget _buildChat(Map<String, dynamic> room) => Card(
    child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('چت میز', style: TextStyle(fontWeight: FontWeight.bold)),
      SizedBox(height: 130, child: ListView(children: _messages.map((m) => Text('@${m['username']}: ${m['text']}')).toList())),
      Row(children: [
        Expanded(child: TextField(controller: _chatController, maxLength: 500, decoration: const InputDecoration(hintText: 'پیام بنویس…', counterText: ''))),
        IconButton(onPressed: room['chatEnabled'] == true ? _sendChat : null, icon: const Icon(Icons.send)),
      ]),
    ])),
  );

  Widget _errorText() => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Text(_error!, style: const TextStyle(color: Colors.red)),
  );
}
), '');
    final response = await http.get(
      Uri.parse('$baseUrl/ice-config'),
      headers: {'Authorization': 'Bearer ${widget.accessToken}'},
    );
    if (response.statusCode != 200) {
      throw StateError('تنظیمات ارتباط صوتی از سرور دریافت نشد.');
    }
    final decoded = Map<String, dynamic>.from(jsonDecode(response.body) as Map);
    return List<Map<String, dynamic>>.from(
      (decoded['iceServers'] as List).map((item) => Map<String, dynamic>.from(item as Map)),
    );
  }

  Future<void> _toggleMic() async {
    final room = _room;
    if (room == null) return;
    try {
      _setupVoice();
      if (_micMuted) {
        final permission = await Permission.microphone.request();
        if (!permission.isGranted) throw StateError('برای گفت‌وگوی صوتی باید مجوز میکروفون را فعال کنی.');
        final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
        await _voice!.enableMicrophone(players.where((p) => p['id'] != widget.playerId).map((p) => p['id'] as String));
        await _voice!.setMuted(false);
        setState(() => _micMuted = false);
      } else {
        await _voice!.setMuted(true);
        setState(() => _micMuted = true);
      }
      await _emit('uno:voice:mute', {'code': room['code'], 'targetId': widget.playerId, 'muted': _micMuted});
    } catch (error) {
      setState(() => _error = error.toString());
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
    if (_error == null) _chatController.clear();
  }

  Color _cardColor(Object? color) => switch (color) {
    'red' => Colors.red.shade700,
    'yellow' => Colors.amber.shade600,
    'green' => Colors.green.shade700,
    'blue' => Colors.blue.shade700,
    _ => Colors.black87,
  };
  String _colorName(String color) => switch (color) {'red' => 'قرمز', 'yellow' => 'زرد', 'green' => 'سبز', _ => 'آبی'};

  @override
  void dispose() {
    _voice?.dispose();
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
      appBar: AppBar(title: const Text('UNO آنلاین'), actions: [
        if (room != null) IconButton(
          tooltip: _micMuted ? 'روشن‌کردن میکروفون' : 'خاموش‌کردن میکروفون',
          icon: Icon(_micMuted ? Icons.mic_off : Icons.mic),
          onPressed: room['voiceEnabled'] == true ? _toggleMic : null,
        ),
      ]),
      body: _busy ? const Center(child: CircularProgressIndicator()) : room == null ? _buildLobby() : _buildRoom(room),
    );
  }

  Widget _buildLobby() => ListView(padding: const EdgeInsets.all(20), children: [
    const Text('یک میز بساز یا با کد میز وارد شو.', style: TextStyle(fontSize: 18)),
    const SizedBox(height: 16),
    FilledButton.icon(onPressed: () => _run('uno:room:create', {}), icon: const Icon(Icons.add), label: const Text('ساخت میز جدید')),
    const SizedBox(height: 18),
    TextField(controller: _codeController, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'کد میز', border: OutlineInputBorder())),
    const SizedBox(height: 8),
    OutlinedButton(onPressed: () => _run('uno:room:join', {'code': _codeController.text}), child: const Text('ورود به میز')),
    if (_error != null) _errorText(),
  ]);

  Widget _buildRoom(Map<String, dynamic> room) {
    final players = List<Map<String, dynamic>>.from((room['players'] as List).map((p) => Map<String, dynamic>.from(p as Map)));
    final isHost = room['hostId'] == widget.playerId;
    final ready = players.firstWhere((p) => p['id'] == widget.playerId, orElse: () => {})['ready'] == true;
    final code = room['code'].toString();
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('کد میز: $code', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
        Text('ظرفیت: ${players.length}/6 — حداقل ۲ نفر'),
        const Divider(),
        ...players.map((p) => ListTile(
          dense: true, leading: Icon(p['id'] == room['hostId'] ? Icons.workspace_premium : Icons.person),
          title: Text('@${p['username']}'), subtitle: Text(p['ready'] == true ? 'آماده' : 'در انتظار آمادگی'),
          trailing: isHost && p['id'] != widget.playerId
              ? IconButton(icon: Icon(p['muted'] == true ? Icons.mic_off : Icons.mic), onPressed: () => _run('uno:voice:mute', {'code': code, 'targetId': p['id'], 'muted': p['muted'] != true}))
              : Icon(p['muted'] == true ? Icons.mic_off : Icons.mic),
        )),
        if (room['status'] == 'waiting' || room['status'] == 'ready')
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => _run('uno:room:ready', {'code': code, 'ready': !ready}), child: Text(ready ? 'لغو آمادگی' : 'آماده‌ام'))),
            const SizedBox(width: 8),
            if (isHost) Expanded(child: FilledButton(onPressed: room['status'] == 'ready' ? () => _run('uno:room:start', {'code': code}) : null, child: const Text('شروع بازی'))),
          ]),
        if (room['status'] == 'waiting') const Text('شروع بازی فقط پس از آمادگی همه و با دستور میزبان امکان‌پذیر است.'),
        if (isHost) SwitchListTile(title: const Text('فعال‌بودن چت'), value: room['chatEnabled'] == true, onChanged: (value) => _run('uno:room:communication', {'code': code, 'setting': 'chatEnabled', 'enabled': value})),
        if (isHost) SwitchListTile(title: const Text('فعال‌بودن گفت‌وگوی صوتی'), value: room['voiceEnabled'] == true, onChanged: (value) => _run('uno:room:communication', {'code': code, 'setting': 'voiceEnabled', 'enabled': value})),
        if (room['status'] != 'playing') TextButton.icon(onPressed: () => _run('uno:room:leave', {'code': code}), icon: const Icon(Icons.exit_to_app), label: const Text('خروج از میز')),
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
    final gameOver = game['winnerId'] != null;
    final winner = gameOver ? List<Map<String, dynamic>>.from((game['players'] as List).map((p) => Map<String, dynamic>.from(p as Map))).firstWhere((p) => p['id'] == game['winnerId'], orElse: () => {}) : <String, dynamic>{};
    final color = game['activeColor']?.toString() ?? top['color'].toString();
    return Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(children: [
      Text(gameOver ? 'برنده: @${winner['username'] ?? ''}' : (myTurn ? 'نوبت شماست' : 'نوبت بازیکن دیگر')),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        _unoCard(top, large: true),
        const SizedBox(width: 14),
        Column(children: [Text('رنگ فعال: ${_colorName(color)}'), Text('کارت‌های باقی‌مانده: ${game['drawCount']}')]),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 6, runSpacing: 6, alignment: WrapAlignment.center, children: _hand.map((raw) => InkWell(
        onTap: myTurn && !gameOver && (_drawnCardId == null || Map<String, dynamic>.from(raw as Map)['id'] == _drawnCardId) ? () => _playCard(Map<String, dynamic>.from(raw as Map)) : null,
        child: _unoCard(Map<String, dynamic>.from(raw as Map)),
      )).toList()),
      if (myTurn && !gameOver) Wrap(spacing: 8, children: [
        if (_drawnCardId == null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'draw'}}), child: const Text('برداشتن کارت')),
        if (_drawnCardId != null) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'pass'}}), child: const Text('پایان نوبت')),
        if (game['unoPendingPlayerId'] != null && game['unoPendingPlayerId'] != widget.playerId) OutlinedButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'catchUno'}}), child: const Text('اعلام تخلف UNO')),
      ]),
      if (game['unoPendingPlayerId'] == widget.playerId) TextButton(onPressed: () => _run('uno:game:action', {'code': code, 'action': {'type': 'callUno'}}), child: const Text('UNO!')),
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

  Widget _buildChat(Map<String, dynamic> room) => Card(
    child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('چت میز', style: TextStyle(fontWeight: FontWeight.bold)),
      SizedBox(height: 130, child: ListView(children: _messages.map((m) => Text('@${m['username']}: ${m['text']}')).toList())),
      Row(children: [
        Expanded(child: TextField(controller: _chatController, maxLength: 500, decoration: const InputDecoration(hintText: 'پیام بنویس…', counterText: ''))),
        IconButton(onPressed: room['chatEnabled'] == true ? _sendChat : null, icon: const Icon(Icons.send)),
      ]),
    ])),
  );

  Widget _errorText() => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Text(_error!, style: const TextStyle(color: Colors.red)),
  );
}
