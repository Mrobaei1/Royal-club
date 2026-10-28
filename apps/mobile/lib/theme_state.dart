import 'package:flutter/material.dart';
import 'services/auth_service.dart';

const List<RoyalTheme> royalThemes = [
  RoyalTheme('کهکشانی', Color(0xFF17112F), Color(0xFF251B45), Color(0xFFB9A0FF), englishName: 'Galactic'),
  RoyalTheme('فیروزه‌ای', Color(0xFF082F3A), Color(0xFF104956), Color(0xFF55E6D0), englishName: 'Turquoise'),
  RoyalTheme('غروب مرجانی', Color(0xFF321C2B), Color(0xFF4B2937), Color(0xFFFF9B83), englishName: 'Coral sunset'),
  RoyalTheme('یاقوت کبود', Color(0xFF0B1D42), Color(0xFF173263), Color(0xFF82B7FF), englishName: 'Sapphire'),
  RoyalTheme('رزگلد', Color(0xFF301D2B), Color(0xFF493041), Color(0xFFFFC1B8), englishName: 'Rose gold'),
  RoyalTheme('جنگل زمردی', Color(0xFF092D28), Color(0xFF12463B), Color(0xFF83E6AD), englishName: 'Emerald forest'),
  RoyalTheme('آرکتیک روشن', Color(0xFFF0F5FA), Color(0xFFFFFFFF), Color(0xFF4269A8), dark: false, englishName: 'Bright arctic'),
  RoyalTheme('گرافیتی نئونی', Color(0xFF171A20), Color(0xFF252B35), Color(0xFFFFD166), englishName: 'Neon graffiti'),
];

class RoyalTheme {
  final String name;
  final String englishName;
  String localizedName(BuildContext context) => Localizations.localeOf(context).languageCode == 'en' ? englishName : name;
  final Color background;
  final Color panel;
  final Color accent;
  final bool dark;
  const RoyalTheme(this.name, this.background, this.panel, this.accent, {this.dark = true, this.englishName = ''});
}

class RoyalThemeState extends ChangeNotifier {
  RoyalThemeState() { _load(); }
  int index = 0;
  RoyalTheme get current => royalThemes[index];

  Future<void> _load() async {
    try {
      final value = await AuthService.readThemePreference();
      if (value != null && value >= 0 && value < royalThemes.length) {
        index = value;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> select(int value) async {
    if (value < 0 || value >= royalThemes.length) return;
    index = value;
    notifyListeners();
    await AuthService.saveThemePreference(value);
  }
}

final RoyalThemeState royalThemeState = RoyalThemeState();
