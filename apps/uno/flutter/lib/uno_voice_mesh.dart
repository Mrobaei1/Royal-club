import 'package:flutter_webrtc/flutter_webrtc.dart';

typedef SignalSender = void Function(String targetId, String kind, Map<String, dynamic> data);

class UnoVoiceMesh {
  UnoVoiceMesh({
    required this.localPlayerId,
    required this.sendSignal,
    this.turnUrl,
    this.turnUsername,
    this.turnCredential,
  });

  final String localPlayerId;
  final SignalSender sendSignal;
  final String? turnUrl;
  final String? turnUsername;
  final String? turnCredential;
  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, Set<String>> _addedTrackIds = {};
  final Map<String, List<MediaStreamTrack>> _remoteTracks = {};
  final Map<String, bool> _remoteMuted = {};
  MediaStream? _localStream;
  bool _muted = true;
  List<Map<String, dynamic>>? _providedIceServers;
  bool get isMuted => _muted;

  Future<void> setIceServers(List<Map<String, dynamic>> servers) async {
    _providedIceServers = servers;
    for (final peer in _peers.values) {
      await peer.setConfiguration(_configuration);
    }
  }

  Map<String, dynamic> get _configuration => {
        'iceServers': _providedIceServers ?? [
          {'urls': 'stun:stun.l.google.com:19302'},
          if (turnUrl != null && turnUrl!.isNotEmpty)
            {
              'urls': turnUrl,
              'username': turnUsername ?? '',
              'credential': turnCredential ?? '',
            },
        ],
        'sdpSemantics': 'unified-plan',
      };

  Future<void> enableMicrophone(Iterable<String> peerIds) async {
    if (_localStream == null) {
      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': false,
      });
    }
    _muted = false;
    for (final track in _localStream!.getAudioTracks()) {
      track.enabled = true;
    }
    for (final peerId in peerIds) {
      if (peerId == localPlayerId) continue;
      final peer = await _peer(peerId);
      await _attachLocalTracks(peerId, peer);
      if (peer.signalingState == RTCSignalingState.RTCSignalingStateStable) {
        await _createOffer(peerId);
      }
    }
  }

  Future<void> setMuted(bool muted) async {
    _muted = muted;
    for (final track in _localStream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = !muted;
    }
  }

  Future<void> setRemoteMuted(String peerId, bool muted) async {
    _remoteMuted[peerId] = muted;
    for (final track in _remoteTracks[peerId] ?? const <MediaStreamTrack>[]) {
      track.enabled = !muted;
    }
  }

  Future<void> handleSignal({
    required String fromId,
    required String kind,
    required Map<String, dynamic> data,
  }) async {
    if (fromId == localPlayerId) return;
    final peer = await _peer(fromId);
    if (kind == 'offer') {
      final rawSdp = data['sdp'];
      final rawType = data['type'];
      if (rawSdp is! String || rawType is! String) return;
      final String sdp = rawSdp;
      final String type = rawType;
      await peer.setRemoteDescription(RTCSessionDescription(sdp, type));
      final answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendSignal(fromId, 'answer', answer.toMap());
    } else if (kind == 'answer') {
      await peer.setRemoteDescription(
        RTCSessionDescription(data['sdp'] as String?, data['type'] as String?),
      );
    } else if (kind == 'ice') {
      final candidate = data['candidate'] as String?;
      if (candidate != null) {
        await peer.addCandidate(RTCIceCandidate(
          candidate,
          (data['sdpMid'] as String?) ?? '',
          data['sdpMLineIndex'] as int?,
        ));
      }
    }
  }

  Future<void> _createOffer(String peerId) async {
    final peer = await _peer(peerId);
    final offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(peerId, 'offer', offer.toMap());
  }

  Future<RTCPeerConnection> _peer(String peerId) async {
    final existing = _peers[peerId];
    if (existing != null) {
      await _attachLocalTracks(peerId, existing);
      return existing;
    }
    final peer = await createPeerConnection(_configuration);
    _peers[peerId] = peer;
    peer.onTrack = (event) {
      event.track.enabled = !(_remoteMuted[peerId] ?? false);
      _remoteTracks.putIfAbsent(peerId, () => <MediaStreamTrack>[]).add(event.track);
    };
    await _attachLocalTracks(peerId, peer);
    peer.onIceCandidate = (candidate) {
      if (candidate.candidate != null) {
        sendSignal(peerId, 'ice', candidate.toMap());
      }
    };
    return peer;
  }

  Future<void> _attachLocalTracks(String peerId, RTCPeerConnection peer) async {
    final stream = _localStream;
    if (stream == null) return;
    final added = _addedTrackIds.putIfAbsent(peerId, () => <String>{});
    for (final track in stream.getAudioTracks()) {
      final String trackKey = track.id ?? track.hashCode.toString();
      if (added.add(trackKey)) await peer.addTrack(track, stream);
    }
  }

  Future<void> closePeer(String peerId) async {
    final peer = _peers.remove(peerId);
    await peer?.close();
    _addedTrackIds.remove(peerId);
    _remoteTracks.remove(peerId);
    _remoteMuted.remove(peerId);
  }

  Future<void> dispose() async {
    for (final peer in _peers.values) {
      await peer.close();
    }
    _peers.clear();
    _addedTrackIds.clear();
    _remoteTracks.clear();
    _remoteMuted.clear();
    for (final track in _localStream?.getTracks() ?? <MediaStreamTrack>[]) {
      await track.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    _muted = true;
  }
}
