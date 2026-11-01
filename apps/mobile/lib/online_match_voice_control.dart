import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'services/match_service.dart';

class OnlineMatchVoiceControl extends StatefulWidget {
  final String matchId;
  final bool isEnglish;

  const OnlineMatchVoiceControl({
    super.key,
    required this.matchId,
    required this.isEnglish,
  });

  @override
  State<OnlineMatchVoiceControl> createState() => _OnlineMatchVoiceControlState();
}

class _OnlineMatchVoiceControlState extends State<OnlineMatchVoiceControl> {
  RTCPeerConnection? _peer;
  MediaStream? _localStream;
  Timer? _poller;
  String? _afterId;
  String? _callId;
  Map<String, dynamic>? _incomingOffer;
  final List<RTCIceCandidate> _pendingLocalCandidates = [];
  final List<RTCIceCandidate> _pendingRemoteCandidates = [];
  bool _remoteDescriptionSet = false;
  bool _signalReady = false;
  bool _polling = false;
  bool _starting = false;
  bool _connected = false;
  bool _muted = false;
  bool _disposed = false;

  bool get _inCall => _peer != null && _callId != null;

  @override
  void initState() {
    super.initState();
    _poller = Timer.periodic(const Duration(milliseconds: 1500), (_) => _pollSignals());
  }

  @override
  void dispose() {
    _disposed = true;
    _poller?.cancel();
    unawaited(_cleanup(sendHangup: true));
    super.dispose();
  }

  String _newCallId() {
    final random = Random.secure();
    return '${DateTime.now().microsecondsSinceEpoch}-${random.nextInt(1 << 32)}';
  }

  void _showError(Object error) {
    if (!mounted) return;
    final message = error.toString().replaceFirst('Exception: ', '');
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
    );
  }

  Future<void> _createPeerConnection() async {
    final iceServers = await MatchService.voiceIceServers(widget.matchId);
    final stream = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': false,
    });
    _localStream = stream;
    final peer = await createPeerConnection({
      'iceServers': iceServers,
      'sdpSemantics': 'unified-plan',
      'bundlePolicy': 'max-bundle',
    });
    _peer = peer;
    peer.onIceCandidate = (candidate) {
      if (candidate.candidate == null || candidate.candidate!.isEmpty) return;
      if (_signalReady) {
        unawaited(_sendCandidate(candidate));
      } else {
        _pendingLocalCandidates.add(candidate);
      }
    };
    peer.onConnectionState = (state) {
      if (!mounted || _disposed) return;
      final connected = state == RTCPeerConnectionState.RTCPeerConnectionStateConnected;
      setState(() => _connected = connected);
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _showError(widget.isEnglish
            ? 'Voice connection failed. Check the network and try again.'
            : 'اتصال صوتی برقرار نشد؛ شبکه را بررسی و دوباره تلاش کنید.');
      }
    };
    for (final track in stream.getAudioTracks()) {
      await peer.addTrack(track, stream);
    }
  }

  Future<void> _flushLocalCandidates() async {
    final candidates = List<RTCIceCandidate>.from(_pendingLocalCandidates);
    _pendingLocalCandidates.clear();
    for (final candidate in candidates) {
      await _sendCandidate(candidate);
    }
  }

  Future<void> _flushRemoteCandidates() async {
    final peer = _peer;
    if (peer == null || !_remoteDescriptionSet) return;
    final candidates = List<RTCIceCandidate>.from(_pendingRemoteCandidates);
    _pendingRemoteCandidates.clear();
    for (final candidate in candidates) {
      await peer.addCandidate(candidate);
    }
  }

  Future<void> _sendCandidate(RTCIceCandidate candidate) async {
    final callId = _callId;
    if (callId == null) return;
    try {
      await MatchService.sendVoiceSignal(widget.matchId, 'candidate', {
        'callId': callId,
        'candidate': candidate.candidate ?? '',
        'sdpMid': candidate.sdpMid,
        'sdpMLineIndex': candidate.sdpMLineIndex,
      });
    } catch (_) {
      // A transient candidate-delivery failure should not interrupt the call UI.
    }
  }

  Future<void> _startCall() async {
    if (_starting || _callId != null) return;
    setState(() => _starting = true);
    try {
      _callId = _newCallId();
      await _createPeerConnection();
      final offer = await _peer!.createOffer({
        'offerToReceiveAudio': 1,
        'offerToReceiveVideo': 0,
      });
      await _peer!.setLocalDescription(offer);
      await MatchService.sendVoiceSignal(widget.matchId, 'offer', {
        'callId': _callId,
        'type': 'offer',
        'sdp': offer.sdp,
      });
      _signalReady = true;
      await _flushLocalCandidates();
    } catch (error) {
      await _cleanup(sendHangup: false);
      _showError(error);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _acceptIncomingCall() async {
    final offer = _incomingOffer;
    if (_starting || offer == null) return;
    setState(() => _starting = true);
    try {
      _callId = offer['callId']?.toString();
      if (_callId == null) throw Exception('شناسه تماس معتبر نیست.');
      await _createPeerConnection();
      await _peer!.setRemoteDescription(RTCSessionDescription(
        offer['sdp']?.toString(),
        offer['type']?.toString(),
      ));
      _remoteDescriptionSet = true;
      await _flushRemoteCandidates();
      final answer = await _peer!.createAnswer({
        'offerToReceiveAudio': 1,
        'offerToReceiveVideo': 0,
      });
      await _peer!.setLocalDescription(answer);
      await MatchService.sendVoiceSignal(widget.matchId, 'answer', {
        'callId': _callId,
        'type': 'answer',
        'sdp': answer.sdp,
      });
      _signalReady = true;
      await _flushLocalCandidates();
      if (mounted) setState(() => _incomingOffer = null);
    } catch (error) {
      await _cleanup(sendHangup: true);
      _showError(error);
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  Future<void> _pollSignals() async {
    if (_polling || _disposed) return;
    _polling = true;
    try {
      final signals = await MatchService.voiceSignals(
        widget.matchId,
        afterId: _afterId,
      );
      for (final signal in signals) {
        _afterId = signal['id']?.toString() ?? _afterId;
        final kind = signal['kind']?.toString();
        final payload = signal['payload'] is Map
            ? Map<String, dynamic>.from(signal['payload'] as Map)
            : <String, dynamic>{};
        final incomingCallId = payload['callId']?.toString();
        if (kind == 'offer' && _callId == null && _incomingOffer == null) {
          if (payload['type'] == 'offer' && payload['sdp'] is String) {
            if (mounted) setState(() => _incomingOffer = payload);
          }
          continue;
        }
        if (incomingCallId == null) continue;
        if (kind == 'answer' && incomingCallId == _callId && _peer != null) {
          if (!_remoteDescriptionSet && payload['type'] == 'answer' && payload['sdp'] is String) {
            await _peer!.setRemoteDescription(RTCSessionDescription(
              payload['sdp']?.toString(),
              payload['type']?.toString(),
            ));
            _remoteDescriptionSet = true;
            await _flushRemoteCandidates();
          }
        } else if (kind == 'candidate' &&
            (incomingCallId == _callId || incomingCallId == _incomingOffer?['callId']) &&
            payload['candidate'] is String) {
          final candidate = RTCIceCandidate(
            payload['candidate']?.toString(),
            payload['sdpMid']?.toString(),
            (payload['sdpMLineIndex'] as num?)?.toInt(),
          );
          if (_peer == null || !_remoteDescriptionSet) {
            _pendingRemoteCandidates.add(candidate);
          } else {
            await _peer!.addCandidate(candidate);
          }
        } else if (kind == 'hangup' &&
            (incomingCallId == _callId || incomingCallId == _incomingOffer?['callId'])) {
          await _cleanup(sendHangup: false);
        }
      }
    } catch (_) {
      // A short polling interruption is recoverable; the next tick retries.
    } finally {
      _polling = false;
    }
  }

  Future<void> _toggleMute() async {
    final stream = _localStream;
    if (stream == null) return;
    final nextMuted = !_muted;
    for (final track in stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    if (mounted) setState(() => _muted = nextMuted);
  }

  Future<void> _hangUp() async {
    await _cleanup(sendHangup: true);
  }

  Future<void> _rejectIncomingCall() async {
    final callId = _incomingOffer?['callId']?.toString();
    if (callId != null) {
      try {
        await MatchService.sendVoiceSignal(widget.matchId, 'hangup', {
          'callId': callId,
        });
      } catch (_) {}
    }
    if (mounted) setState(() => _incomingOffer = null);
    _pendingRemoteCandidates.clear();
  }

  Future<void> _cleanup({required bool sendHangup}) async {
    final callId = _callId;
    if (sendHangup && callId != null) {
      try {
        await MatchService.sendVoiceSignal(widget.matchId, 'hangup', {
          'callId': callId,
        });
      } catch (_) {}
    }
    final peer = _peer;
    final stream = _localStream;
    _peer = null;
    _localStream = null;
    _callId = null;
    _incomingOffer = null;
    _remoteDescriptionSet = false;
    _signalReady = false;
    _connected = false;
    _muted = false;
    _pendingLocalCandidates.clear();
    _pendingRemoteCandidates.clear();
    if (stream != null) {
      for (final track in stream.getTracks()) {
        try { await track.stop(); } catch (_) {}
      }
      try { await stream.dispose(); } catch (_) {}
    }
    if (peer != null) {
      try { await peer.close(); } catch (_) {}
      try { await peer.dispose(); } catch (_) {}
    }
    if (mounted && !_disposed) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final incoming = _incomingOffer != null;
    final active = _inCall;
    final tooltip = incoming
        ? (widget.isEnglish ? 'Incoming voice call — tap to accept' : 'تماس صوتی ورودی — برای پاسخ لمس کنید')
        : _connected
            ? (_muted
                ? (widget.isEnglish ? 'Microphone muted — tap to unmute' : 'میکروفون بی‌صداست؛ برای فعال‌سازی لمس کنید')
                : (widget.isEnglish ? 'Mute microphone' : 'قطع صدای میکروفون'))
            : active
                ? (widget.isEnglish ? 'Cancel voice call' : 'لغو تماس صوتی')
                : (widget.isEnglish ? 'Start voice call' : 'شروع مکالمه صوتی');
    final icon = incoming
        ? Icons.call_received_rounded
        : _connected
            ? (_muted ? Icons.mic_off_rounded : Icons.mic_rounded)
            : active
                ? Icons.phone_in_talk_rounded
                : Icons.mic_none_rounded;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton.filledTonal(
          tooltip: tooltip,
          onPressed: _starting
              ? null
              : incoming
                  ? _acceptIncomingCall
                  : _connected
                      ? _toggleMute
                      : active
                          ? _hangUp
                          : _startCall,
          icon: _starting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(icon),
        ),
        if (incoming)
          IconButton(
            tooltip: widget.isEnglish ? 'Decline voice call' : 'رد تماس صوتی',
            onPressed: _rejectIncomingCall,
            icon: const Icon(Icons.call_end_rounded),
          ),
        if (active)
          IconButton(
            tooltip: widget.isEnglish ? 'End voice call' : 'پایان تماس صوتی',
            onPressed: _hangUp,
            icon: const Icon(Icons.call_end_rounded),
          ),
      ],
    );
  }
}
