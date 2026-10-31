import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/room_controls_menu.dart';

void main() {
  testWidgets('opens the shared room controls menu', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(
            actions: [
              RoomControlsMenuButton(
                tooltip: 'Room controls',
                itemsBuilder: (_) => const [
                  ListTile(title: Text('Invite player')),
                  ListTile(title: Text('Close room')),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.byTooltip('Room controls'));
    await tester.pumpAndSettle();

    expect(find.text('Invite player'), findsOneWidget);
    expect(find.text('Close room'), findsOneWidget);
  });
}
