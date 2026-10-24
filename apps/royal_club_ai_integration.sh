#!/usr/bin/env bash
set -euo pipefail
ROOT="/workspaces/Royal-club"
FILE="$ROOT/apps/mobile/lib/engine_backgammon_screen.dart"
AI="$ROOT/apps/mobile/lib/backgammon_ai.dart"
[[ -f "$FILE" && -f "$AI" ]] || { echo "فایل‌های پروژه پیدا نشدند: $ROOT/apps/mobile/lib/"; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$FILE.backup-ai-$STAMP"
cp "$FILE" "$BACKUP"
echo "نسخه پشتیبان ساخته شد: $BACKUP"
python3 - "$FILE" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1]); s=path.read_text()
def rep(old,new,label):
 global s
 n=s.count(old)
 if n!=1: raise RuntimeError(f"توقف امن: {label}: انتظار یک محل، اما {n} مورد پیدا شد.")
 s=s.replace(old,new,1)
rep("import 'backgammon_engine.dart';","import 'backgammon_engine.dart';\nimport 'backgammon_ai.dart';","import")
rep("  final BackgammonEngine _engine = BackgammonEngine();","  final BackgammonEngine _engine = BackgammonEngine();\n  final BackgammonAI _ai = BackgammonAI();\n  bool _vsComputer = true;\n  BackgammonDifficulty _difficulty = BackgammonDifficulty.medium;\n  bool _computerThinking = false;","fields")
rep("  void _roll() {\n    setState(() {","  void _roll() {\n    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) return;\n    setState(() {","roll guard")
rep("    });\n  }\n\n  void _reset() {","    });\n    _scheduleComputerTurn();\n  }\n\n  void _reset() {","roll scheduler")
rep("      _engine.reset();\n      _selectedPoint = null;","      _engine.reset();\n      _computerThinking = false;\n      _selectedPoint = null;","reset")
rep("  void _tapPoint(int point) {\n    if (_engine.finished || _engine.dice.isEmpty) return;","  void _tapPoint(int point) {\n    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) return;\n    if (_engine.finished || _engine.dice.isEmpty) return;","point guard")
rep("  void _tapBar() {\n    if (_engine.finished || _engine.dice.isEmpty) return;","  void _tapBar() {\n    if (_computerThinking || (_vsComputer && _engine.currentPlayer == -1)) return;\n    if (_engine.finished || _engine.dice.isEmpty) return;","bar guard")
rep("""    } else {
      _message = 'حرکت انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
    }
  }

  @override""","""    } else {
      _message = 'حرکت انجام شد؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
    }
    _scheduleComputerTurn();
  }

  void _scheduleComputerTurn() {
    if (!_vsComputer || _engine.finished || _engine.currentPlayer != -1 || _computerThinking) return;
    _computerThinking = true;
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() {
        if (!_vsComputer || _engine.finished || _engine.currentPlayer != -1) {
          _computerThinking = false;
          return;
        }
        if (_engine.dice.isEmpty) {
          final rolled = _engine.rollDice();
          if (rolled.isEmpty) {
            _message = 'نوبت کامپیوتر بدون حرکت تمام شد.';
            _computerThinking = false;
            return;
          }
        }
        var safety = 0;
        while (!_engine.finished && _engine.currentPlayer == -1 &&
            _engine.dice.isNotEmpty && safety++ < 4) {
          final move = _ai.chooseMove(_engine, difficulty: _difficulty);
          if (move == null || !_engine.playMove(move)) break;
        }
        _computerThinking = false;
        if (_engine.finished) {
          _message = 'کامپیوتر برنده شد.';
        } else if (_engine.currentPlayer == 1) {
          _message = 'نوبت شماست؛ تاس بریزید.';
        } else {
          _message = 'نوبت کامپیوتر است؛ تاس باقی‌مانده: ${_engine.dice.join('، ')}';
        }
      });
      if (_vsComputer && !_engine.finished && _engine.currentPlayer == -1 &&
          _engine.dice.isNotEmpty) {
        _scheduleComputerTurn();
      }
    });
  }

  void _changeMode(bool vsComputer) {
    setState(() {
      _vsComputer = vsComputer;
      _engine.reset();
      _computerThinking = false;
      _selectedPoint = null;
      _selectedBar = false;
      _message = vsComputer
          ? 'بازی با هوش مصنوعی؛ تاس بریزید.'
          : 'بازی دونفره محلی؛ تاس بریزید.';
    });
  }

  @override""","AI turn")
rep("                  _statusPanel(),\n                  const SizedBox(height: 12),","                  _modeControls(),\n                  const SizedBox(height: 10),\n                  _statusPanel(),\n                  const SizedBox(height: 12),","portrait UI")
rep("                Expanded(flex: 3, child: _statusPanel(compact: true)),","                _modeControls(compact: true),\n                const SizedBox(height: 6),\n                Expanded(flex: 3, child: _statusPanel(compact: true)),","landscape UI")
rep("""                      onPressed: _engine.dice.isEmpty && !_engine.finished
                          ? _roll
                          : null,""","""                      onPressed: _engine.dice.isEmpty &&
                              !_engine.finished &&
                              !_computerThinking &&
                              !(_vsComputer && _engine.currentPlayer == -1)
                          ? _roll
                          : null,""","dice button")
widget=r"""
  Widget _modeControls({bool compact = false}) => Container(
        padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 10, vertical: compact ? 4 : 8),
        decoration: BoxDecoration(
          color: const Color(0xFF1A2540),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _boardGold.withValues(alpha: .4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(alignment: WrapAlignment.center, spacing: 6, children: [
              ChoiceChip(
                label: Text(compact ? 'با هوش مصنوعی' : 'بازی با هوش مصنوعی', style: TextStyle(fontSize: compact ? 10 : 12)),
                selected: _vsComputer,
                onSelected: _computerThinking ? null : (_) => _changeMode(true),
                selectedColor: _boardGold,
                labelStyle: TextStyle(color: _vsComputer ? _boardNavy : Colors.white),
                visualDensity: VisualDensity.compact,
              ),
              ChoiceChip(
                label: Text(compact ? 'دونفره' : 'بازی دونفره', style: TextStyle(fontSize: compact ? 10 : 12)),
                selected: !_vsComputer,
                onSelected: _computerThinking ? null : (_) => _changeMode(false),
                selectedColor: _boardGold,
                labelStyle: TextStyle(color: !_vsComputer ? _boardNavy : Colors.white),
                visualDensity: VisualDensity.compact,
              ),
            ]),
            if (_vsComputer)
              Row(children: [
                Text('سختی:', style: TextStyle(color: Colors.white70, fontSize: compact ? 10 : 12)),
                const SizedBox(width: 8),
                Expanded(child: DropdownButtonHideUnderline(
                  child: DropdownButton<BackgammonDifficulty>(
                    value: _difficulty,
                    isExpanded: true,
                    dropdownColor: _boardNavy,
                    style: TextStyle(color: _boardGold, fontSize: compact ? 11 : 13),
                    items: const [
                      DropdownMenuItem(value: BackgammonDifficulty.easy, child: Text('آسان')),
                      DropdownMenuItem(value: BackgammonDifficulty.medium, child: Text('متوسط')),
                      DropdownMenuItem(value: BackgammonDifficulty.hard, child: Text('سخت')),
                    ],
                    onChanged: _computerThinking ? null : (value) {
                      if (value != null) setState(() => _difficulty = value);
                    },
                  ),
                )),
              ]),
          ],
        ),
      );

"""
rep("  Widget _landscapeLayout(Set<int> legalTargets, double availableHeight) {",widget+"  Widget _landscapeLayout(Set<int> legalTargets, double availableHeight) {","mode controls")
path.write_text(s)
print("پچ با موفقیت اعمال شد.")
PY
cd "$ROOT/apps/mobile"
dart format lib/engine_backgammon_screen.dart
flutter analyze
flutter test
echo
echo "پایان بررسی‌ها. نسخه پشتیبان: $BACKUP"
