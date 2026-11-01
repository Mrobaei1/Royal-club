import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'chess_api_client.dart';
import 'chess_game_screen.dart';
import 'chess_player_profile_card.dart';
import 'chess_voice_client.dart';

/// Orchestrates the HTTP snapshot, live WebSocket events, chat, draw offers
/// and server-synchronized display clocks for one authenticated chess game.
class ChessGameSession extends ChangeNotifier {
  ChessGameSession({required this.api, required this.gameId, this.voiceClient});

  final ChessApiClient api;
  final String gameId;
  final ChessVoiceClient? voiceClient;

  Map<String, dynamic>? game;
  List<ChessChatMessage> messages = [];
  Duration whiteClock = Duration.zero;
  Duration blackClock = Duration.zero;
  String? activeSide;
  String? pendingDrawOfferId;
  bool drawOfferedByOpponent = false;
  bool voiceEnabled = false;
  String? speakingUsername;
  bool connected = false;
  String? errorCode;
  ChessPlayerProfile? whiteProfile;
  ChessPlayerProfile? blackProfile;
  String? _whiteProfileUsername;
  String? _blackProfileUsername;

  WebSocket? _socket;
  StreamSubscription<dynamic>? _subscription;
  Timer? _heartbeat;
  Timer? _reconnect;
  bool _disposed = false;
  bool _reconnectScheduled = false;
  bool _openingSocket = false;
  Future<void>? _connectFuture;
  int _reconnectAttempt = 0;
  int _serverOffsetMs = 0;
  int _refreshGeneration = 0;

  String get whiteUsername => game?['players']?['white']?['username'] as String? ?? '';
  String get blackUsername => game?['players']?['black']?['username'] as String? ?? '';
  String get fen => game?['fen'] as String? ?? '';
  List<String> get legalMoves =>
      (game?['legalMoves'] as List? ?? const []).whereType<String>().toList(growable: false);
  String? get status => game?['status'] as String?;
  bool get isHost => game?['isHost'] == true;

  Future<void> connect() {
    if (_disposed) return Future.error(StateError('chess_session_disposed'));
    return _connectFuture ??= _connectInternal().whenComplete(() {
      _connectFuture = null;
    });
  }

  Future<void> _connectInternal() async {
    try {
      await refresh();
      if (voiceEnabled) await voiceClient?.connect();
      await _openSocket();
      await refresh(); // Close the snapshot-to-subscription race window.
      _heartbeat?.cancel();
      _heartbeat = Timer.periodic(const Duration(seconds: 15), (_) {
        if (_socket?.readyState == WebSocket.open) {
          _socket!.add(jsonEncode({'type': 'ping', 'clientTime': DateTime.now().millisecondsSinceEpoch}));
        }
      });
    } catch (error) {
      if (!_disposed) {
        errorCode = error is ChessApiException ? error.code : 'connection_failed';
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> refresh() async {
    if (_disposed) return;
    final generation = ++_refreshGeneration;
    final gameResult = await api.game(gameId);
    final players = gameResult['players'] as Map<String, dynamic>;
    final whiteName = players['white']?['username'] as String? ?? '';
    final blackName = players['black']?['username'] as String? ?? '';
    final results = await Future.wait<dynamic>([
      api.chatHistory(gameId),
      api.pendingDrawOffer(gameId),
      if (whiteName.isNotEmpty && (whiteProfile == null || _whiteProfileUsername != whiteName))
        api.playerProfileByUsername(whiteName) else Future.value(null),
      if (blackName.isNotEmpty && (blackProfile == null || _blackProfileUsername != blackName))
        api.playerProfileByUsername(blackName) else Future.value(null),
    ]);
    if (_disposed || generation != _refreshGeneration) return;
    game = gameResult;
    _applyClock(game?['clock'] as Map<String, dynamic>?);
    // Never keep microphone capture or a voice lease alive after the game ends
    // or the room voice setting is disabled in the authoritative snapshot.
    final gameActive = game?['status'] == 'active';
    final roomVoiceEnabled = game?['settings']?['voiceEnabled'] == true;
    if (!gameActive || !roomVoiceEnabled) {
      await voiceClient?.disconnect();
      speakingUsername = null;
    }
    final rawMessages = (results[0] as List).cast<Map<String, dynamic>>();
    messages = rawMessages.map(_chatMessage).toList(growable: false);
    final offer = Map<String, dynamic>.from(results[1] as Map);
    if (results[2] != null) {
      whiteProfile = ChessPlayerProfile.fromJson(Map<String, dynamic>.from(results[2] as Map));
      _whiteProfileUsername = whiteName;
    }
    if (results[3] != null) {
      blackProfile = ChessPlayerProfile.fromJson(Map<String, dynamic>.from(results[3] as Map));
      _blackProfileUsername = blackName;
    }
    pendingDrawOfferId = offer['pending'] == true ? offer['offerId'] as String? : null;
    drawOfferedByOpponent = offer['pending'] == true && offer['offeredByMe'] != true;
    voiceEnabled = game?['settings']?['voiceEnabled'] == true;
    errorCode = null;
    if (!_disposed) notifyListeners();
  }

  void _applyClock(Map<String, dynamic>? clock) {
    if (clock == null) return;
    final whiteMs = (clock['whiteMs'] as num?)?.toInt() ?? 0;
    final blackMs = (clock['blackMs'] as num?)?.toInt() ?? 0;
    activeSide = clock['active'] as String?;
    final started = (clock['lastStartedAt'] as num?)?.toInt();
    var elapsed = 0;
    if (activeSide != null && started != null) {
      elapsed = (DateTime.now().millisecondsSinceEpoch + _serverOffsetMs - started).clamp(0, 86400000).toInt();
    }
    whiteClock = Duration(milliseconds: activeSide == 'white' ? (whiteMs - elapsed).clamp(0, whiteMs).toInt() : whiteMs);
    blackClock = Duration(milliseconds: activeSide == 'black' ? (blackMs - elapsed).clamp(0, blackMs).toInt() : blackMs);
  }

  ChessChatMessage _chatMessage(Map<String, dynamic> row) => ChessChatMessage(
        username: row['username'] as String? ?? '',
        text: row['message'] as String? ?? '',
        timestamp: DateTime.tryParse((row['created_at'] ?? row['createdAt'] ?? '').toString()) ?? DateTime.now(),
      );

  Future<void> _openSocket() async {
    if (_disposed || _socket != null || _openingSocket) return;
    _openingSocket = true;
    try {
      final socket = await api.connectGameSocket(gameId);
      if (_disposed) {
        await socket.close();
        return;
      }
      _socket = socket;
      connected = true;
      errorCode = null;
      notifyListeners();
      _subscription = socket.listen(
        (event) => unawaited(_handleEvent(event)),
        onError: (Object error) => _socketEnded(error),
        onDone: () => _socketEnded(null),
        cancelOnError: true,
      );
      socket.add(jsonEncode({'type': 'ping', 'clientTime': DateTime.now().millisecondsSinceEpoch}));
    } catch (error) {
      _socketEnded(error);
    } finally {
      _openingSocket = false;
    }
  }

  Future<void> _handleEvent(dynamic raw) async {
    if (_disposed) return;
    try {
      final event = jsonDecode(raw as String) as Map<String, dynamic>;
      switch (event['type']) {
        case 'chess:pong':
          _reconnectAttempt = 0;
          final serverTime = (event['serverTime'] as num?)?.toInt();
          if (serverTime != null) {
            final receivedAt = DateTime.now().millisecondsSinceEpoch;
            final sentAt = (event['clientTime'] as num?)?.toInt() ?? receivedAt;
            _serverOffsetMs = (serverTime - ((sentAt + receivedAt) / 2)).round();
            _applyClock(game?['clock'] as Map<String, dynamic>?);
            notifyListeners();
          }
          break;
        case 'chess:state':
          await refresh();
          break;
        case 'chess:chat:message':
          final message = _chatMessage(event);
          if (!messages.any((item) => item.timestamp == message.timestamp &&
              item.username == message.username && item.text == message.text)) {
            messages = [...messages, message];
            notifyListeners();
          }
          break;
        case 'chess:draw:offered':
          pendingDrawOfferId = event['offerId'] as String?;
          drawOfferedByOpponent = true;
          notifyListeners();
          break;
        case 'chess:draw:response':
          if (event['offerId'] == pendingDrawOfferId) {
            pendingDrawOfferId = null;
            drawOfferedByOpponent = false;
            if (event['status'] == 'accepted') await refresh();
            notifyListeners();
          }
          break;
        case 'chess:voice:settings':
          voiceEnabled = event['enabled'] == true;
          if (voiceEnabled) {
            await voiceClient?.connect();
          } else {
            speakingUsername = null;
            await voiceClient?.disconnect();
          }
          notifyListeners();
          break;
        case 'chess:voice:granted':
          speakingUsername = event['speakingUsername'] as String?;
          notifyListeners();
          break;
        case 'chess:voice:released':
        case 'chess:voice:disabled':
          speakingUsername = null;
          notifyListeners();
          break;
        case 'chess:opponent:presence':
          // Presence is intentionally username-only.
          break;
        case 'chess:error':
          errorCode = event['code']?.toString();
          notifyListeners();
          break;
      }
    } catch (error) {
      if (!_disposed) {
        errorCode = 'invalid_realtime_event';
        notifyListeners();
      }
    }
  }

  void _socketEnded(Object? error) {
    _socket = null;
    _subscription = null;
    connected = false;
    if (error != null) errorCode = 'realtime_disconnected';
    if (!_disposed) {
      notifyListeners();
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_disposed || _reconnectScheduled) return;
    _reconnectScheduled = true;
    final seconds = (1 << _reconnectAttempt.clamp(0, 5).toInt()).clamp(1, 30).toInt();
    _reconnectAttempt++;
    _reconnect = Timer(Duration(seconds: seconds), () async {
      _reconnectScheduled = false;
      if (_disposed) return;
      try {
        await refresh();
        if (voiceEnabled) await voiceClient?.connect();
        await _openSocket();
        await refresh();
      } catch (_) {
        _scheduleReconnect();
      }
    });
  }

  Future<void> submitMove({required String from, required String to, String? promotion}) async {
    await api.submitMove(gameId, from: from, to: to, promotion: promotion);
    await refresh();
  }

  Future<void> sendChat(String message) async {
    final result = await api.sendChat(gameId, message);
    final item = _chatMessage(result);
    messages = [...messages, item];
    if (!_disposed) notifyListeners();
  }

  Future<void> offerDraw() async {
    final result = await api.offerDraw(gameId);
    pendingDrawOfferId = result['offerId'] as String?;
    drawOfferedByOpponent = false;
    if (!_disposed) notifyListeners();
  }

  Future<void> respondToDraw(bool accept) async {
    final offerId = pendingDrawOfferId;
    if (offerId == null) return;
    await api.respondToDraw(gameId, offerId, accept: accept);
    pendingDrawOfferId = null;
    drawOfferedByOpponent = false;
    if (accept) await refresh();
    if (!_disposed) notifyListeners();
  }

  Future<void> resign() async {
    await api.resign(gameId);
    await refresh();
  }

  Future<void> pressToTalk() async {
    if (!voiceEnabled) throw StateError('voice_disabled_by_host');
    final client = voiceClient;
    if (client == null) throw StateError('voice_client_not_configured');
    await client.pressToTalk();
  }

  Future<void> releaseTalk() async {
    await voiceClient?.releaseTalk();
  }

  Future<void> setVoiceEnabled(bool enabled) async {
    await api.setVoiceEnabled(gameId, enabled);
    if (enabled) await voiceClient?.connect();
    voiceEnabled = enabled;
    if (!enabled) {
      speakingUsername = null;
      await voiceClient?.disconnect();
    }
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _heartbeat?.cancel();
    _reconnect?.cancel();
    unawaited(_subscription?.cancel());
    unawaited(_socket?.close());
    _socket = null;
    unawaited(voiceClient?.dispose());
    super.dispose();
  }
}
