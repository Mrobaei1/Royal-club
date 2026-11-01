import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'chess_board.dart';
import 'chess_player_profile_card.dart';

class ChessGameScreen extends StatefulWidget {
  const ChessGameScreen({
    super.key,
    required this.fen,
    required this.legalMoves,
    required this.whiteUsername,
    required this.blackUsername,
    required this.whiteClock,
    required this.blackClock,
    required this.onMove,
    required this.messages,
    required this.onSendMessage,
    required this.onVoicePressed,
    required this.onVoiceReleased,
    required this.voiceEnabled,
    required this.speakingUsername,
    this.onOfferDraw,
    this.onResign,
    this.pendingDrawOfferId,
    this.drawOfferedByOpponent = false,
    this.onRespondToDraw,
    this.activeSide,
    this.whiteProfile,
    this.blackProfile,
    this.isHost = false,
    this.gameStatus = 'active',
    this.onToggleVoice,
  });

  final String fen;
  final List<String> legalMoves;
  final String whiteUsername;
  final String blackUsername;
  final Duration whiteClock;
  final Duration blackClock;
  final ValueChanged<String> onMove;
  final List<ChessChatMessage> messages;
  final ValueChanged<String> onSendMessage;
  final VoidCallback onVoicePressed;
  final VoidCallback onVoiceReleased;
  final bool voiceEnabled;
  final String? speakingUsername;
  final VoidCallback? onOfferDraw;
  final VoidCallback? onResign;
  final String? pendingDrawOfferId;
  final bool drawOfferedByOpponent;
  final ValueChanged<bool>? onRespondToDraw;
  final String? activeSide; // white, black, or null; server remains authoritative.
  final ChessPlayerProfile? whiteProfile;
  final ChessPlayerProfile? blackProfile;
  final String gameStatus;
  final bool isHost;
  final ValueChanged<bool>? onToggleVoice;

  @override
  State<ChessGameScreen> createState() => _ChessGameScreenState();
}

class ChessChatMessage {
  const ChessChatMessage({required this.username, required this.text, required this.timestamp});
  final String username;
  final String text;
  final DateTime timestamp;
}

class _ChessGameScreenState extends State<ChessGameScreen> {
  final _messageController = TextEditingController();
  Timer? _clockTimer;
  Duration _elapsedSinceSync = Duration.zero;
  Duration _whiteDisplay = Duration.zero;
  Duration _blackDisplay = Duration.zero;

  @override
  void initState() {
    super.initState();
    _resetClockDisplay();
  }

  void _resetClockDisplay() {
    _whiteDisplay = widget.whiteClock;
    _blackDisplay = widget.blackClock;
    _elapsedSinceSync = Duration.zero;
    if (widget.activeSide == null || widget.gameStatus != 'active') {
      _clockTimer?.cancel();
      _clockTimer = null;
    } else {
      _clockTimer ??= Timer.periodic(const Duration(milliseconds: 200), (_) {
        if (!mounted || widget.activeSide == null) return;
        _elapsedSinceSync += const Duration(milliseconds: 200);
        final elapsed = _elapsedSinceSync;
        setState(() {
          if (widget.activeSide == 'white') {
            _whiteDisplay = widget.whiteClock - elapsed;
            if (_whiteDisplay.isNegative) _whiteDisplay = Duration.zero;
            _blackDisplay = widget.blackClock;
          } else {
            _blackDisplay = widget.blackClock - elapsed;
            if (_blackDisplay.isNegative) _blackDisplay = Duration.zero;
            _whiteDisplay = widget.whiteClock;
          }
        });
      });
    }
  }

  @override
  void didUpdateWidget(covariant ChessGameScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final becameTerminal =
        oldWidget.gameStatus == 'active' && widget.gameStatus != 'active';
    if (becameTerminal) {
      // Freeze the last interpolated display value; the authoritative clock
      // props may still contain the last server sync and must not rewind it.
      _clockTimer?.cancel();
      _clockTimer = null;
    } else if (oldWidget.whiteClock != widget.whiteClock ||
        oldWidget.blackClock != widget.blackClock ||
        oldWidget.activeSide != widget.activeSide ||
        oldWidget.gameStatus != widget.gameStatus) {
      _resetClockDisplay();
    }
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    _messageController.dispose();
    super.dispose();
  }

  String _clock(Duration duration) {
    final seconds = duration.inSeconds.clamp(0, 359999);
    final minutes = seconds ~/ 60;
    final remainder = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${remainder.toString().padLeft(2, '0')}';
  }

  Widget _player(String username, Duration clock, {required ChessPlayerProfile? profile, required bool active}) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    return Row(
      children: [
        CircleAvatar(child: Text(username.isEmpty ? '?' : username.substring(0, 1).toUpperCase())),
        const SizedBox(width: 8),
        Expanded(
          child: InkWell(
            onTap: profile == null ? null : () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => SafeArea(
                child: SingleChildScrollView(child: ChessPlayerProfileCard(profile: profile)),
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(username, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (profile != null)
                    Text(
                      fa ? 'سطح ${profile.level} • امتیاز ${profile.rating}' : 'Level ${profile.level} • Rating ${profile.rating}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                ],
              ),
            ),
          ),
        ),
        Text(_clock(clock), style: TextStyle(fontFeatures: const [], fontWeight: active ? FontWeight.bold : FontWeight.normal)),
      ],
    );
  }

  void _send() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    widget.onSendMessage(text);
    _messageController.clear();
  }

  @override
  Widget build(BuildContext context) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight : constraints.maxWidth;
        final boardSize = math.min(constraints.maxWidth, availableHeight * 0.38);
        return Column(
      children: [
        _player(widget.blackUsername, _blackDisplay, profile: widget.blackProfile, active: widget.activeSide == 'black'),
        const SizedBox(height: 8),
        Center(
          child: SizedBox(
            width: boardSize,
            child: ChessBoard(fen: widget.fen, legalMoves: widget.legalMoves, onMove: widget.onMove, interactive: widget.gameStatus == 'active'),
          ),
        ),
        const SizedBox(height: 8),
        _player(widget.whiteUsername, _whiteDisplay, profile: widget.whiteProfile, active: widget.activeSide == 'white'),
        if (widget.gameStatus != 'active')
          Card(
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Text(
                widget.gameStatus == 'draw'
                    ? (fa ? 'بازی مساوی شد' : 'Game drawn')
                    : widget.gameStatus == 'white_win'
                        ? (fa ? 'سفید برنده شد' : 'White won')
                        : widget.gameStatus == 'black_win'
                            ? (fa ? 'سیاه برنده شد' : 'Black won')
                            : (fa ? 'بازی پایان یافت' : 'Game finished'),
              ),
            ),
          ),
        if (widget.pendingDrawOfferId != null && widget.drawOfferedByOpponent)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(child: Text(fa ? 'حریف پیشنهاد مساوی داده است' : 'Opponent offered a draw')),
                  TextButton(
                    onPressed: () => widget.onRespondToDraw?.call(false),
                    child: Text(fa ? 'رد' : 'Decline'),
                  ),
                  FilledButton(
                    onPressed: () => widget.onRespondToDraw?.call(true),
                    child: Text(fa ? 'قبول' : 'Accept'),
                  ),
                ],
              ),
            ),
          ),
        if (widget.gameStatus == 'active' && (widget.onOfferDraw != null || widget.onResign != null))
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (widget.onOfferDraw != null)
                TextButton.icon(
                  onPressed: widget.onOfferDraw,
                  icon: const Icon(Icons.handshake_outlined),
                  label: Text(fa ? 'پیشنهاد مساوی' : 'Offer draw'),
                ),
              if (widget.onResign != null)
                TextButton.icon(
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (dialogContext) => AlertDialog(
                        title: Text(fa ? 'تسلیم می‌شوید؟' : 'Resign game?'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(dialogContext, false),
                            child: Text(fa ? 'ادامه بازی' : 'Keep playing'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(dialogContext, true),
                            child: Text(fa ? 'تسلیم' : 'Resign'),
                          ),
                        ],
                      ),
                    );
                    if (confirmed == true) widget.onResign?.call();
                  },
                  icon: const Icon(Icons.flag_outlined),
                  label: Text(fa ? 'تسلیم' : 'Resign'),
                ),
            ],
          ),
        if (widget.gameStatus == 'active' && widget.isHost && widget.onToggleVoice != null)
          SwitchListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(fa ? 'فعال‌سازی صدای اتاق' : 'Enable room voice'),
            value: widget.voiceEnabled,
            onChanged: widget.onToggleVoice,
          ),
        if (widget.gameStatus == 'active' && widget.voiceEnabled)
          Row(
            children: [
              Expanded(
                child: Text(widget.speakingUsername == null
                    ? (fa ? 'کانال صوتی آماده است' : 'Voice channel ready')
                    : (fa ? '${widget.speakingUsername} در حال صحبت است' : '${widget.speakingUsername} is speaking')),
              ),
              GestureDetector(
                onTapDown: (_) => widget.onVoicePressed(),
                onTapUp: (_) => widget.onVoiceReleased(),
                onTapCancel: widget.onVoiceReleased,
                child: Semantics(
                  button: true,
                  label: fa ? 'برای صحبت نگه دارید' : 'Hold to talk',
                  child: const CircleAvatar(child: Icon(Icons.mic)),
                ),
              ),
            ],
          ),
        const Divider(),
        Expanded(
          child: ListView.builder(
            itemCount: widget.messages.length,
            itemBuilder: (context, index) {
              final message = widget.messages[index];
              return ListTile(
                dense: true,
                title: Text(message.username),
                subtitle: Text(message.text),
                trailing: Text(
                  '${message.timestamp.hour.toString().padLeft(2, '0')}:${message.timestamp.minute.toString().padLeft(2, '0')}',
                ),
              );
            },
          ),
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _messageController,
                enabled: widget.gameStatus == 'active',
                maxLength: 2000,
                decoration: InputDecoration(hintText: fa ? 'پیام' : 'Message', counterText: ''),
                onSubmitted: (_) => _send(),
              ),
            ),
            IconButton(onPressed: widget.gameStatus == 'active' ? _send : null, icon: const Icon(Icons.send)),
          ],
        ),
      ],
        );
      },
    );
  }
}
