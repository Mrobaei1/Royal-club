import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/main.dart';

void main() {
  testWidgets('home screen shows Royal Club branding', (tester) async {
    await tester.pumpWidget(const RoyalClubApp());
    expect(find.text('ROYAL CLUB'), findsOneWidget);
    expect(find.text('تخته‌نرد'), findsOneWidget);
  });
}
