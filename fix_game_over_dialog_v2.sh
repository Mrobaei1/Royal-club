#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" || ! -f "$ROOT/apps/mobile/lib/engine_backgammon_screen.dart" ]]; then
  echo 'ERROR: Run from /workspaces/Royal-club.' >&2; exit 1
fi
cd "$ROOT"
FILE='apps/mobile/lib/engine_backgammon_screen.dart'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$FILE.backup-game-over-fix-$STAMP"
cp "$FILE" "$BACKUP"
python3 - "$FILE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
if 'void _showGameOverDialog()' in s:
    print('Dialog method already exists; no source changes needed.')
    raise SystemExit(0)
anchor='  @override\n  Widget build(BuildContext context) {\n'
if s.count(anchor)!=1:
    raise SystemExit('ERROR: Could not safely locate build(); source left unchanged. Backup was created.')
method='''  void _showGameOverDialog() {
    if (_gameOverDialogShown || !mounted || !_engine.finished) return;
    _gameOverDialogShown = true;
    final navigator = Navigator.of(context);
    final winner = _playerName(_engine.winner!);
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Directionality(
        textDirection: TextDirection.rtl,
        child: AlertDialog(
          backgroundColor: const Color(0xFF1A2540),
          icon: const Icon(Icons.emoji_events, color: _boardGold, size: 42),
          title: const Text('پایان بازی', style: TextStyle(color: _boardGold, fontWeight: FontWeight.bold)),
          content: Text('تبریک! بازیکن $winner برنده شد 🎉', textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 17)),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _reset();
              },
              icon: const Icon(Icons.refresh),
              label: const Text('بازی مجدد'),
              style: FilledButton.styleFrom(backgroundColor: _boardGold, foregroundColor: _boardNavy),
            ),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                navigator.maybePop();
              },
              icon: const Icon(Icons.exit_to_app),
              label: const Text('خروج از بازی'),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: _boardGold)),
            ),
          ],
        ),
      ),
    );
  }

'''
s=s.replace(anchor,method+anchor,1)
p.write_text(s)
print('Added missing _showGameOverDialog() method.')
PY
echo "Backup: $BACKUP"
cd apps/mobile
dart format lib/engine_backgammon_screen.dart
flutter analyze
flutter test
