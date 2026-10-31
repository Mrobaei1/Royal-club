import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Push-to-talk transport for the isolated chess module.
///
/// The server remains authoritative for microphone leases. This class only
/// handles media capture and WebRTC signaling after a lease is granted.
class ChessVoiceClient {
  ChessVoiceClient({
    required this.apiBaseUri,
    required this.token,
    required this.gameId,
    required this.userId,
    required this.username,
    this.onSpeakingChanged,
    this.onVoiceEnabledChanged,
    this.onRemoteStream,
    this.onError,
    this.iceServers = const [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
  });

  final Uri apiBaseUri;
  final String token;
  final String gameId;
  final String userId;
  final String username;
  final ValueChanged<String?>? onSpeakingChanged;
  final ValueChanged<bool>? onVoiceEnabledChanged;
  final ValueChanged<MediaStream>? onRemoteStream;
  final ValueChanged<Object>? onError;
  final List<Map<String, dynamic>> iceServers; // Inject TURN credentials for production NAT traversal.

  WebSocket? _socket;
  StreamSubscription<dynamic>? _socketSubscription;
  RTCPeerConnection? _peer;
  MediaStream? _localStream;
  String? _leaseId;
  Timer? _leaseRenewal;
  bool _disposed = false;
  bool _makingOffer = false;
  final List<RTCIceCandidate> _pendingCandidates = [];

  Uri _endpoint(String path) {
    final base = apiBaseUri.toString().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base$path');
  }

  Future<void> connect() async {
    if (_disposed) throw StateError('voice_client_disposed');
    if (_socket != null) return;
    final wsUri = _endpoint('/chess/ws').replace(
      scheme: apiBaseUri.scheme == 'https' ? 'wss' : 'ws',
      queryParameters: {'gameId': gameId},
    );
    final socket = await WebSocket.connect(
      wsUri.toString(),
      headers: {HttpHeaders.authorizationHeader: 'Bearer $token'},
    );
    if (_disposed) {
      await socket.close();
      return;
    }
    _socket = socket;
    _socketSubscription = socket.listen(
      _handleSocketMessage,
      onError: (Object error) => onError?.call(error),
      onDone: () {
        _socket = null;
        onSpeakingChanged?.call(null);
        _disableLocalAudio();
      },
      cancelOnError: false,
    );
  }

  Future<void> pressToTalk() async {
    if (_disposed) return;
    if (_leaseId != null) return;
    await connect();
    final client = HttpClient();
    late Map<String, dynamic> body;
    try {
      final request = await client.postUrl(_endpoint('/chess/games/$gameId/voice/request'));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.contentType = ContentType.json;
      final response = await request.close();
      body = jsonDecode(await response.transform(utf8.decoder).join()) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300 || body['granted'] != true) {
        throw StateError((body['reason'] ?? body['error'] ?? 'voice_lease_denied').toString());
      }
    } finally {
      client.close(force: true);
    }
    _leaseId = body['leaseId'] as String?;
    if (_leaseId == null) throw StateError('voice_lease_missing');
    _leaseRenewal?.cancel();
    _leaseRenewal = Timer.periodic(const Duration(seconds: 4), (_) => _renewLease());
    try {
      await _ensurePeerConnection();
      await _enableLocalAudio();
      if (_peer?.signalingState == RTCSignalingState.RTCSignalingStateStable) {
        await _createAndSendOffer();
      }
    } catch (_) {
      await releaseTalk();
      rethrow;
    }
  }

  Future<void> releaseTalk() async {
    final lease = _leaseId;
    _leaseId = null;
    _leaseRenewal?.cancel();
    _leaseRenewal = null;
    _disableLocalAudio();
    if (lease == null) return;
    final client = HttpClient();
    try {
      final request = await client.postUrl(_endpoint('/chess/games/$gameId/voice/release'));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'leaseId': lease}));
      await request.close();
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _renewLease() async {
    final lease = _leaseId;
    if (lease == null || _disposed) return;
    final client = HttpClient();
    try {
      final request = await client.postUrl(_endpoint('/chess/games/$gameId/voice/renew'));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'leaseId': lease}));
      final response = await request.close();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await releaseTalk();
      }
      await response.drain<void>();
    } catch (error) {
      onError?.call(error);
    } finally {
      client.close(force: true);
    }
  }

  Future<void> _ensurePeerConnection() async {
    if (_peer != null) return;
    final peer = await createPeerConnection({
      'iceServers': iceServers,
      'sdpSemantics': 'unified-plan',
    });
    _peer = peer;
    peer.onIceCandidate = (candidate) {
      if (candidate.candidate != null) {
        _sendSignal('candidate', candidate.toMap());
      }
    };
    peer.onTrack = (event) {
      if (event.streams.isNotEmpty) onRemoteStream?.call(event.streams.first);
    };
    peer.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        onError?.call(StateError('voice_connection_failed'));
      }
    };
    _localStream ??= await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': false,
    });
    for (final track in _localStream!.getAudioTracks()) {
      track.enabled = false;
      await peer.addTrack(track, _localStream!);
    }
  }

  Future<void> _createAndSendOffer() async {
    if (_makingOffer || _peer == null) return;
    _makingOffer = true;
    try {
      final offer = await _peer!.createOffer();
      await _peer!.setLocalDescription(offer);
      _sendSignal('offer', {'sdp': offer.sdp, 'type': offer.type});
    } finally {
      _makingOffer = false;
    }
  }

  void _sendSignal(String signalType, Map<String, dynamic> payload) {
    final socket = _socket;
    if (socket == null) throw StateError('voice_socket_not_connected');
    socket.add(jsonEncode({
      'type': 'chess:voice:signal',
      'signalType': signalType,
      'payload': payload,
    }));
  }

  Future<void> _handleSocketMessage(dynamic raw) async {
    try {
      final event = jsonDecode(raw as String) as Map<String, dynamic>;
      switch (event['type']) {
        case 'chess:voice:signal':
          await _handleSignal(
            event['signalType'] as String,
            Map<String, dynamic>.from(event['payload'] as Map),
          );
          break;
        case 'chess:voice:granted':
          final speaker = event['speakingUsername'] as String?;
          onSpeakingChanged?.call(speaker);
          if (speaker != username) _disableLocalAudio();
          break;
        case 'chess:voice:settings':
          final enabled = event['enabled'] == true;
          onVoiceEnabledChanged?.call(enabled);
          if (!enabled) {
            onSpeakingChanged?.call(null);
            _disableLocalAudio();
            _leaseId = null;
            _leaseRenewal?.cancel();
            _leaseRenewal = null;
          }
          break;
        case 'chess:voice:released':
        case 'chess:voice:disabled':
          onSpeakingChanged?.call(null);
          _disableLocalAudio();
          _leaseId = null;
          _leaseRenewal?.cancel();
          _leaseRenewal = null;
          break;
      }
    } catch (error) {
      onError?.call(error);
    }
  }

  Future<void> _handleSignal(String type, Map<String, dynamic> payload) async {
    await _ensurePeerConnection();
    switch (type) {
      case 'offer':
        final description = RTCSessionDescription(
          payload['sdp'] as String?,
          payload['type'] as String?,
        );
        await _peer!.setRemoteDescription(description);
        for (final candidate in _pendingCandidates) {
          await _peer!.addCandidate(candidate);
        }
        _pendingCandidates.clear();
        final answer = await _peer!.createAnswer();
        await _peer!.setLocalDescription(answer);
        _sendSignal('answer', {'sdp': answer.sdp, 'type': answer.type});
        break;
      case 'answer':
        await _peer!.setRemoteDescription(RTCSessionDescription(
          payload['sdp'] as String?,
          payload['type'] as String?,
        ));
        for (final candidate in _pendingCandidates) {
          await _peer!.addCandidate(candidate);
        }
        _pendingCandidates.clear();
        break;
      case 'candidate':
        final candidate = RTCIceCandidate(
          payload['candidate'] as String?,
          payload['sdpMid'] as String?,
          (payload['sdpMLineIndex'] as num?)?.toInt(),
        );
        if ((await _peer!.getRemoteDescription()) == null) {
          _pendingCandidates.add(candidate);
        } else {
          await _peer!.addCandidate(candidate);
        }
        break;
    }
  }

  Future<void> _enableLocalAudio() async {
    for (final track in _localStream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = true;
    }
  }

  void _disableLocalAudio() {
    for (final track in _localStream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = false;
    }
  }

  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    await releaseTalk();
    await _socketSubscription?.cancel();
    await _socket?.close();
    await _peer?.close();
    await _localStream?.dispose();
    _socket = null;
    _peer = null;
    _localStream = null;
  }
}
