import 'package:flutter/material.dart';
import 'engine_backgammon_screen.dart';

void main() => runApp(const RoyalClubApp());

const Color navy = Color(0xFF10182B);
const Color panel = Color(0xFF17243A);
const Color gold = Color(0xFFD8B45A);

class RoyalClubApp extends StatelessWidget {
  const RoyalClubApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Royal Club',
        theme: ThemeData(
          useMaterial3: true,
          scaffoldBackgroundColor: navy,
          colorScheme: ColorScheme.fromSeed(
            seedColor: gold,
            brightness: Brightness.dark,
            surface: panel,
          ),
        ),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF17243A), Color(0xFF0B1020)],
            ),
          ),
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
              children: [
                Row(children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(15),
                      gradient: const LinearGradient(
                        colors: [gold, Color(0xFFB89543)],
                      ),
                    ),
                    child: const Icon(Icons.workspace_premium_rounded,
                        color: navy, size: 29),
                  ),
                  const SizedBox(width: 13),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ROYAL CLUB',
                            style: TextStyle(
                                color: gold,
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 2.2)),
                        SizedBox(height: 3),
                        Text('THE ART OF STRATEGY',
                            style: TextStyle(
                                color: Color(0xFFB9C2D3),
                                fontSize: 9,
                                letterSpacing: 2,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
                    decoration: BoxDecoration(
                      border: Border.all(color: gold.withValues(alpha: .4)),
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: const Row(children: [
                      Icon(Icons.circle, color: gold, size: 7),
                      SizedBox(width: 6),
                      Text('ONLINE',
                          style: TextStyle(
                              color: gold,
                              fontSize: 9,
                              letterSpacing: 1.1,
                              fontWeight: FontWeight.bold)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 27),
                Container(
                  padding: const EdgeInsets.all(23),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(27),
                    border: Border.all(color: gold.withValues(alpha: .55)),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF253650), Color(0xFF121C30)],
                    ),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withValues(alpha: .22),
                          blurRadius: 24,
                          offset: const Offset(0, 12))
                    ],
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('WELCOME TO THE CLUB',
                          style: TextStyle(
                              color: gold,
                              fontSize: 9,
                              letterSpacing: 1.4,
                              fontWeight: FontWeight.bold)),
                      SizedBox(height: 17),
                      Text('بازی، رقابت، افتخار',
                          textDirection: TextDirection.rtl,
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              height: 1.35,
                              fontWeight: FontWeight.w900)),
                      SizedBox(height: 8),
                      Text(
                          'به رویال کلاب خوش آمدید؛ جایی برای ذهن‌های استراتژیک.',
                          textDirection: TextDirection.rtl,
                          style: TextStyle(
                              color: Color(0xFFD1D8E4),
                              fontSize: 13,
                              height: 1.8)),
                      SizedBox(height: 20),
                      Row(children: [
                        Icon(Icons.shield_moon_rounded, color: gold, size: 18),
                        SizedBox(width: 8),
                        Expanded(
                            child: Text('یک تجربه متفاوت از بازی‌های کلاسیک',
                                textDirection: TextDirection.rtl,
                                style: TextStyle(
                                    color: Color(0xFFE7D7AA),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600))),
                      ]),
                    ],
                  ),
                ),
                const SizedBox(height: 30),
                const Row(children: [
                  Expanded(
                      child: Text('بازی‌ها',
                          textDirection: TextDirection.rtl,
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 21,
                              fontWeight: FontWeight.w800))),
                  Text('GAMES',
                      style: TextStyle(
                          color: gold,
                          fontSize: 10,
                          letterSpacing: 2,
                          fontWeight: FontWeight.bold)),
                ]),
                const SizedBox(height: 14),
                GameTile(
                    title: 'تخته‌نرد',
                    subtitle: 'بازی کلاسیک و رقابتی',
                    icon: Icons.casino_rounded,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const EngineBackgammonScreen()))),
                const SizedBox(height: 12),
                const GameTile(
                    title: 'شطرنج',
                    subtitle: 'به‌زودی',
                    icon: Icons.grid_4x4_rounded,
                    comingSoon: true),
                const SizedBox(height: 12),
                const GameTile(
                    title: 'بازی‌های کارتی',
                    subtitle: 'به‌زودی',
                    icon: Icons.style_rounded,
                    comingSoon: true),
                const SizedBox(height: 24),
                const Center(
                    child: Text('ROYAL CLUB  •  PLAY WITH HONOUR',
                        style: TextStyle(
                            color: Color(0xFF77839A),
                            fontSize: 9,
                            letterSpacing: 1.5,
                            fontWeight: FontWeight.w600))),
              ],
            ),
          ),
        ),
      );
}

class GameTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final bool comingSoon;

  const GameTile(
      {super.key,
      required this.title,
      required this.subtitle,
      required this.icon,
      this.onTap,
      this.comingSoon = false});

  @override
  Widget build(BuildContext context) => Material(
        color: panel,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: gold.withValues(alpha: .22)),
            ),
            child: Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: gold.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(color: gold.withValues(alpha: .25)),
                ),
                child: Icon(icon, color: gold, size: 27),
              ),
              const SizedBox(width: 15),
              Expanded(
                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      textDirection: TextDirection.rtl,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  Text(subtitle,
                      textDirection: TextDirection.rtl,
                      style: const TextStyle(
                          color: Color(0xFFAEB9CB), fontSize: 12)),
                ],
              )),
              if (comingSoon)
                const Text('SOON',
                    style: TextStyle(
                        color: gold,
                        fontSize: 9,
                        letterSpacing: 1,
                        fontWeight: FontWeight.bold))
              else
                const Icon(Icons.arrow_forward_ios_rounded,
                    color: gold, size: 15),
            ]),
          ),
        ),
      );
}
