import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import 'uno_online_screen.dart';

/// Configure the separately hosted UNO service using --dart-define=UNO_SERVER_URL=https://...
const String _unoServerUrl = String.fromEnvironment('UNO_SERVER_URL');

class UnoEntryScreen extends StatefulWidget {
  const UnoEntryScreen({super.key});
  @override
  State<UnoEntryScreen> createState() => _UnoEntryScreenState();
}

class _UnoEntryScreenState extends State<UnoEntryScreen> {
  late final Future<Map<String, dynamic>> _session = _loadSession();

  Future<Map<String, dynamic>> _loadSession() async {
    final token = await AuthService.accessToken();
    if (token == null || token.isEmpty) throw Exception('نشست ورود پیدا نشد؛ دوباره وارد حساب شوید.');
    final profile = await AuthService.me();
    final user = profile['user'];
    if (user is! Map || user['id'] == null) throw Exception('شناسه کاربر از سرور Royal Club دریافت نشد.');
    return {'token': token, 'playerId': user['id'].toString()};
  }

  @override
  Widget build(BuildContext context) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    if (_unoServerUrl.trim().isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(fa ? 'بازی اونو' : 'UNO')),
        body: Center(child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, size: 52),
            const SizedBox(height: 16),
            Text(fa ? 'سرویس آنلاین اونو هنوز راه‌اندازی و آدرس‌دهی نشده است.' : 'The online UNO service has not been deployed and configured yet.', textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(fa ? 'پس از راه‌اندازی سرویس مستقل، آدرس HTTPS آن هنگام ساخت برنامه تنظیم می‌شود.' : 'The deployed standalone service HTTPS origin will be supplied at build time.', textAlign: TextAlign.center),
          ]),
        )),
      );
    }
    return FutureBuilder<Map<String, dynamic>>(
      future: _session,
      builder: (context, snapshot) {
        if (snapshot.hasError) return Scaffold(appBar: AppBar(title: Text(fa ? 'بازی اونو' : 'UNO')), body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(snapshot.error.toString(), textAlign: TextAlign.center))));
        if (!snapshot.hasData) return Scaffold(appBar: AppBar(title: Text(fa ? 'بازی اونو' : 'UNO')), body: const Center(child: CircularProgressIndicator()));
        return UnoOnlineScreen(serverUrl: _unoServerUrl, accessToken: snapshot.data!['token'] as String, playerId: snapshot.data!['playerId'] as String);
      },
    );
  }
}
