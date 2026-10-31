import 'package:flutter/material.dart';
import 'chess_board.dart';

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

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  String _clock(Duration duration) {
    final seconds = duration.inSeconds.clamp(0, 359999);
    final minutes = seconds ~/ 60;
    final remainder = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${remainder.toString().padLeft(2, '0')}';
  }

  Widget _player(String username, Duration clock, {required bool white}) => Row(
        children: [
          CircleAvatar(child: Text(username.isEmpty ? '?' : username.substring(0, 1).toUpperCase())),
          const SizedBox(width: 8),
          Expanded(child: Text(username, maxLines: 1, overflow: TextOverflow.ellipsis)),
          Text(_clock(clock), style: const TextStyle(fontFeatures: [])),
        ],
      );

  void _send() {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    widget.onSendMessage(text);
    _messageController.clear();
  }

  @override
  Widget build(BuildContext context) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    return Column(
      children: [
        _player(widget.blackUsername, widget.blackClock, white: false),
        const SizedBox(height: 8),
        ChessBoard(fen: widget.fen, legalMoves: widget.legalMoves, onMove: widget.onMove),
        const SizedBox(height: 8),
        _player(widget.whiteUsername, widget.whiteClock, white: true),
        if (widget.voiceEnabled)
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
                maxLength: 2000,
                decoration: InputDecoration(hintText: fa ? 'پیام' : 'Message', counterText: ''),
                onSubmitted: (_) => _send(),
              ),
            ),
            IconButton(onPressed: _send, icon: const Icon(Icons.send)),
          ],
        ),
      ],
    );
  }
}
