import 'package:flutter/material.dart';

void main() => runApp(const RoyalClubApp());

const navy = Color(0xFF10182B);
const gold = Color(0xFFD8B45A);

class RoyalClubApp extends StatelessWidget {
  const RoyalClubApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Royal Club',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: navy,
        colorScheme: ColorScheme.fromSeed(seedColor: gold, brightness: Brightness.dark),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(backgroundColor: navy, foregroundColor: gold),
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('ROYAL CLUB', style: TextStyle(letterSpacing: 2, fontWeight: FontWeight.w800))),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 24),
                const Icon(Icons.workspace_premium, size: 64, color: gold),
                const SizedBox(height: 12),
                const Text('به باشگاه سلطنتی خوش آمدید', textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('دنیایی از بازی‌های آنلاین، در یک تجربه ممتاز', textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.72))),
                const SizedBox(height: 32),
                const GameTile(title: 'تخته‌نرد', subtitle: 'به‌زودی · بازی آنلاین دونفره', icon: Icons.casino),
                const GameTile(title: 'شطرنج', subtitle: 'در برنامه توسعه', icon: Icons.grid_4x4),
                const GameTile(title: 'بازی‌های کارتی', subtitle: 'حکم، چهاربرگ و موارد بیشتر', icon: Icons.style),
                const Spacer(),
                Text('نسخه آغازین رابط کاربری · 0.1.0', textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: 0.5))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class GameTile extends StatelessWidget {
  const GameTile({super.key, required this.title, required this.subtitle, required this.icon});
  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Card(
    color: const Color(0xFF1A2540),
    margin: const EdgeInsets.only(bottom: 12),
    child: ListTile(
      leading: Icon(icon, color: gold, size: 30),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_left, color: gold),
    ),
  );
}
