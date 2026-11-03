import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/hokm_screen.dart';
import 'package:royal_club/services/hokm_service.dart';

class FakeHokmApi implements HokmApi {
  int createCalls = 0;
  int joinCalls = 0;
  int viewCalls = 0;
  int commandCalls = 0;
  int disconnectCalls = 0;
  Map<String, dynamic> room = {};

  Map<String, dynamic> _waiting() => {
    'roomId': 'hokm-room-code',
    'privateRoom': false,
    'status': 'waiting',
    'matchTarget': 3,
    'matchScore': [0, 0],
    'version': 1,
    'hostUserId': 'u1',
    'players': [
      {'userId': 'u1', 'seat': 0, 'ready': false, 'connected': true, 'botControlled': false},
      {'userId': 'u2', 'seat': 1, 'ready': true, 'connected': true, 'botControlled': false},
      {'userId': 'u3', 'seat': 2, 'ready': true, 'connected': true, 'botControlled': false},
      {'userId': 'u4', 'seat': 3, 'ready': true, 'connected': true, 'botControlled': false},
    ],
    'ownProgress': {'xp': 0, 'level': 1},
    'turnDeadlineAt': null,
    'handRevealUntil': null,
    'revealedHands': null,
    'game': null,
  };

  Map<String, dynamic> _playing() => {
    ..._waiting(),
    'status': 'playing',
    'version': 3,
    'players': [
      {'userId': 'u1', 'seat': 0, 'ready': true, 'connected': true, 'botControlled': false},
      {'userId': 'u2', 'seat': 1, 'ready': true, 'connected': true, 'botControlled': false},
      {'userId': 'u3', 'seat': 2, 'ready': true, 'connected': true, 'botControlled': false},
      {'userId': 'u4', 'seat': 3, 'ready': true, 'connected': true, 'botControlled': false},
    ],
    'game': {
      'phase': 'playing',
      'hakemSeat': 0,
      'currentSeat': 0,
      'trumpSuit': 'spades',
      'currentTrick': [],
      'scores': [0, 0],
      'ownSeat': 0,
      'ownHand': [
        {'suit': 'spades', 'rank': 'A'},
        {'suit': 'hearts', 'rank': 'K'},
        {'suit': 'clubs', 'rank': 'Q'},
        {'suit': 'diamonds', 'rank': 'J'},
        {'suit': 'spades', 'rank': '10'},
      ],
    },
  };

  @override
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom}) async {
    createCalls++;
    room = _waiting();
    room['matchTarget'] = matchTarget;
    room['privateRoom'] = privateRoom;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> viewRoom(String roomId) async {
    viewCalls++;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> joinRoom(String roomId, [int? expectedVersion]) async {
    joinCalls++;
    room = _waiting();
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> setReady(String roomId, bool ready, int expectedVersion) async {
    room = _waiting()..['version'] = expectedVersion + 1;
    room['players'][0]['ready'] = ready;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> startMatch(String roomId, int expectedVersion) async {
    room = _playing();
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> startNextRound(String roomId, int expectedVersion) async =>
      Map<String, dynamic>.from(room);

  @override
  Future<Map<String, dynamic>> sendCommand(String roomId, Map<String, dynamic> command, int expectedVersion) async {
    commandCalls++;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> voteCancel(String roomId, bool approve, int expectedVersion) async =>
      Map<String, dynamic>.from(room);

  @override
  Future<Map<String, dynamic>> leaveRoom(String roomId, int expectedVersion) async =>
      Map<String, dynamic>.from(room);

  @override
  Future<Map<String, dynamic>> disconnect(String roomId, int expectedVersion) async {
    disconnectCalls++;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> reconnect(String roomId, int expectedVersion) async =>
      Map<String, dynamic>.from(room);

  @override
  Future<Map<String, dynamic>> reportPlayer(String roomId, String reportedUserId, String reason, int expectedVersion) async =>
      Map<String, dynamic>.from(room);

  @override
  Future<Map<String, dynamic>> submitAppeal(String roomId, String reason, int expectedVersion) async =>
      Map<String, dynamic>.from(room);
}

void main() {
  testWidgets('player can create a room and share its code', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(api: api, identityLoader: () async => 'u1'),
    ));
    await tester.pump();
    await tester.tap(find.text('ساخت اتاق حکم'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.createCalls, 1);
    expect(find.text('hokm-room-code'), findsOneWidget);
    expect(find.text('اتاق انتظار'), findsOneWidget);
  });

  testWidgets('join by room code does not require a member-only room view first', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(api: api, identityLoader: () async => 'u1'),
    ));
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'known-room-code');
    await tester.tap(find.text('ورود'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.joinCalls, 1);
    expect(api.viewCalls, 0);
  });

  testWidgets('four-player match displays a private hand and submits a card command', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(api: api, identityLoader: () async => 'u1'),
    ));
    await tester.pump();
    await tester.tap(find.text('ساخت اتاق حکم'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.tap(find.text('آماده‌ام'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.tap(find.text('شروع مسابقه'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.text('A♠'), findsOneWidget);
    await tester.tap(find.text('A♠'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.commandCalls, 1);
  });

  testWidgets('temporary exit disconnects exactly once', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(api: api, identityLoader: () async => 'u1'),
    ));
    await tester.pump();
    await tester.tap(find.text('ساخت اتاق حکم'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.tap(find.text('آماده‌ام'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.tap(find.text('شروع مسابقه'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.scrollUntilVisible(
      find.text('خروج موقت از بازی'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('خروج موقت از بازی'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.disconnectCalls, 1);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(api.disconnectCalls, 1);
  });
}
