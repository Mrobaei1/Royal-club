import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'hokm_screen.dart';
import 'services/hokm_service.dart';

/// Standalone Hokm UI host. Supply an authenticated API adapter and user identity
/// loader from the host environment; this package does not assume Royal Club auth.
class HokmStandaloneApp extends StatelessWidget {
  final HokmApi api;
  final Future<String?> Function() identityLoader;
  final Locale locale;
  final bool managerAccess;

  const HokmStandaloneApp({
    super.key,
    required this.api,
    required this.identityLoader,
    this.locale = const Locale('fa'),
    this.managerAccess = false,
  });

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        locale: locale,
        supportedLocales: const [Locale('fa'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFD8B45A),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF10182B),
        ),
        home: HokmScreen(api: api, identityLoader: identityLoader, managerAccess: managerAccess),
      );
}
