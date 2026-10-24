#!/usr/bin/env bash
set -euo pipefail
ROOT="/workspaces/Royal-club"
TARGET="$ROOT/apps/mobile/lib/engine_backgammon_screen.dart"
if [[ ! -f "$TARGET" ]]; then echo "ERROR: File not found: $TARGET"; exit 1; fi
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${TARGET}.backup-overflow-${STAMP}"
cp "$TARGET" "$BACKUP"
python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(); original=s
old='''              Expanded(
                  child: SizedBox(
                      height: rowHeight,
                      child: _pointRow(
                          List.generate(12, (i) => 11 - i), legalTargets,
                          top: true, compact: compact))),'''
new='''              Expanded(
                  child: _pointRow(
                      List.generate(12, (i) => 11 - i), legalTargets,
                      top: true, compact: compact)),'''
if s.count(old)!=1:
    raise SystemExit(f'ERROR: top-row anchor expected once, found {s.count(old)}. No changes made.')
s=s.replace(old,new,1)
old='''              Expanded(
                  child: SizedBox(
                      height: rowHeight,
                      child: _pointRow(
                          List.generate(12, (i) => i), legalTargets,
                          top: false, compact: compact))),'''
new='''              Expanded(
                  child: _pointRow(
                      List.generate(12, (i) => i), legalTargets,
                      top: false, compact: compact)),'''
if s.count(old)!=1:
    raise SystemExit(f'ERROR: bottom-row anchor expected once, found {s.count(old)}. No changes made.')
s=s.replace(old,new,1)
if s==original: raise SystemExit('ERROR: no changes produced')
p.write_text(s)
print('Removed fixed row heights; board rows now use available space.')
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
if [[ $TEST_STATUS -ne 0 ]]; then echo "Tests failed. Restore from: $BACKUP"; exit "$TEST_STATUS"; fi
echo "Overflow layout patch applied; tests passed. Backup: $BACKUP"
