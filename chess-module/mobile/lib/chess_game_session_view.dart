import 'dart:async';

import 'package:flutter/material.dart';

import 'chess_game_screen.dart';
import 'chess_game_session.dart';

class ChessGameSessionView extends StatelessWidget {
  const ChessGameSessionView({
    super.key,
    required this.session,
    this.onClose,
  });

  final ChessGameSession session;
  final VoidCallback? onClose;

  void _report(ScaffoldMessengerState messenger, Object error) {
    if (!messenger.mounted) return;
    messenger.showSnackBar(SnackBar(content: Text(error.toString())));
  }

  Future<T?> _guard<T>(Future<T> action, ScaffoldMessengerState messenger) async {
    try {
      return await action;
    } catch (error) {
      _report(messenger, error);
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: session,
        builder: (context, _) {
          final game = session.game;
          final messenger = ScaffoldMessenger.of(context);
          if (game == null) {
            return Scaffold(
              appBar: AppBar(
                title: const Text('Chess'),
                leading: onClose == null ? null : IconButton(
                  onPressed: onClose,
                  icon: const Icon(Icons.arrow_back),
                ),
              ),
              body: Center(
                child: session.errorCode == null
                    ? const CircularProgressIndicator()
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(session.errorCode!),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: () => unawaited(_guard(session.connect(), messenger)),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
              ),
            );
          }

          final fa = Localizations.localeOf(context).languageCode == 'fa';
          return Scaffold(
            appBar: AppBar(
              title: Text(fa ? 'بازی شطرنج' : 'Chess game'),
              leading: onClose == null ? null : IconButton(
                onPressed: onClose,
                icon: const Icon(Icons.arrow_back),
              ),
              actions: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Icon(
                    session.connected ? Icons.wifi : Icons.wifi_off,
                    semanticLabel: session.connected
                        ? (fa ? 'متصل' : 'Connected')
                        : (fa ? 'اتصال قطع است' : 'Disconnected'),
                  ),
                ),
              ],
            ),
            body: Column(
              children: [
                if (session.errorCode != null)
                  MaterialBanner(
                    content: Text(session.errorCode!),
                    actions: [
                      TextButton(
                        onPressed: () => unawaited(_guard(session.refresh(), messenger)),
                        child: Text(fa ? 'تلاش دوباره' : 'Retry'),
                      ),
                    ],
                  ),
                Expanded(
                  child: ChessGameScreen(
                    fen: session.fen,
                    legalMoves: session.legalMoves,
                    whiteUsername: session.whiteUsername,
                    blackUsername: session.blackUsername,
                    whiteClock: session.whiteClock,
                    blackClock: session.blackClock,
                    activeSide: session.activeSide,
                    whiteProfile: session.whiteProfile,
                    blackProfile: session.blackProfile,
                    gameStatus: session.status ?? 'active',
                    canManageVoice: session.isHost,
                    onVoiceEnabledChanged: (enabled) => unawaited(_guard(session.setVoiceEnabled(enabled), messenger)),
                    isHost: session.isHost,
                    onToggleVoice: (enabled) => unawaited(session.setVoiceEnabled(enabled).catchError((e) => _report(messenger, e))),
                    onMove: (uci) {
                      if (uci.length < 4) return;
                      unawaited(_guard(session.submitMove(
                        from: uci.substring(0, 2),
                        to: uci.substring(2, 4),
                        promotion: uci.length > 4 ? uci.substring(4, 5) : null,
                      ), messenger));
                    },
                    messages: session.messages,
                    onSendMessage: (message) => unawaited(_guard(session.sendChat(message), messenger)),
                    onVoicePressed: () => unawaited(_guard(session.pressToTalk(), messenger)),
                    onVoiceReleased: () => unawaited(_guard(session.releaseTalk(), messenger)),
                    voiceEnabled: session.voiceEnabled,
                    speakingUsername: session.speakingUsername,
                    onOfferDraw: () => unawaited(_guard(session.offerDraw(), messenger)),
                    onResign: () => unawaited(_guard(session.resign(), messenger)),
                    pendingDrawOfferId: session.pendingDrawOfferId,
                    drawOfferedByOpponent: session.drawOfferedByOpponent,
                    onRespondToDraw: (accept) => unawaited(_guard(session.respondToDraw(accept), messenger)),
                  ),
                ),
              ],
            ),
          );
        },
      );
}
