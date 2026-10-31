import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_uno/uno_chat_panel.dart';

void main() {
  testWidgets('chat panel displays messages and sends when enabled', (tester) async {
    final controller = TextEditingController();
    var sendCount = 0;
    await tester.pumpWidget(MaterialApp(
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
    expect(tester.widget<IconButton>(find.byTooltip('ارسال پیام')).onPressed, isNull);
    controller.dispose();
  });
}
