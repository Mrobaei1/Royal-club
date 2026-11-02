import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_uno/uno_chat_panel.dart';

void main() {
  testWidgets('chat panel displays messages and sends when enabled', (tester) async {
    final controller = TextEditingController();
    var sendCount = 0;
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('fa'),
      home: Scaffold(
        body: UnoChatPanel(
          controller: controller,
          messages: const [
            {'username': 'player_one', 'text': 'سلام به همه'},
          ],
          enabled: true,
          onSend: () => sendCount++,
        ),
      ),
    ));

    expect(find.text('چت میز'), findsOneWidget);
    expect(find.text('@player_one: سلام به همه'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'پیام آزمایشی');
    await tester.tap(find.byTooltip('ارسال پیام'));
    expect(sendCount, 1);
    expect(controller.text, 'پیام آزمایشی');
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

  testWidgets('chat input and send action are disabled by host setting', (tester) async {
    final controller = TextEditingController();
    var sendCount = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: UnoChatPanel(
          controller: controller,
          messages: const [],
          enabled: false,
          onSend: () => sendCount++,
        ),
      ),
    ));

    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    expect(tester.widget<IconButton>(find.ancestor(of: find.byIcon(Icons.send), matching: find.byType(IconButton))).onPressed, isNull);
    controller.dispose();
  });
  testWidgets('chat panel localizes to English and keeps messages readable', (tester) async {
    final controller = TextEditingController();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      home: Scaffold(
        body: UnoChatPanel(
          controller: controller,
          messages: const [{'username': 'player_two', 'text': 'Hello'}],
          enabled: true,
          onSend: () {},
        ),
      ),
    ));
    expect(find.text('Table chat'), findsOneWidget);
    expect(find.text('Write a message…'), findsOneWidget);
    expect(find.byTooltip('Send message'), findsOneWidget);
    expect(find.text('@player_two: Hello'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

}
