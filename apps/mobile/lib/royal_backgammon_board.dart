import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';

/// Shared visual board for Royal Club online and offline backgammon.
class RoyalBackgammonBoard extends StatelessWidget {
  const RoyalBackgammonBoard({super.key, required this.points, required this.onPointTap,
    this.selectedPoint, this.legalTargets = const <int>{}, this.barWhite = 0,
    this.barBlack = 0, this.offWhite = 0, this.offBlack = 0, this.dice = const <int>[],
    this.onBearOff, this.themeColors = const [Color(0xFF6D4026), Color(0xFF76502E), Color(0xFF3B2418)],
    this.onRoll, this.rollLabel = 'Roll dice', this.timerText, this.timerWhite = true});
  final List<num> points;
  final ValueChanged<int> onPointTap;
  final int? selectedPoint;
  final Set<int> legalTargets;
  final int barWhite, barBlack, offWhite, offBlack;
  final List<int> dice;
  final VoidCallback? onBearOff;
  final List<Color> themeColors;
  final VoidCallback? onRoll;
  final String rollLabel;
  final String? timerText;
  final bool timerWhite;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
    final panel = (c.maxWidth * .075).clamp(28.0, 58.0).toDouble();
    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(width: panel, child: Column(children: [
        Expanded(child: _CountPanel(label: appText(context, 'مشکی', 'Black'), count: offBlack, white: false,
          onTap: !timerWhite ? onBearOff : null, themeColors: themeColors,
          timerText: timerText != null && !timerWhite ? timerText : null)),
        Expanded(child: _CountPanel(label: appText(context, 'طلایی', 'Gold'), count: offWhite, white: true,
          onTap: timerWhite ? onBearOff : null, themeColors: themeColors,
          timerText: timerText != null && timerWhite ? timerText : null)),
      ])),
      const SizedBox(width: 5),
      Expanded(child: LayoutBuilder(builder: (context, boardC) {
        final size = Size(boardC.maxWidth, boardC.maxHeight);
        final middle = _RoyalBoardPainter.middleHeight(size);
        final rowHeight = (size.height - middle) / 2;
        final barWidth = (size.width * .09).clamp(24.0, 42.0).toDouble();
        return Stack(fit: StackFit.expand, children: [
          CustomPaint(painter: _RoyalBoardPainter(points: points, selected: selectedPoint,
            targets: legalTargets, dice: dice, themeColors: themeColors)),
          for (var point = 0; point < 24; point++)
            Positioned.fromRect(
              rect: _RoyalBoardPainter.pointRect(point, size),
              child: GestureDetector(
                key: ValueKey('backgammon-point-$point'),
                behavior: HitTestBehavior.opaque,
                onTap: () => onPointTap(point),
                child: const SizedBox.expand(),
              ),
            ),
          Positioned(left: size.width / 2 - barWidth / 2, top: rowHeight * .35,
            width: barWidth, child: _BarCount(count: barBlack, white: false)),
          Positioned(left: size.width / 2 - barWidth / 2, top: rowHeight + middle + rowHeight * .35,
            width: barWidth, child: _BarCount(count: barWhite, white: true)),
          if (onRoll != null)
            Positioned(left: size.width * .55, right: 5,
              top: rowHeight + middle / 2 - 19,
              child: FilledButton.icon(
                onPressed: onRoll,
                icon: const Icon(Icons.casino, size: 17),
                label: Text(rollLabel, maxLines: 1, overflow: TextOverflow.ellipsis),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFE2B253),
                  foregroundColor: const Color(0xFF172033),
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
                  minimumSize: const Size(0, 38),
                ),
              )),
        ]);
      })),
    ]);
  });
}

class _CountPanel extends StatelessWidget {
  const _CountPanel({required this.label, required this.count, required this.white, this.onTap, required this.themeColors, this.timerText});
  final String label;
  final int count;
  final bool white;
  final VoidCallback? onTap;
  final List<Color> themeColors;
  final String? timerText;

  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(width: double.infinity, margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(7),
        border: Border.all(color: const Color(0xFFD8B45A), width: 1.2),
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
          colors: [themeColors[1], themeColors[2]])),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        FittedBox(child: Text(label, style: const TextStyle(color: Color(0xFFD8B45A), fontSize: 11, fontWeight: FontWeight.w700))),
        const SizedBox(height: 4),
        CustomPaint(size: const Size(22, 22), painter: _CheckerPainter(white)),
        const SizedBox(height: 3),
        FittedBox(child: Text(count.toString(), style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold))),
        if (timerText != null) ...[
          const SizedBox(height: 4),
          FittedBox(child: Text(timerText!, style: const TextStyle(color: Color(0xFFFFE7A0), fontSize: 10, fontWeight: FontWeight.bold))),
        ],
      ])));
}

class _BarCount extends StatelessWidget {
  const _BarCount({required this.count, required this.white});
  final int count;
  final bool white;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Column(mainAxisSize: MainAxisSize.min, children: [
      CustomPaint(size: const Size(22, 22), painter: _CheckerPainter(white)),
      const SizedBox(height: 2),
      FittedBox(child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800))),
    ]);
  }
}

class _CheckerPainter extends CustomPainter {
  const _CheckerPainter(this.white); final bool white;
  @override void paint(Canvas c, Size s) => _checker(c, s.center(Offset.zero), s.width * .45, white);
  @override bool shouldRepaint(covariant _CheckerPainter old) => old.white != white;
}

void _checker(Canvas c, Offset o, double r, bool white) {
  // Match the original Royal Club board: gold checkers versus near-black checkers.
  c.drawCircle(o + Offset(0, r*.12), r, Paint()..color = Colors.black.withValues(alpha: .4)
    ..maskFilter = MaskFilter.blur(BlurStyle.normal, r*.16));
  c.drawCircle(o, r, Paint()..shader = RadialGradient(center: const Alignment(-.35,-.45), radius: 1.1,
    colors: white ? const [Color(0xFFFFE9A3),Color(0xFFD8B45A),Color(0xFF9B702C)]
      : const [Color(0xFF4B4B4B),Color(0xFF171717),Color(0xFF050505)])
    .createShader(Rect.fromCircle(center:o,radius:r)));
  c.drawCircle(o,r,Paint()..style=PaintingStyle.stroke..strokeWidth=r*.07
    ..color=white?const Color(0xFFFFE7A0):const Color(0xFF777777));
  c.drawCircle(o,r*.68,Paint()..style=PaintingStyle.stroke..strokeWidth=r*.06
    ..color=white?const Color(0x55FFF1B5):const Color(0x33FFFFFF));
}

class _RoyalBoardPainter extends CustomPainter {
  _RoyalBoardPainter({required this.points, required this.selected, required this.targets, required this.dice, required this.themeColors});
  final List<num> points;
  final int? selected;
  final Set<int> targets;
  final List<int> dice;
  final List<Color> themeColors;
  static const gold = Color(0xFFD8B45A);
  static const navy = Color(0xFF10182B);
  static const paleGreen = Color(0xFFB9E7C5);

  static double middleHeight(Size s) => (s.height * .09).clamp(26.0, 44.0).toDouble();

  static Rect pointRect(int i, Size s) {
    final m=s.width*.025, bw=(s.width*.09).clamp(24.0,42.0).toDouble(), hw=(s.width-2*m-bw)/2, pw=hw/6;
    final top=i<12;
    final col=top?(i<6?11-i:5-(i-6)):i-12;
    final left=col<6?m+col*pw:m+hw+bw+(col-6)*pw;
    final middle=middleHeight(s), row=(s.height-middle)/2;
    return Rect.fromLTWH(left, top?0:row+middle, pw, row);
  }

  @override
  void paint(Canvas c, Size s) {
    final w=s.width, h=s.height, m=w*.025, bw=(w*.09).clamp(24.0,42.0).toDouble();
    final hw=(w-2*m-bw)/2, pw=hw/6, mid=middleHeight(s), row=(h-mid)/2;
    final topBase=row*.98, bottomBase=row+mid+row*.02;
    final triH=row*.56, r=math.min(pw*.43, row*.17);
    double colX(int col)=>col<6?m+col*pw:m+hw+bw+(col-6)*pw;
    final bounds=Offset.zero&s;
    final frame=RRect.fromRectAndRadius(bounds,Radius.circular(w*.022));
    c.drawRRect(frame,Paint()..shader=LinearGradient(begin:Alignment.topLeft,end:Alignment.bottomRight,
      colors:themeColors).createShader(bounds));
    c.save();
    c.clipRRect(frame);
    final random=math.Random(7);
    for(var j=0;j<90;j++){
      final x=random.nextDouble()*w;
      c.drawLine(Offset(x,0),Offset(x+(random.nextDouble()-.5)*12,h),
        Paint()..strokeWidth=.7..color=(random.nextBool()?Colors.black:Colors.white).withValues(alpha:.055));
    }
    c.restore();
    c.drawRRect(frame,Paint()..style=PaintingStyle.stroke..strokeWidth=3..color=gold);
    for (var half=0;half<2;half++) {
      final left=half==0?m:m+hw+bw;
      final rect=RRect.fromRectAndRadius(Rect.fromLTRB(left,2,left+hw,h-2),Radius.circular(w*.006));
      c.drawRRect(rect,Paint()..color=const Color(0xFF2A211C));
      c.drawRRect(rect,Paint()..style=PaintingStyle.stroke..strokeWidth=1.5..color=gold.withValues(alpha:.65));
    }
    // Original Royal Club inlays: alternating white and pale green, with red point labels.
    for (var i=0;i<24;i++) {
      final isTop=i<12;
      final col=isTop?(i<6?11-i:5-(i-6)):i-12;
      final x=colX(col), cx=x+pw/2;
      final base=isTop?topBase:bottomBase;
      final tip=isTop?topBase+triH:bottomBase-triH;
      final color=(col%6).isEven?const Color(0xFFFFFFFF):paleGreen;
      final path=Path()..moveTo(x+pw*.04,base)..lineTo(x+pw*.96,base)..lineTo(cx,tip)..close();
      c.drawPath(path,Paint()..color=color);
      c.drawPath(path,Paint()..style=PaintingStyle.stroke..strokeWidth=.7..color=const Color(0xFF8B8B8B).withValues(alpha:.45));
      if(selected==i||targets.contains(i)){
        final hl=selected==i?gold:Colors.greenAccent;
        c.drawPath(path,Paint()..color=hl.withValues(alpha:.32));
        c.drawPath(path,Paint()..style=PaintingStyle.stroke..strokeWidth=1.8..color=hl);
      }
      final count=i<points.length?points[i].toInt():0;
      if(count!=0){
        final n=count.abs().clamp(1,15), shown=math.min(n,6);
        final gap=n*2*r<=triH?2*r:(triH-2*r)/math.max(1,n-1);
        for(var k=0;k<shown;k++){
          final cy=isTop?topBase+r*1.8+k*gap:bottomBase-r*1.8-k*gap;
          _checker(c,Offset(cx,cy),r,count>0);
        }
        if(count.abs()>5)_txt(c,count.abs().toString(),Offset(cx,isTop?topBase+r*1.8:bottomBase-r*1.8),r*.8,count>0?const Color(0xFF302315):Colors.white);
      }
      _txt(c,i.toString(),Offset(cx,isTop?row*.035:h-row*.035),math.max(8.0,pw*.24),const Color(0xFFE53935));
    }

    // The navy-and-gold central strip matches the original roll/dice control band.
    final bar=Rect.fromLTWH(m+hw,0,bw,h);
    c.drawRect(bar,Paint()..shader=const LinearGradient(colors:[Color(0xFF2E190B),Color(0xFF5A3419),Color(0xFF2E190B)]).createShader(bar));
    c.drawRect(Rect.fromLTWH(0,row,w,mid),Paint()..shader=const LinearGradient(colors:[navy,Color(0xFF202D46),navy]).createShader(Rect.fromLTWH(0,row,w,mid)));
    c.drawRect(Rect.fromLTWH(0,row,w,mid),Paint()..style=PaintingStyle.stroke..strokeWidth=1.2..color=gold);
    c.drawLine(Offset(w*.51,row+3),Offset(w*.51,row+mid-3),Paint()..strokeWidth=2..color=gold);
    // Subtle royal emblems remain behind the central control strip, as in the original theme.
    for(var half=0;half<2;half++){
      final cx=(half==0?m:m+hw+bw)+hw/2;
      _crown(c,Offset(cx,row+mid/2),w*.045);
    }
    for(var j=0;j<math.min(2,dice.length);j++){
      final dx=dice.length==1?0:(j==0?-w*.035:w*.035);
      _die(c,Offset(w*.75+dx,row+mid/2),math.min(mid*.64,w*.055),dice[j]);
    }
  }

  static void _txt(Canvas c,String t,Offset o,double size,Color color){
    final p=TextPainter(text:TextSpan(text:t,style:TextStyle(color:color,fontSize:size,fontWeight:FontWeight.w900,
      shadows:const [Shadow(color:Colors.black45,blurRadius:2)])),textDirection:TextDirection.ltr)..layout();
    p.paint(c,o-Offset(p.width/2,p.height/2));
  }

  static void _die(Canvas c,Offset o,double s,int v){
    final rect=RRect.fromRectAndRadius(Rect.fromCenter(center:o,width:s,height:s),Radius.circular(s*.2));
    c.drawRRect(rect.shift(Offset(0,s*.06)),Paint()..color=Colors.black.withValues(alpha:.4)..maskFilter=MaskFilter.blur(BlurStyle.normal,s*.08));
    c.drawRRect(rect,Paint()..shader=const LinearGradient(colors:[Colors.white,Color(0xFFE3DAC6)]).createShader(rect.outerRect));
    c.drawRRect(rect,Paint()..style=PaintingStyle.stroke..strokeWidth=1..color=const Color(0xFF9C8F74));
    const pips=<int,List<Offset>>{1:[Offset(0,0)],2:[Offset(-1,-1),Offset(1,1)],3:[Offset(-1,-1),Offset(0,0),Offset(1,1)],
      4:[Offset(-1,-1),Offset(1,-1),Offset(-1,1),Offset(1,1)],5:[Offset(-1,-1),Offset(1,-1),Offset(0,0),Offset(-1,1),Offset(1,1)],
      6:[Offset(-1,-1),Offset(1,-1),Offset(-1,0),Offset(1,0),Offset(-1,1),Offset(1,1)]};
    for (final p in pips[v.clamp(1,6)]!) {
      c.drawCircle(o+Offset(p.dx*s*.27,p.dy*s*.27),s*.075,Paint()..color=const Color(0xFF1A1A1A));
    }
  }

  static void _crown(Canvas c,Offset o,double s){
    final col=const Color(0xFFE2B253).withValues(alpha:.28);final star=Path();
    for(var i=0;i<32;i++){final a=math.pi*i/16-math.pi/2;final r=i.isEven?s:s*.86;final p=o+Offset(math.cos(a)*r,math.sin(a)*r);if(i==0){star.moveTo(p.dx,p.dy);}else{star.lineTo(p.dx,p.dy);}}
    star.close();c.drawPath(star,Paint()..color=const Color(0xFF3A2010).withValues(alpha:.45));
    c.drawPath(star,Paint()..style=PaintingStyle.stroke..strokeWidth=1.2..color=col);
    final u=s*.42;final crown=Path()..moveTo(o.dx-u,o.dy+u*.45)..lineTo(o.dx-u,o.dy-u*.35)..lineTo(o.dx-u*.5,o.dy+u*.05)
      ..lineTo(o.dx,o.dy-u*.75)..lineTo(o.dx+u*.5,o.dy+u*.05)..lineTo(o.dx+u,o.dy-u*.35)..lineTo(o.dx+u,o.dy+u*.45)..close();
    c.drawPath(crown,Paint()..color=col);c.drawRect(Rect.fromLTRB(o.dx-u,o.dy+u*.6,o.dx+u,o.dy+u*.8),Paint()..color=col);
  }

  @override bool shouldRepaint(covariant _RoyalBoardPainter old){
    if(old.selected!=selected||old.points.length!=points.length||old.dice.length!=dice.length||old.targets.length!=targets.length||old.themeColors.length!=themeColors.length)return true;
    for(var i=0;i<themeColors.length;i++){if(old.themeColors[i]!=themeColors[i])return true;}
    for(var i=0;i<points.length;i++){if(old.points[i]!=points[i])return true;}
    for(var i=0;i<dice.length;i++){if(old.dice[i]!=dice[i])return true;}
    return !old.targets.containsAll(targets)||!targets.containsAll(old.targets);
  }
}
