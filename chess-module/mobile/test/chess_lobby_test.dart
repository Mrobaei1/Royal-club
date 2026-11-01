import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_admin_settings_screen.dart';
import 'package:royal_club_chess/chess_lobby_screen.dart';

void main() {
  const controls = [
    ChessTimeControl(id: 'rapid', displayName: 'Rapid', baseMs: 300000, incrementMs: 0, enabled: true),
  ];

  testWidgets('lobby submits private room creation with selected settings', (tester) async {
    var created = false;
    await tester.pumpWidget(MaterialApp(
      home: ChessLobbyScreen(
        timeControls: controls,
        onCreateRoom: (id, level, chat, voice) async {
          expect(id, 'rapid');
          expect(level, 1);
          expect(chat, isTrue);
          expect(voice, isFalse);
          created = true;
        },
        onJoinRoom: (_) async {},
        onJoinMatchmaking: (_, __) async {},
        onCancelMatchmaking: () {},
      ),
    ));

    await tester.tap(find.text('Create private room'));
    await tester.pumpAndSettle();
    expect(created, isTrue);
  });

  testWidgets('non-admin cannot see chess time-control editing actions', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: ChessAdminSettingsScreen(
        controls: controls,
        canManage: false,
        onSave: _ignoreSave,
        onDelete: _ignoreDelete,
      ),
    ));

    expect(find.text('You do not have permission to manage settings'), findsOneWidget);
    expect(find.byIcon(Icons.add), findsNothing);
  });
}

void _ignoreSave(ChessTimeControl _) {}
void _ignoreDelete(String _) {}
