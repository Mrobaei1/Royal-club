import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_uno/uno_mic_button.dart';

void main() {
  testWidgets('microphone control toggles through its callback when enabled', (tester) async {
    var presses = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        appBar: AppBar(actions: [
          UnoMicButton(muted: true, enabled: true, onPressed: () => presses++),
        ]),
      ),
    ));

    expect(find.byIcon(Icons.mic_off), findsOneWidget);
    await tester.tap(find.byTooltip('روشن‌کردن میکروفون'));
    expect(presses, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('microphone control is disabled when host disables voice', (tester) async {
    var presses = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        appBar: AppBar(actions: [
          UnoMicButton(muted: true, enabled: false, onPressed: () => presses++),
        ]),
      ),
    ));

    final button = tester.widget<IconButton>(find.byTooltip('روشن‌کردن میکروفون'));
    expect(button.onPressed, isNull);
    await tester.tap(find.byTooltip('روشن‌کردن میکروفون'));
    expect(presses, 0);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
