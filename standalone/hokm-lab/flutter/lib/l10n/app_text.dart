import 'package:flutter/widgets.dart';

String appText(BuildContext context, String fa, String en) =>
    Localizations.localeOf(context).languageCode == 'en' ? en : fa;

String appError(BuildContext context, Object? error) =>
    (error ?? '').toString().replaceFirst('Exception: ', '').trim();
