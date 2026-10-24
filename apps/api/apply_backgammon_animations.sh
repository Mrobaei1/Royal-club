#!/usr/bin/env bash
set -euo pipefail
ROOT="/workspaces/Royal-club"
TARGET="$ROOT/apps/mobile/lib/engine_backgammon_screen.dart"
if [[ ! -f "$TARGET" ]]; then
  echo "ERROR: File not found: $TARGET"
  exit 1
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.backup-animations-${STAMP}"
cp "$TARGET" "$BACKUP"
echo "Backup: $BACKUP"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
original = s

old_stack = '''    return Expanded(
      child: Align(
        alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: top ? chips : chips.reversed.toList(),
        ),
      ),
    );'''
new_stack = '''    return Expanded(
      child: AnimatedAlign(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        alignment: top ? Alignment.topCenter : Alignment.bottomCenter,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutBack,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: ScaleTransition(scale: animation, child: child),
          ),
          child: Column(
            key: ValueKey('$player-$count-$top'),
            mainAxisSize: MainAxisSize.min,
            children: top ? chips : chips.reversed.toList(),
          ),
        ),
      ),
    );'''
if s.count(old_stack) != 1:
    raise SystemExit(f'ERROR: checker-stack anchor expected once, found {s.count(old_stack)}. No file changes made.')
s = s.replace(old_stack, new_stack, 1)

old_die_start = '''      children: _engine.dice
          .map((die) => Container(
                width: 30,'''
new_die_start = '''      children: _engine.dice
          .map((die) => AnimatedSwitcher(
                duration: const Duration(milliseconds: 260),
                switchInCurve: Curves.easeOutBack,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) => ScaleTransition(
                  scale: animation,
                  child: FadeTransition(opacity: animation, child: child),
                ),
                child: Container(
                key: ValueKey('${_engine.currentPlayer}-${_engine.dice.join('-')}-$die'),
                width: 30,'''
if s.count(old_die_start) != 1:
    raise SystemExit(f'ERROR: dice-start anchor expected once, found {s.count(old_die_start)}. No file changes made.')
s = s.replace(old_die_start, new_die_start, 1)
old_die_end = '''                ),
              ))
          .toList(),
    );
  }

  Widget _barPanel'''
new_die_end = '''                ),
              ),
            ))
          .toList(),
    );
  }

  Widget _barPanel'''
if s.count(old_die_end) != 1:
    raise SystemExit(f'ERROR: dice-end anchor expected once, found {s.count(old_die_end)}. No file changes made.')
s = s.replace(old_die_end, new_die_end, 1)
if s == original:
    raise SystemExit('ERROR: No changes produced.')
p.write_text(s)
print('Added checker-stack and dice transition animations.')
PY
cd "$ROOT/apps/mobile"
dart format lib/engine_backgammon_screen.dart
set +e
flutter analyze
ANALYZE_STATUS=$?
flutter test
TEST_STATUS=$?
set -e
echo "flutter analyze exit: $ANALYZE_STATUS"
echo "flutter test exit: $TEST_STATUS"
if [[ $TEST_STATUS -ne 0 ]]; then
  echo "Tests failed. Backup is available at: $BACKUP"
  exit "$TEST_STATUS"
fi
echo "Animation patch applied and tests passed. Backup: $BACKUP"
