import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/main.dart';

void main() {
  testWidgets('app starts through the authentication gate', (tester) async {
    await tester.pumpWidget(const RoyalClubApp());

    expect(find.byType(AuthGate), findsOneWidget);
    expect(find.text('ROYAL CLUB'), findsWidgets);
  });

  testWidgets('home screen keeps all game cards', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: HomeScreen()),
    );

    expect(find.text('تخته‌نرد'), findsOneWidget);
    expect(find.text('شطرنج'), findsOneWidget);
    expect(find.text('بازی‌های کارتی'), findsOneWidget);
  });
}
