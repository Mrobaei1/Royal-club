import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/hokm_screen.dart';
import 'package:royal_club/hokm_manager_review_screen.dart';
import 'package:royal_club/services/hokm_service.dart';

class FakeHokmApi implements HokmApi {
  int createCalls = 0;
  int nextRoundCalls = 0;
  bool createAsRoundCompleted = false;
  int joinCalls = 0;
  int viewCalls = 0;
  int commandCalls = 0;
  int disconnectCalls = 0;
  int chatCalls = 0;
  String? lastChatRecipient;
  String? lastChatText;
  String? lastChatMessageId;
  int? lastChatExpectedVersion;
  int managerCalls = 0;
  int reportReviewCalls = 0;
  int appealReviewCalls = 0;
  String? lastReviewNotes;
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

  Map<String, dynamic> _roundCompletedWithHostDisconnected() {
    final state = _playing();
    state['status'] = 'round_completed';
    state['hostUserId'] = 'u1';
    state['handRevealUntil'] = null;
    state['players'][0]['connected'] = false;
    state['game']['phase'] = 'completed';
    return state;
  }

  @override
  Future<Map<String, dynamic>> createRoom({required int matchTarget, required bool privateRoom}) async {
    createCalls++;
    room = createAsRoundCompleted ? _roundCompletedWithHostDisconnected() : _waiting();
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
  Future<Map<String, dynamic>> startNextRound(String roomId, int expectedVersion) async {
    nextRoundCalls++;
    return Map<String, dynamic>.from(room);
  }

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

  @override
  Future<Map<String, dynamic>> sendChatMessage(String roomId, String recipientUserId, String text, String messageId, int expectedVersion) async {
    chatCalls++;
    lastChatRecipient = recipientUserId;
    lastChatText = text;
    lastChatMessageId = messageId;
    lastChatExpectedVersion = expectedVersion;
    return Map<String, dynamic>.from(room);
  }

  @override
  Future<Map<String, dynamic>> managerView(String roomId) async {
    managerCalls++;
    return {
      'roomId': roomId,
      'version': 4,
      'reports': [{'reportId': 'report-1', 'status': 'pending', 'reportedUserId': 'u2', 'reason': 'Suspected card disclosure'}],
      'appeals': [{'appealId': 'appeal-1', 'status': 'pending', 'reason': 'The final score was disputed'}],
    };
  }

  @override
  Future<Map<String, dynamic>> reviewReport(String roomId, String reportId, String notes, int expectedVersion) async {
    reportReviewCalls++;
    lastReviewNotes = notes;
    return {
      'roomId': roomId, 'version': expectedVersion + 1,
      'reports': [{'reportId': reportId, 'status': 'reviewed', 'reportedUserId': 'u2', 'reason': 'Suspected card disclosure'}],
      'appeals': [],
    };
  }

  @override
  Future<Map<String, dynamic>> reviewAppeal(String roomId, String appealId, String decision, String notes, int expectedVersion) async {
    appealReviewCalls++;
    lastReviewNotes = notes;
    return {
      'roomId': roomId, 'version': expectedVersion + 1,
      'reports': [],
      'appeals': [{'appealId': appealId, 'status': 'reviewed', 'decision': decision, 'reason': 'The final score was disputed'}],
    };
  }
}

void main() {
  testWidgets('manager can review cheating reports and result appeals', (tester) async {
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmManagerReviewScreen(api: api, roomId: 'room-1'),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.managerCalls, 1);
    expect(find.text('Cheating reports (1)'), findsOneWidget);
    expect(find.text('Result appeals (1)'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Evidence checked and recorded');
    await tester.tap(find.byTooltip('Mark reviewed'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.reportReviewCalls, 1);
    expect(api.lastReviewNotes, 'Evidence checked and recorded');
    expect(find.textContaining('reviewed'), findsOneWidget);
  });


  testWidgets('manager can confirm or dismiss a result appeal', (tester) async {
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmManagerReviewScreen(api: api, roomId: 'room-1'),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.enterText(find.byType(TextField), 'Appeal evidence reviewed');
    await tester.tap(find.text('Confirm'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.appealReviewCalls, 1);
    expect(api.lastReviewNotes, 'Appeal evidence reviewed');
  });

  testWidgets('connected player can start the next hand when the host is disconnected', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi()..createAsRoundCompleted = true;
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(api: api, identityLoader: () async => 'u2'),
    ));
    await tester.pump();
    await tester.tap(find.text('Create Hokm room'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(find.text('Start next hand'), findsOneWidget);
    await tester.tap(find.text('Start next hand'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.nextRoundCalls, 1);
  });

  testWidgets('host-provided manager access opens the review screen from the game app', (tester) async {
    tester.view.physicalSize = const Size(1200, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeHokmApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      supportedLocales: const [Locale('fa'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: HokmScreen(
        api: api,
        identityLoader: () async => 'u1',
        managerAccess: true,
      ),
    ));
    await tester.pump();
    await tester.tap(find.text('Create Hokm room'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    await tester.tap(find.byTooltip('Manager review'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.managerCalls, 1);
    expect(find.text('Cheating reports (1)'), findsOneWidget);
  });

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

  testWidgets('player can send a private text message to an opponent', (tester) async {
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
    await tester.enterText(find.byType(TextField), 'سلام 👋');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 20));
    expect(api.chatCalls, 1);
    expect(api.lastChatRecipient, 'u2');
    expect(api.lastChatText, 'سلام 👋');
    expect(api.lastChatMessageId, startsWith('hokm-chat-'));
    expect(api.lastChatExpectedVersion, 3);
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
