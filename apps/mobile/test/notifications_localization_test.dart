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
}
