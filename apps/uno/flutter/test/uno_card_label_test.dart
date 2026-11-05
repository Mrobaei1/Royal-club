import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club_uno/uno_card_label.dart';

void main() {
  test('special cards have compact Persian labels', () {
    expect(unoCardLabel('skip', persian: true), 'رد');
    expect(unoCardLabel('reverse', persian: true), 'معکوس');
    expect(unoCardLabel('draw2', persian: true), '+۲');
    expect(unoCardLabel('wild', persian: true), 'رنگ');
    expect(unoCardLabel('wild4', persian: true), '+۴');
    expect(unoCardLabel(7, persian: true), '7');
  });

  test('special cards have compact English labels', () {
    expect(unoCardLabel('skip', persian: false), 'SKIP');
    expect(unoCardLabel('reverse', persian: false), 'REV');
    expect(unoCardLabel('draw2', persian: false), '+2');
    expect(unoCardLabel('wild', persian: false), 'WILD');
    expect(unoCardLabel('wild4', persian: false), '+4');
    expect(unoCardLabel(7, persian: false), '7');
  });
}
