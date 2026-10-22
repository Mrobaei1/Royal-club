import 'package:flutter/material.dart';
import 'backgammon_engine.dart';
import 'engine_backgammon_screen.dart';

void main() => runApp(const RoyalClubApp());

const navy = Color(0xFF10182B);
const panel = Color(0xFF17243A);
const gold = Color(0xFFD8B45A);

class RoyalClubApp extends StatelessWidget {
  const RoyalClubApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Royal Club',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: navy,
        colorScheme: ColorScheme.fromSeed(
          seedColor: gold,
          brightness: Brightness.dark,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: panel,
          foregroundColor: gold,
          centerTitle: true,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'ROYAL CLUB',
          style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 2),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              const Icon(Icons.workspace_premium, size: 64, color: gold),
              const SizedBox(height: 12),
              const Text(
                'به باشگاه بازی خوش آمدید',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 23,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'یک بازی انتخاب کنید و وارد رقابت شوید',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 26),
              GameTile(
                title: 'تخته‌نرد',
                subtitle: 'بازی کلاسیک و رقابتی',
                icon: Icons.casino,
                featured: true,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const EngineBackgammonScreen(),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const GameTile(
                title: 'شطرنج',
                subtitle: 'به‌زودی',
                icon: Icons.grid_on,
              ),
              const SizedBox(height: 12),
              const GameTile(
                title: 'بازی‌های کارتی',
                subtitle: 'به‌زودی',
                icon: Icons.style,
              ),
              const SizedBox(height: 24),
              const Text(
                'ROYAL CLUB  •  بازی جوانمردانه، رقابت هیجان‌انگیز',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white38, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GameTile extends StatelessWidget {
  const GameTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
    this.featured = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: featured ? const Color(0xFF25334B) : panel,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: featured ? gold : Colors.white12,
              width: featured ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: featured ? gold.withValues(alpha: 0.14) : navy,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: gold, size: 30),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(color: Colors.white60),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: gold),
            ],
          ),
        ),
      ),
    );
  }
}

class BackgammonScreen extends StatefulWidget {
  const BackgammonScreen({super.key});

  @override
  State<BackgammonScreen> createState() => _BackgammonScreenState();
}

class _BackgammonScreenState extends State<BackgammonScreen> {
  final BackgammonEngine _game = BackgammonEngine();
  int? _selected;
  String _message = 'برای شروع، تاس بریزید';

  void _rollDice() {
    if (_game.finished || _game.dice.isNotEmpty) return;
    setState(() {
      _game.rollDice();
      _selected = null;
      _message = _game.dice.isEmpty
          ? 'تاسی برای بازی وجود ندارد'
          : 'مهره مبدأ و سپس خانه مقصد را انتخاب کنید';
    });
  }

  void _tapPoint(int point) {
    if (_game.finished || _game.dice.isEmpty) return;

    if (_selected == null) {
      if (_game.points[point] * _game.currentPlayer > 0) {
        setState(() {
          _selected = point;
          _message = 'حالا خانه مقصد را انتخاب کنید';
        });
      } else {
        setState(() => _message = 'ابتدا یکی از مهره‌های خود را انتخاب کنید');
      }
      return;
    }

    BackgammonMove? selectedMove;
    for (final move in _game.legalMoves()) {
      if (!move.fromBar && move.from == _selected && move.to == point) {
        selectedMove = move;
        break;
      }
    }

    setState(() {
      if (selectedMove != null && _game.playMove(selectedMove)) {
        _selected = null;
        _message = _game.finished
            ? 'بازی تمام شد؛ برنده ${_game.winner == 1 ? 'طلایی' : 'سفید'} است'
            : _game.dice.isEmpty
                ? 'نوبت بازیکن بعدی'
                : 'حرکت انجام شد؛ حرکت بعدی را انتخاب کنید';
      } else if (_game.points[point] * _game.currentPlayer > 0) {
        _selected = point;
        _message = 'مهره انتخاب شد؛ خانه مقصد را لمس کنید';
      } else {
        _selected = null;
        _message = 'این حرکت مجاز نیست';
      }
    });
  }

  void _specialMove({required bool bearOff}) {
    if (_game.finished || _game.dice.isEmpty) return;
    final moves = _game.legalMoves();
    BackgammonMove? chosen;
    for (final move in moves) {
      if (bearOff ? move.to == -1 : move.fromBar) {
        chosen = move;
        break;
      }
    }

    if (chosen == null) {
      setState(() {
        _message = bearOff
            ? 'در حال حاضر جمع‌کردن مهره مجاز نیست'
            : 'حرکت ورود از بار مجاز نیست';
      });
      return;
    }

    setState(() {
      _game.playMove(chosen!);
      _selected = null;
      _message = _game.finished
          ? 'بازی تمام شد'
          : _game.dice.isEmpty
              ? 'نوبت بازیکن بعدی'
              : 'حرکت انجام شد';
    });
  }

  @override
  Widget build(BuildContext context) {
    final top = List<int>.generate(12, (i) => 23 - i);
    final bottom = List<int>.generate(12, (i) => i);

    return Scaffold(
      appBar: AppBar(
        title: const Text('تخته‌نرد'),
        actions: [
          IconButton(
            tooltip: 'شروع مجدد',
            onPressed: () => setState(() {
              _game.reset();
              _selected = null;
              _message = 'برای شروع، تاس بریزید';
            }),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Text(
              _game.finished
                  ? 'بازی پایان یافت'
                  : 'نوبت ${_game.currentPlayer == 1 ? 'بازیکن طلایی' : 'بازیکن سفید'}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: gold,
                fontSize: 19,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: const Color(0xFF805333),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: gold, width: 2),
              ),
              child: Column(
                children: [
                  Row(
                      children:
                          top.map((i) => _buildPoint(i, top: true)).toList()),
                  Container(
                    height: 7,
                    margin: const EdgeInsets.symmetric(vertical: 5),
                    color: gold,
                  ),
                  Row(
                      children: bottom
                          .map((i) => _buildPoint(i, top: false))
                          .toList()),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: panel,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white10),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _statusCount('مهره‌های بار', _game.bar[1] + _game.bar[-1]),
                  Container(width: 1, height: 28, color: Colors.white12),
                  _statusCount('جمع‌شده طلایی', _game.borneOff[1]),
                  Container(width: 1, height: 28, color: Colors.white12),
                  _statusCount('جمع‌شده سفید', _game.borneOff[-1]),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              _game.dice.isEmpty
                  ? 'تاس: —'
                  : 'تاس: ${_game.dice.join('  •  ')}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 23,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed:
                  !_game.finished && _game.dice.isEmpty ? _rollDice : null,
              icon: const Icon(Icons.casino),
              label: const Text('ریختن تاس'),
              style: FilledButton.styleFrom(
                backgroundColor: gold,
                foregroundColor: navy,
                padding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: !_game.finished && _game.dice.isNotEmpty
                        ? () => _specialMove(bearOff: false)
                        : null,
                    child: const Text('ورود از بار'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: !_game.finished && _game.dice.isNotEmpty
                        ? () => _specialMove(bearOff: true)
                        : null,
                    child: const Text('جمع‌کردن مهره'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'برای حرکت عادی، خانه مهره خود و سپس خانه مقصد را لمس کنید.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusCount(String label, int count) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$count',
          style: const TextStyle(
            color: gold,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(color: Colors.white60, fontSize: 10),
        ),
      ],
    );
  }

  Widget _buildPoint(int index, {required bool top}) {
    final count = _game.points[index];
    final isSelected = _selected == index;
    final checkerColor = count > 0 ? gold : const Color(0xFFF2F0E8);
    final visibleCheckers = count.abs().clamp(0, 5);

    return Expanded(
      child: Semantics(
        button: true,
        label: 'خانه ${index + 1}، ${count.abs()} مهره',
        child: InkWell(
          onTap: () => _tapPoint(index),
          borderRadius: BorderRadius.circular(5),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            height: 132,
            margin: const EdgeInsets.symmetric(horizontal: 1),
            padding: const EdgeInsets.symmetric(vertical: 3),
            decoration: BoxDecoration(
              color: isSelected
                  ? const Color(0xFF526B91)
                  : index.isEven
                      ? const Color(0xFF70482F)
                      : const Color(0xFF38271F),
              border: Border.all(
                color: isSelected ? Colors.lightBlueAccent : Colors.black26,
                width: isSelected ? 2 : 0.6,
              ),
              borderRadius: BorderRadius.circular(5),
            ),
            child: Column(
              mainAxisAlignment:
                  top ? MainAxisAlignment.start : MainAxisAlignment.end,
              children: [
                if (top)
                  Text(
                    '${index + 1}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                if (count != 0)
                  Expanded(
                    child: Align(
                      alignment:
                          top ? Alignment.topCenter : Alignment.bottomCenter,
                      child: Column(
                        mainAxisAlignment: top
                            ? MainAxisAlignment.start
                            : MainAxisAlignment.end,
                        children: [
                          for (var i = 0; i < visibleCheckers; i++)
                            Container(
                              width: 21,
                              height: 19,
                              margin: const EdgeInsets.symmetric(vertical: 0.5),
                              decoration: BoxDecoration(
                                color: checkerColor,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: count > 0
                                      ? const Color(0xFF9D792E)
                                      : const Color(0xFFB7B4AC),
                                  width: 1.1,
                                ),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Colors.black26,
                                    blurRadius: 1,
                                    offset: Offset(0, 1),
                                  ),
                                ],
                              ),
                            ),
                          if (count.abs() > 5)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: checkerColor,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${count.abs()}',
                                style: const TextStyle(
                                  color: navy,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (!top)
                  Text(
                    '${index + 1}',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
