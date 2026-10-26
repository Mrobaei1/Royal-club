import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
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

    expect(find.text('تخته‌نرد سلطنتی'), findsOneWidget);
    expect(find.text('بازی با هوش مصنوعی'), findsOneWidget);
    expect(find.text('تم صفحه بازی:'), findsOneWidget);
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

    await tester.tap(find.text('بازی دونفره'));
    await tester.pump();

    expect(find.text('بازی دونفره محلی؛ تاس بریزید.'), findsOneWidget);
  });
}
