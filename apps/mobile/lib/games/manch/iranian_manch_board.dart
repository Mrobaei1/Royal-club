import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Fixed seat positions for the classic Iranian four-colour Manch board.
/// These positions deliberately do not depend on Directionality (RTL/LTR).
enum ManchSeat { red, green, yellow, blue }

/// A responsive, paint-only foundation for the Iranian Manch board.
///
/// This widget does not implement game rules, dice, turns, persistence or
/// networking. Those belong in the Manch engine and screen layers.
class IranianManchBoard extends StatelessWidget {
  const IranianManchBoard({
    super.key,
    this.activeSeat,
    this.onHomeTap,
    this.showSampleTokens = true,
  });

  final ManchSeat? activeSeat;
  final ValueChanged<ManchSeat>? onHomeTap;
  final bool showSampleTokens;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final side = math.min(constraints.maxWidth, constraints.maxHeight);
          return Semantics(
            label: 'Iranian four-colour Manch board',
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: onHomeTap == null
                  ? null
                  : (details) {
                      final seat = _seatFor(details.localPosition, side);
                      if (seat != null) onHomeTap!(seat);
                    },
              child: CustomPaint(
                size: Size.square(side),
                painter: _IranianManchPainter(
                  activeSeat: activeSeat,
                  showSampleTokens: showSampleTokens,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  ManchSeat? _seatFor(Offset point, double side) {
    final x = point.dx / side;
    final y = point.dy / side;
    if (x < .4 && y < .4) return ManchSeat.red;
    if (x > .6 && y < .4) return ManchSeat.green;
    if (x > .6 && y > .6) return ManchSeat.yellow;
    if (x < .4 && y > .6) return ManchSeat.blue;
    return null;
  }
}

class _IranianManchPainter extends CustomPainter {
  const _IranianManchPainter({
    required this.activeSeat,
    required this.showSampleTokens,
  });

  final ManchSeat? activeSeat;
  final bool showSampleTokens;

  static const frame = Color(0xFF111B31);
  static const gold = Color(0xFFD8B45A);
  static const route = Color(0xFFF7F1E5);
  static const line = Color(0xFFB7AA96);

  static const Map<ManchSeat, Color> seatColors = {
    ManchSeat.red: Color(0xFFD94747),
    ManchSeat.green: Color(0xFF239B69),
    ManchSeat.yellow: Color(0xFFF0C642),
    ManchSeat.blue: Color(0xFF397BD4),
  };

  // The 52 shared route cells on a 15x15 classic four-colour board.
  // The list is rotated so the four entry cells are indices 0, 13, 26 and 39.
  static const List<(int, int)> trackCells = [
    (6, 0), (6, 1), (6, 2), (6, 3), (6, 4), (6, 5),
    (5, 6), (4, 6), (3, 6), (2, 6), (1, 6), (0, 6),
    (0, 7), (0, 8), (1, 8), (2, 8), (3, 8), (4, 8),
    (5, 8), (6, 9), (6, 10), (6, 11), (6, 12), (6, 13),
    (6, 14), (7, 14), (8, 14), (8, 13), (8, 12), (8, 11),
    (8, 10), (8, 9), (9, 8), (10, 8), (11, 8), (12, 8),
    (13, 8), (14, 8), (14, 7), (14, 6), (13, 6), (12, 6),
    (11, 6), (10, 6), (9, 6), (8, 5), (8, 4), (8, 3),
    (8, 2), (8, 1), (8, 0), (7, 0),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final side = math.min(size.width, size.height);
    if (side <= 0) return;
    final u = side / 15;
    final board = Rect.fromLTWH(0, 0, side, side);
    final outer = RRect.fromRectAndRadius(board, Radius.circular(u * .55));

    canvas.drawRRect(
      outer,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFF263958), frame, Color(0xFF080F1E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ).createShader(board),
    );
    canvas.save();
    canvas.clipRRect(outer);
    canvas.drawRect(board.deflate(u * .35), Paint()..color = const Color(0xFFDED2BC));

    _drawYard(canvas, u, 0, 0, ManchSeat.red);
    _drawYard(canvas, u, 9, 0, ManchSeat.green);
    _drawYard(canvas, u, 9, 9, ManchSeat.yellow);
    _drawYard(canvas, u, 0, 9, ManchSeat.blue);

    // Draw only the 52 actual shared-route cells; the yards remain clear.
    for (final point in trackCells) {
      final cell = Rect.fromLTWH(point.$2 * u, point.$1 * u, u, u);
      canvas.drawRect(cell, Paint()..color = route);
      canvas.drawRect(
        cell,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(.6, u * .025)
          ..color = line,
      );
    }

    _drawEntryCell(canvas, u, 6, 0, ManchSeat.red);
    _drawEntryCell(canvas, u, 0, 8, ManchSeat.green);
    _drawEntryCell(canvas, u, 8, 14, ManchSeat.yellow);
    _drawEntryCell(canvas, u, 14, 6, ManchSeat.blue);

    _drawLane(canvas, u, ManchSeat.red,
        List.generate(5, (i) => (7, i + 1)));
    _drawLane(canvas, u, ManchSeat.green,
        List.generate(5, (i) => (i + 1, 7)));
    _drawLane(canvas, u, ManchSeat.yellow,
        List.generate(5, (i) => (7, 13 - i)));
    _drawLane(canvas, u, ManchSeat.blue,
        List.generate(5, (i) => (13 - i, 7)));

    _drawCentre(canvas, u);
    _drawSafeMarker(canvas, Offset(.5 * u, 6.5 * u), u * .19);
    _drawSafeMarker(canvas, Offset(8.5 * u, .5 * u), u * .19);
    _drawSafeMarker(canvas, Offset(14.5 * u, 8.5 * u), u * .19);
    _drawSafeMarker(canvas, Offset(6.5 * u, 14.5 * u), u * .19);

    if (showSampleTokens) {
      for (final seat in ManchSeat.values) {
        _drawYardTokens(canvas, u, seat, activeSeat == seat);
      }
    }
    canvas.restore();

    canvas.drawRRect(
      outer,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(2, u * .12)
        ..color = gold,
    );
  }

  void _drawEntryCell(
      Canvas canvas, double u, int row, int col, ManchSeat seat) {
    final rect = Rect.fromLTWH(col * u, row * u, u, u);
    canvas.drawRect(rect, Paint()..color = seatColors[seat]!);
    canvas.drawRect(
      rect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(.7, u * .04)
        ..color = const Color(0xFFFFE7A0),
    );
  }

  void _drawYard(Canvas canvas, double u, int col, int row, ManchSeat seat) {
    final rect = Rect.fromLTWH(col * u, row * u, 6 * u, 6 * u);
    final color = seatColors[seat]!;
    canvas.drawRect(rect, Paint()..color = color);
    final inner = rect.deflate(u * .55);
    final rr = RRect.fromRectAndRadius(inner, Radius.circular(u * .38));
    canvas.drawRRect(
      rr,
      Paint()
        ..shader = LinearGradient(
          colors: [Color.lerp(color, Colors.white, .22)!, color],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ).createShader(inner),
    );
    canvas.drawRRect(
      rr,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = u * .07
        ..color = const Color(0xFFFFE7A0),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(inner.deflate(u * .85), Radius.circular(u * .2)),
      Paint()..color = const Color(0xFFEDE5D7),
    );
  }

  void _drawYardTokens(
      Canvas canvas, double u, ManchSeat seat, bool active) {
    final origin = switch (seat) {
      ManchSeat.red => Offset.zero,
      ManchSeat.green => Offset(9 * u, 0),
      ManchSeat.yellow => Offset(9 * u, 9 * u),
      ManchSeat.blue => Offset(0, 9 * u),
    };
    for (final offset in const [
      Offset(2, 2), Offset(4, 2), Offset(2, 4), Offset(4, 4)
    ]) {
      _drawToken(
        canvas,
        origin + Offset(offset.dx * u, offset.dy * u),
        u * .34,
        seatColors[seat]!,
        active,
      );
    }
  }

  void _drawToken(
      Canvas canvas, Offset center, double radius, Color color, bool active) {
    canvas.drawCircle(
      center + Offset(0, radius * .15),
      radius,
      Paint()
        ..color = Colors.black.withValues(alpha: .25)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, radius * .18),
    );
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(-.35, -.4),
          colors: [
            Color.lerp(color, Colors.white, .35)!,
            color,
            Color.lerp(color, Colors.black, .25)!,
          ],
        ).createShader(Rect.fromCircle(center: center, radius: radius)),
    );
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = radius * .12
        ..color = active ? gold : const Color(0xFFEFE4CF),
    );
    canvas.drawCircle(
      center - Offset(radius * .18, radius * .2),
      radius * .12,
      Paint()..color = Colors.white.withValues(alpha: .65),
    );
  }

  void _drawLane(
      Canvas canvas, double u, ManchSeat seat, List<(int, int)> cells) {
    final color = seatColors[seat]!;
    for (final cell in cells) {
      final rect = Rect.fromLTWH(cell.$2 * u, cell.$1 * u, u, u);
      canvas.drawRect(rect, Paint()..color = color.withValues(alpha: .9));
      canvas.drawRect(
        rect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(.7, u * .035)
          ..color = const Color(0xAAFFFFFF),
      );
    }
  }

  void _drawCentre(Canvas canvas, double u) {
    final center = Offset(7.5 * u, 7.5 * u);
    final corners = [
      (ManchSeat.green, Offset(6 * u, 6 * u), Offset(9 * u, 6 * u)),
      (ManchSeat.yellow, Offset(9 * u, 6 * u), Offset(9 * u, 9 * u)),
      (ManchSeat.blue, Offset(9 * u, 9 * u), Offset(6 * u, 9 * u)),
      (ManchSeat.red, Offset(6 * u, 9 * u), Offset(6 * u, 6 * u)),
    ];
    for (final item in corners) {
      final path = Path()
        ..moveTo(item.$2.dx, item.$2.dy)
        ..lineTo(item.$3.dx, item.$3.dy)
        ..lineTo(center.dx, center.dy)
        ..close();
      canvas.drawPath(path, Paint()..color = seatColors[item.$1]!);
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(.8, u * .045)
          ..color = const Color(0xFFFFE7A0),
      );
    }
    canvas.drawCircle(center, u * .12, Paint()..color = route);
    canvas.drawCircle(
      center,
      u * .12,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = u * .04
        ..color = gold,
    );
  }

  void _drawSafeMarker(Canvas canvas, Offset center, double radius) {
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final angle = -math.pi / 2 + i * math.pi / 5;
      final r = i.isEven ? radius : radius * .43;
      final p = center + Offset(math.cos(angle) * r, math.sin(angle) * r);
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    path.close();
    canvas.drawPath(path, Paint()..color = gold);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(.6, radius * .12)
        ..color = frame,
    );
  }

  @override
  bool shouldRepaint(covariant _IranianManchPainter oldDelegate) =>
      oldDelegate.activeSeat != activeSeat ||
      oldDelegate.showSampleTokens != showSampleTokens;
}
