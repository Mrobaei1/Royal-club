import 'package:flutter/widgets.dart';

/// Selects the app-language copy for UI text that has not yet moved into ARB.
/// Keep this helper limited to Persian and English, matching the app's locales.
String appText(BuildContext context, String fa, String en) {
  return Localizations.localeOf(context).languageCode == 'en' ? en : fa;
}
