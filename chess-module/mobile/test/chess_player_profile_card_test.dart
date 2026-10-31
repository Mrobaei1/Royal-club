import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_chess/chess_player_profile_card.dart';

void main() {
  testWidgets('public profile card renders username and chess statistics only', (tester) async {
    final profile = ChessPlayerProfile.fromJson({
      'username': 'player_one',
      'level': 7,
      'xp': 1250,
      'rating': 1430,
      'games': 20,
      'wins': 12,
      'losses': 5,
      'draws': 3,
      'winRate': 60.0,
      'fullName': 'Private Legal Name',
      'phone': '+000000000',
    });

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ChessPlayerProfileCard(profile: profile)),
    ));

    expect(find.text('player_one'), findsOneWidget);
    expect(find.text('Level 7'), findsOneWidget);
    expect(find.text('1430'), findsOneWidget);
    expect(find.text('Private Legal Name'), findsNothing);
    expect(find.text('+000000000'), findsNothing);
  });
}
