String unoCardLabel(Object? face, {required bool persian}) {
  return switch (face?.toString()) {
    'skip' => persian ? 'رد' : 'SKIP',
    'reverse' => persian ? 'معکوس' : 'REV',
    'draw2' => persian ? '+۲' : '+2',
    'wild' => persian ? 'رنگ' : 'WILD',
    'wild4' => persian ? '+۴' : '+4',
    null => '',
    _ => face.toString().toUpperCase(),
  };
}
