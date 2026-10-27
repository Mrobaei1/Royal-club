import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/backgammon_engine.dart';
import 'package:royal_club/engine_backgammon_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  testWidgets('backgammon screen renders controls and board in portrait',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MaterialApp(home: EngineBackgammonScreen()));
    await tester.pump();
    expect(find.text('روش بازی را انتخاب کنید'), findsOneWidget);
    await tester.tap(find.text('بازی آفلاین با هوش مصنوعی'));
    await tester.pumpAndSettle();

    expect(find.text('تخته‌نرد سلطنتی'), findsOneWidget);
    expect(find.text('بازی با هوش مصنوعی'), findsOneWidget);
    expect(find.text('تم صفحه بازی:'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('شروع مجدد'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('شروع مجدد'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('نسخه آزمایشی محلی · بازی با هوش مصنوعی یا دونفره روی یک دستگاه'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('نسخه آزمایشی محلی · بازی با هوش مصنوعی یا دونفره روی یک دستگاه'),
        findsOneWidget);
  });

  testWidgets('switching to local two-player mode updates the game status',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MaterialApp(home: EngineBackgammonScreen()));
    await tester.pump();
    await tester.tap(find.text('بازی آفلاین با هوش مصنوعی'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('بازی دونفره'));
    await tester.pump();

    expect(find.text('بازی دونفره محلی؛ تاس بریزید.'), findsOneWidget);
  });
  testWidgets('tapping a legal destination enters a checker directly from the bar',
      (tester) async {
    tester.view.physicalSize = const Size(900, 540);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final engine = BackgammonEngine();
    await tester.pumpWidget(
      MaterialApp(home: EngineBackgammonScreen(engineForTesting: engine)),
    );
    await tester.tap(find.byWidgetPredicate((widget) => widget is Text && (widget.data == 'بازی دونفره' || widget.data == 'دونفره')));
    await tester.pumpAndSettle();

    engine.points.fillRange(0, 24, 0);
    engine.bar[0] = 0;
    engine.bar[1] = 1;
    engine.borneOff[0] = 14;
    engine.borneOff[1] = 14;
    engine.currentPlayer = 1;
    engine.dice = [1, 2];
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('backgammon-point-23')));
    await tester.pump();

    expect(engine.bar[1], 0);
    expect(engine.points[23], 1);
    expect(engine.dice, [2]);
    expect(engine.currentPlayer, 1);
  });

  testWidgets('tapping a cumulative destination moves the selected checker with both dice',
      (tester) async {
    tester.view.physicalSize = const Size(900, 540);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final engine = BackgammonEngine();
    await tester.pumpWidget(
      MaterialApp(home: EngineBackgammonScreen(engineForTesting: engine)),
    );
    await tester.pump();
    await tester.tap(find.byWidgetPredicate((widget) => widget is Text && (widget.data == 'بازی دونفره' || widget.data == 'دونفره')));
    await tester.pumpAndSettle();

    engine.points.fillRange(0, 24, 0);
    engine.points[0] = 1;
    engine.bar[0] = engine.bar[1] = 0;
    engine.borneOff[0] = 14;
    engine.borneOff[1] = 14;
    engine.currentPlayer = 1;
    engine.dice = [1, 2];
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('backgammon-point-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('backgammon-point-3')));
    await tester.pump();

    expect(engine.points[0], 0);
    expect(engine.points[3], 1);
    expect(engine.dice, isEmpty);
    expect(engine.currentPlayer, -1);
  });


  testWidgets('shows a 20-second timer for the human and hides the AI timer',
      (tester) async {
    tester.view.physicalSize = const Size(900, 540);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MaterialApp(home: EngineBackgammonScreen()));
    await tester.tap(find.text('بازی آفلاین با هوش مصنوعی'));
    await tester.pumpAndSettle();

    expect(find.text('⏱ 20'), findsOneWidget);

    await tester.tap(find.byWidgetPredicate((widget) => widget is Text && (widget.data == 'بازی دونفره' || widget.data == 'دونفره')));
    await tester.pumpAndSettle();

    expect(find.text('⏱ 20'), findsNWidgets(2));
  });


}
