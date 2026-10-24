#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" || ! -f "$ROOT/apps/mobile/lib/engine_backgammon_screen.dart" ]]; then
  echo 'ERROR: Run this script from inside /workspaces/Royal-club.' >&2
  exit 1
fi
cd "$ROOT"
FILE='apps/mobile/lib/engine_backgammon_screen.dart'
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$FILE.backup-game-over-$STAMP"
cp "$FILE" "$BACKUP"
python3 - "$FILE" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
s = p.read_text()
original = s
# Add a one-shot guard near the status message.
field_anchor = "  String _message = 'برای شروع، تاس بریزید.';\n"
if '_gameOverDialogShown' not in s:
    if s.count(field_anchor) != 1:
        raise SystemExit('PATCH STOPPED: Could not safely locate the game status field; no source changes written.')
    s = s.replace(field_anchor, field_anchor + '  bool _gameOverDialogShown = false;\n', 1)
# Reset the dialog guard whenever a new game starts.
reset_anchor = '      _engine.reset();\n'
if s.count(reset_anchor) == 1 and '_gameOverDialogShown = false;' not in s[s.find(reset_anchor):s.find(reset_anchor)+150]:
    s = s.replace(reset_anchor, reset_anchor + '      _gameOverDialogShown = false;\n', 1)
# Keep the existing winner text and trigger the modal after the frame completes.
win_line = re.compile(r"^(\s*)_message\s*=\s*'تبریک! بازیکن \$\{_playerName\(_engine\.winner!\)\} برنده شد\.';\s*$", re.M)
if '_showGameOverDialog()' not in s:
    matches = list(win_line.finditer(s))
    if len(matches) != 1:
        raise SystemExit('PATCH STOPPED: Could not safely find the existing winner message. Backup created; source not changed.')
    m = matches[0]
    indent = m.group(1)
    replacement = m.group(0) + '\n' + indent + 'WidgetsBinding.instance.addPostFrameCallback((_) {\n' + indent + '  if (mounted) _showGameOverDialog();\n' + indent + '});'
    s = s[:m.start()] + replacement + s[m.end():]
# Add the dialog method before build().
method_anchor = '  @override\n  Widget build(BuildContext context) {\n'
method = '''  void _showGameOverDialog() {
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
if '_showGameOverDialog()' not in s:
    if s.count(method_anchor) != 1:
        raise SystemExit('PATCH STOPPED: Could not safely locate build(). Backup created; source not changed.')
    s = s.replace(method_anchor, method + method_anchor, 1)
if s == original:
    raise SystemExit('PATCH STOPPED: No changes were needed or matching anchors were absent.')
p.write_text(s)
print('Game-over dialog and actions added to', p)
PY
echo "Backup: $BACKUP"
cd apps/mobile
dart format lib/engine_backgammon_screen.dart
flutter analyze
flutter test
