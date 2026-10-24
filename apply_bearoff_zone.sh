#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" || ! -f "$ROOT/apps/mobile/lib/engine_backgammon_screen.dart" ]]; then
  echo 'ERROR: Run this script from anywhere inside the Royal-club repository.' >&2
  exit 1
fi
cd "$ROOT"
FILE='apps/mobile/lib/engine_backgammon_screen.dart'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$FILE.backup-bearoff-$STAMP"
cp "$FILE" "$BACKUP"
python3 - "$FILE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
method_anchor = '  void _tapBar() {\n'
method = '''  void _tapBearOff() {
    if (_engine.finished || _engine.dice.isEmpty) return;
    setState(() {
      if (_selectedPoint == null || _selectedBar) {
        _message = 'ابتدا مهره‌ای را که می‌خواهید خارج کنید انتخاب کنید.';
        return;
      }
      final candidates = _moves.where((m) =>
          !m.fromBar && m.from == _selectedPoint && m.to == -1).toList();
      if (candidates.isEmpty) {
        _message = 'با تاس فعلی، خارج کردن این مهره مجاز نیست.';
        return;
      }
      _play(candidates.first);
    });
  }

'''
if 'void _tapBearOff()' not in s:
    if s.count(method_anchor) != 1:
        raise SystemExit('PATCH STOPPED: Could not safely locate _tapBar(). No source changes made.')
    s = s.replace(method_anchor, method + method_anchor, 1)
row_anchor = '''                  Expanded(
                      child: Align(
                          alignment: Alignment.centerLeft,
                          child: _diceTray(compact: true))),
'''
zone = '''                  const SizedBox(width: 6),
                  InkWell(
                    onTap: _tapBearOff,
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      width: 54,
                      padding: const EdgeInsets.symmetric(vertical: 3, horizontal: 2),
                      decoration: BoxDecoration(
                        color: _selectedPoint != null
                            ? _boardGold.withValues(alpha: .22)
                            : Colors.white.withValues(alpha: .06),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _selectedPoint != null ? _boardGold : Colors.white24,
                        ),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.exit_to_app, color: _boardGold, size: 17),
                          const Text('خارج', style: TextStyle(
                            color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold,
                          )),
                          Text('${_engine.borneOff[_engine.currentPlayer == 1 ? 1 : 0]}/15',
                            style: const TextStyle(color: Colors.white70, fontSize: 9)),
                        ],
                      ),
                    ),
                  ),
'''
if 'onTap: _tapBearOff' not in s:
    if s.count(row_anchor) != 1:
        raise SystemExit('PATCH STOPPED: Could not safely locate the dice tray row. Backup exists; source not written.')
    s = s.replace(row_anchor, row_anchor + zone, 1)
p.write_text(s)
print('Bear-off zone patch applied to', p)
PY

echo "Backup: $BACKUP"
cd apps/mobile
dart format lib/engine_backgammon_screen.dart
flutter analyze
flutter test
