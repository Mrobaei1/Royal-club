import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/notifications_screen.dart';

void main() {
  test('friend-request notification title and body follow the selected language', () {
    final request = <String, dynamic>{
      'type': 'friend_request',
      'title': 'درخواست دوستی جدید',
      'body': 'یک کاربر برای شما درخواست دوستی فرستاده است.',
      'data': {'userId': '42'},
    };
    expect(localizedNotificationTitle(request, true), 'New friend request');
    expect(localizedNotificationBody(request, true), 'A user sent you a friend request.');
    expect(localizedNotificationTitle(request, false), 'درخواست دوستی جدید');
    expect(localizedNotificationBody(request, false), 'یک کاربر برای شما درخواست دوستی فرستاده است.');
  });

  test('friend-accepted notifications and match invites are translated by type', () {
    final accepted = <String, dynamic>{
      'type': 'friend_accepted',
      'title': 'درخواست دوستی پذیرفته شد',
      'body': 'درخواست دوستی شما پذیرفته شد.',
    };
    expect(localizedNotificationTitle(accepted, true), 'Friend request accepted');
    expect(localizedNotificationBody(accepted, true), 'Your friend request was accepted.');

    final invite = <String, dynamic>{
      'type': 'system',
      'title': 'دعوت به تخته‌نرد',
      'body': 'دوست شما را به یک مسابقه تخته‌نرد دعوت کرده است.',
      'data': {'inviteId': 'invite-1', 'matchId': 'match-1'},
    };
    expect(localizedNotificationTitle(invite, true), 'Backgammon invitation');
    expect(localizedNotificationBody(invite, true), contains('Accept within 60 seconds'));
  });
  testWidgets('notification details open in a small dialog with a close action', (tester) async {
    await tester.view.setPhysicalSize(const Size(800, 1200));
    await tester.view.setDevicePixelRatio(1);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showDialog<void>(
              context: context,
              builder: (_) => const NotificationDetailsDialog(
                title: 'New friend request',
                body: 'A user sent you a friend request.',
                closeLabel: 'Close notification',
              ),
            ),
            child: const Text('Open notification'),
          ),
        ),
      ),
    ));

    await tester.tap(find.text('Open notification'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('A user sent you a friend request.'), findsOneWidget);
    expect(find.text('Close notification'), findsOneWidget);

    await tester.tap(find.text('Close notification'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
  });

}
