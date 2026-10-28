import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';

/// Shared visual board for Royal Club online and offline backgammon.
class RoyalBackgammonBoard extends StatelessWidget {
  const RoyalBackgammonBoard({super.key, required this.points, required this.onPointTap,
    this.selectedPoint, this.legalTargets = const <int>{}, this.barWhite = 0,
    this.barBlack = 0, this.offWhite = 0, this.offBlack = 0, this.dice = const <int>[],
    this.onBearOff, this.themeColors = const [Color(0xFF6D4026), Color(0xFF76502E), Color(0xFF3B2418)]});
  final List<num> points;
  final ValueChanged<int> onPointTap;
  final int? selectedPoint;
  final Set<int> legalTargets;
  final int barWhite, barBlack, offWhite, offBlack;
  final List<int> dice;
  final VoidCallback? onBearOff;
  final List<Color> themeColors;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, c) {
    final panel = (c.maxWidth * .075).clamp(28.0, 58.0).toDouble();
    return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(width: panel, child: Column(children: [
        Expanded(child: _CountPanel(label: appText(context, 'بار', 'Bar'), count: barBlack, white: false, themeColors: themeColors)),
        Expanded(child: _CountPanel(label: appText(context, 'خارج از بازی', 'Off'), count: offBlack, white: false, onTap: onBearOff, themeColors: themeColors)),
      ])),
      const SizedBox(width: 5),
      Expanded(child: LayoutBuilder(builder: (context, boardC) {
        final size = Size(boardC.maxWidth, boardC.maxHeight);
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
        ]);
      })),
      const SizedBox(width: 5),
      SizedBox(width: panel, child: Column(children: [
        Expanded(child: _CountPanel(label: appText(context, 'بار', 'Bar'), count: barWhite, white: true, themeColors: themeColors)),
        Expanded(child: _CountPanel(label: appText(context, 'خارج از بازی', 'Off'), count: offWhite, white: true, onTap: onBearOff, themeColors: themeColors)),
      ])),
    ]);
  });
}

class _CountPanel extends StatelessWidget {
  const _CountPanel({required this.label, required this.count, required this.white, this.onTap, required this.themeColors});
  final String label; final int count; final bool white; final VoidCallback? onTap; final List<Color> themeColors;
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(width: double.infinity, margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(7),
        border: Border.all(color: const Color(0xFFE2B253), width: 1.2),
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
          colors: [themeColors[1], themeColors[2]])),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        FittedBox(child: Text(label, style: const TextStyle(color: Color(0xFFE2B253), fontSize: 11, fontWeight: FontWeight.w700))),
        const SizedBox(height: 4),
        CustomPaint(size: const Size(22, 22), painter: _CheckerPainter(white)),
        const SizedBox(height: 3),
        FittedBox(child: Text(count.toString(), style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold))),
      ])));
}

class _CheckerPainter extends CustomPainter {
  const _CheckerPainter(this.white); final bool white;
  @override void paint(Canvas c, Size s) => _checker(c, s.center(Offset.zero), s.width * .45, white);
  @override bool shouldRepaint(covariant _CheckerPainter old) => old.white != white;
}

void _checker(Canvas c, Offset o, double r, bool white) {
  c.drawCircle(o + Offset(0, r*.12), r, Paint()..color = Colors.black.withValues(alpha: .4)
    ..maskFilter = MaskFilter.blur(BlurStyle.normal, r*.16));
  c.drawCircle(o, r, Paint()..shader = RadialGradient(center: const Alignment(-.35,-.45), radius: 1.1,
    colors: white ? const [Color(0xFFFFF6E2),Color(0xFFE6D3B0),Color(0xFFC9B088)]
      : const [Color(0xFF5A5A5A),Color(0xFF1C1C1C),Color(0xFF050505)])
    .createShader(Rect.fromCircle(center:o,radius:r)));
  c.drawCircle(o,r,Paint()..style=PaintingStyle.stroke..strokeWidth=r*.07
    ..color=white?const Color(0xFF9C8660):Colors.black);
  c.drawCircle(o,r*.68,Paint()..style=PaintingStyle.stroke..strokeWidth=r*.06
    ..color=white?const Color(0x33806A45):const Color(0x33FFFFFF));
}

class _RoyalBoardPainter extends CustomPainter {
  _RoyalBoardPainter({required this.points, required this.selected, required this.targets, required this.dice, required this.themeColors});
  final List<num> points; final int? selected; final Set<int> targets; final List<int> dice; final List<Color> themeColors;
  static const gold = Color(0xFFE2B253);

  static Rect pointRect(int i, Size s) {
    final m=s.width*.025, bw=s.width*.032, hw=(s.width-2*m-bw)/2, pw=hw/6;
    final top=i<12;
    final col=top?(i<6?11-i:5-(i-6)):(i<18?i-12:i-18);
    final left=col<6?m+col*pw:m+hw+bw+(col-6)*pw;
    return Rect.fromLTWH(left, top?0:s.height/2, pw, s.height/2);
  }


  @override
  void paint(Canvas c, Size s) {
    final w=s.width,h=s.height,m=w*.025,bw=w*.032,hw=(w-2*m-bw)/2,pw=hw/6;
    final y0=m*.35,lh=h*.055,top=y0+lh+h*.006,bottom=h-top,triH=(bottom-top)*.43,r=pw*.46;
    double colX(int col)=>col<6?m+col*pw:m+hw+bw+(col-6)*pw;
    final bounds=Offset.zero&s;
    final frame=RRect.fromRectAndRadius(bounds,Radius.circular(w*.022));
    c.drawRRect(frame,Paint()..shader=const LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,
      colors:themeColors).createShader(bounds));
    c.save(); c.clipRRect(frame); final random=math.Random(7);
    for(var j=0;j<90;j++){final x=random.nextDouble()*w;c.drawLine(Offset(x,0),Offset(x+(random.nextDouble()-.5)*12,h),
      Paint()..strokeWidth=.7..color=(random.nextBool()?Colors.black:Colors.white).withValues(alpha:.055));}
    c.restore();
    c.drawRRect(frame,Paint()..style=PaintingStyle.stroke..strokeWidth=3..color=const Color(0xFF241208));
    for (var half=0;half<2;half++) {final left=half==0?m:m+hw+bw;final rect=RRect.fromRectAndRadius(
      Rect.fromLTRB(left,y0,left+hw,h-y0),Radius.circular(w*.006));
      c.drawRRect(rect,Paint()..shader=const LinearGradient(colors:[Color(0xFF7B4B2A),Color(0xFF5E3519)]).createShader(rect.outerRect));
      c.drawRRect(rect,Paint()..style=PaintingStyle.stroke..strokeWidth=2..color=const Color(0xFF2B170A));}
    // Point order matches BackgammonEngine: top 11..0, bottom 12..23.
    for (var i=0;i<24;i++) {
      final isTop=i<12; final col=isTop?(i<6?11-i:5-(i-6)):(i<18?i-12:i-18);
      final x=colX(col),cx=x+pw/2,base=isTop?top:bottom,tip=isTop?top+triH:bottom-triH;
      final dark=(isTop?col:col+1).isEven;
      final path=Path()..moveTo(x+pw*.04,base)..lineTo(x+pw*.96,base)..lineTo(cx,tip)..close();
      c.drawPath(path,Paint()..shader=LinearGradient(begin:isTop?Alignment.topCenter:Alignment.bottomCenter,
        end:isTop?Alignment.bottomCenter:Alignment.topCenter,
        colors:dark?const [Color(0xFF58341C),Color(0xFF3B2112)]:const [Color(0xFFEACB9C),Color(0xFFC9A06A)])
        .createShader(Rect.fromLTRB(x,math.min(base,tip),x+pw,math.max(base,tip))));
      if(selected==i||targets.contains(i)){final colr=selected==i?gold:Colors.greenAccent;
        c.drawPath(path,Paint()..color=colr.withValues(alpha:.34));
        c.drawPath(path,Paint()..style=PaintingStyle.stroke..strokeWidth=1.8..color=colr);}
      final count=i<points.length?points[i].toInt():0;
      if(count!=0){final n=count.abs().clamp(1,15);final gap=n*2*r<=triH?2*r:(triH-2*r)/math.max(1,n-1);
        for(var k=0;k<math.min(n,6);k++){final cy=isTop?top+r+k*gap:bottom-r-k*gap;_checker(c,Offset(cx,cy),r,count>0);}
        if(count.abs()>5)_txt(c,count.abs().toString(),Offset(cx,isTop?top+r:bottom-r),r*.8,count>0?const Color(0xFF302315):Colors.white);}
    }
    final bar=Rect.fromLTWH(m+hw,0,bw,h);
    c.drawRect(bar,Paint()..shader=const LinearGradient(colors:[Color(0xFF2E190B),Color(0xFF5A3419),Color(0xFF2E190B)]).createShader(bar));
    for(final yy in [h*.26,h*.67]) c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(w/2-bw*.12,yy,bw*.24,h*.07),const Radius.circular(2)),Paint()..color=const Color(0xFF8E7A55));
    for(var half=0;half<2;half++){final cx=(half==0?m:m+hw+bw)+hw/2;_crown(c,Offset(cx,h/2),w*.065);}
    for(var half=0;half<2;half++){final left=half==0?m:m+hw+bw;for(final isTop in [true,false]){
      final yy=isTop?y0:h-y0-lh;c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(left,yy,hw,lh),Radius.circular(lh*.35)),
        Paint()..color=const Color(0xFF0B1630).withValues(alpha:.88));}}
    for(var i=0;i<24;i++){final isTop=i<12;final col=isTop?(i<6?11-i:5-(i-6)):(i<18?i-12:i-18);
      _txt(c,(i+1).toString(),Offset(colX(col)+pw/2,isTop?y0+lh/2:h-y0-lh/2),lh*.55,Colors.white);}
    final ds=w*.047;
    for(var j=0;j<math.min(2,dice.length);j++){final dx=dice.length==1?0:(j==0?-ds*.62:ds*.62);_die(c,Offset(w/2+dx,h/2),ds,dice[j]);}
  }

  static void _txt(Canvas c,String t,Offset o,double size,Color color){final p=TextPainter(text:TextSpan(text:t,style:TextStyle(color:color,fontSize:size,fontWeight:FontWeight.w700)),textDirection:TextDirection.ltr)..layout();p.paint(c,o-Offset(p.width/2,p.height/2));}
  static void _die(Canvas c,Offset o,double s,int v){
    final rect=RRect.fromRectAndRadius(Rect.fromCenter(center:o,width:s,height:s),Radius.circular(s*.2));
    c.drawRRect(rect.shift(Offset(0,s*.06)),Paint()..color=Colors.black.withValues(alpha:.4)..maskFilter=MaskFilter.blur(BlurStyle.normal,s*.08));
    c.drawRRect(rect,Paint()..shader=const LinearGradient(colors:[Colors.white,Color(0xFFE3DAC6)]).createShader(rect.outerRect));
    c.drawRRect(rect,Paint()..style=PaintingStyle.stroke..strokeWidth=1..color=const Color(0xFF9C8F74));
    const pips=<int,List<Offset>>{1:[Offset(0,0)],2:[Offset(-1,-1),Offset(1,1)],3:[Offset(-1,-1),Offset(0,0),Offset(1,1)],
      4:[Offset(-1,-1),Offset(1,-1),Offset(-1,1),Offset(1,1)],5:[Offset(-1,-1),Offset(1,-1),Offset(0,0),Offset(-1,1),Offset(1,1)],
      6:[Offset(-1,-1),Offset(1,-1),Offset(-1,0),Offset(1,0),Offset(-1,1),Offset(1,1)]};
    for(final p in pips[v.clamp(1,6)]!)c.drawCircle(o+Offset(p.dx*s*.27,p.dy*s*.27),s*.075,Paint()..color=const Color(0xFF1A1A1A));
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
