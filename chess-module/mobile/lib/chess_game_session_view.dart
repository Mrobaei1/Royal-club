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

  void _report(BuildContext context, Object error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString())),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: session,
        builder: (context, _) {
          final game = session.game;
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
                            onPressed: () => unawaited(session.connect().catchError((e) => _report(context, e))),
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
                        onPressed: () => unawaited(session.refresh().catchError((e) => _report(context, e))),
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
                    onMove: (uci) {
                      if (uci.length < 4) return;
                      unawaited(session.submitMove(
                        from: uci.substring(0, 2),
                        to: uci.substring(2, 4),
                        promotion: uci.length > 4 ? uci.substring(4, 5) : null,
                      ).catchError((e) => _report(context, e)));
                    },
                    messages: session.messages,
                    onSendMessage: (message) => unawaited(session.sendChat(message).catchError((e) => _report(context, e))),
                    onVoicePressed: () => unawaited(session.pressToTalk().catchError((e) => _report(context, e))),
                    onVoiceReleased: () => unawaited(session.releaseTalk().catchError((e) => _report(context, e))),
                    voiceEnabled: session.voiceEnabled,
                    speakingUsername: session.speakingUsername,
                    onOfferDraw: () => unawaited(session.offerDraw().catchError((e) => _report(context, e))),
                    onResign: () => unawaited(session.resign().catchError((e) => _report(context, e))),
                    pendingDrawOfferId: session.pendingDrawOfferId,
                    drawOfferedByOpponent: session.drawOfferedByOpponent,
                    onRespondToDraw: (accept) => unawaited(session.respondToDraw(accept).catchError((e) => _report(context, e))),
                  ),
                ),
              ],
            ),
          );
        },
      );
}
