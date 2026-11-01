import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/iranian_manch_board.dart';

void main() {
  testWidgets('Iranian Manch board renders as a square custom-painted board',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.binding.setSurfaceSize(const Size(420, 800));
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 360,
              child: IranianManchBoard(),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(IranianManchBoard), findsOneWidget);
    expect(find.byType(CustomPaint), findsOneWidget);
    expect(find.bySemanticsLabel('Iranian four-colour Manch board'),
        findsOneWidget);

    final size = tester.getSize(find.byType(IranianManchBoard));
    expect(size.width, closeTo(size.height, .01));
    await tester.binding.setSurfaceSize(null);
    semantics.dispose();
  });

  testWidgets('board home tap reports the fixed red seat in upper-left',
      (tester) async {
    ManchSeat? tapped;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 300,
              child: IranianManchBoard(onHomeTap: (seat) => tapped = seat),
            ),
          ),
        ),
      ),
    );

    final boardTopLeft = tester.getTopLeft(find.byType(IranianManchBoard));
    await tester.tapAt(boardTopLeft + const Offset(35, 35));
    expect(tapped, ManchSeat.red);
  });
}
