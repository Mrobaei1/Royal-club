import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../services/api_transport.dart';
import '../services/auth_service.dart';
import 'game_service_config_verifier.dart';
import 'uno_online_screen.dart';

class UnoEntryScreen extends StatefulWidget {
  const UnoEntryScreen({super.key});
  @override
  State<UnoEntryScreen> createState() => _UnoEntryScreenState();
}

class _UnoEntryScreenState extends State<UnoEntryScreen> {
  late final Future<Map<String, dynamic>> _session = _loadSession();

  Future<Map<String, dynamic>> _loadSession() async {
    final token = await AuthService.accessToken();
    if (token == null || token.isEmpty) throw Exception('ابتدا وارد حساب Royal Club شوید.');
    final profile = await AuthService.me();
    final user = profile['user'];
    if (user is! Map || user['id'] == null) throw Exception('شناسه کاربر از سرور Royal Club دریافت نشد.');
    final response = await http.get(ApiTransport.uri('/api/v1/public/game-services'))
        .timeout(const Duration(seconds: 10));
    if (response.statusCode != 200) throw Exception('تنظیمات سرویس بازی از سرور دریافت نشد.');
    final decoded = jsonDecode(response.body);
    if (decoded is! Map || decoded['algorithm'] != 'Ed25519') {
      throw Exception('امضای تنظیمات مرکزی سرویس بازی معتبر نیست.');
    }
    final version = (decoded['version'] as num?)?.toInt();
    final services = decoded['services'];
    final unoOrigin = services is Map ? services['uno'] : null;
    final signature = decoded['signature'];
    final publicKey = decoded['publicKey'];
    if (version == null || signature is! String || publicKey is! String ||
        !await verifyGameServiceConfigSignature(
          version: version,
          unoOrigin: unoOrigin is String ? unoOrigin : null,
          signatureBase64: signature,
          publicKeyBase64: publicKey,
        )) {
      throw Exception('امضای تنظیمات مرکزی سرویس بازی تأیید نشد.');
    }
    if (unoOrigin is! String || unoOrigin.trim().isEmpty) {
      throw Exception('سرویس آنلاین اونو هنوز در پنل زیرساخت تنظیم نشده است.');
    }
    final uri = Uri.tryParse(unoOrigin);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty ||
        uri.path.isNotEmpty || uri.query.isNotEmpty || uri.fragment.isNotEmpty) {
      throw Exception('آدرس سرویس اونو معتبر نیست.');
    }
    return {'token': token, 'playerId': user['id'].toString(), 'serverUrl': uri.origin};
  }

  @override
  Widget build(BuildContext context) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    return FutureBuilder<Map<String, dynamic>>(
      future: _session,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
          appBar: AppBar(title: Text(fa ? 'بازی اونو' : 'UNO')),
          body: Center(child: Padding(padding: const EdgeInsets.all(24),
            child: Text(snapshot.error.toString(), textAlign: TextAlign.center))),
          );
        }
        if (!snapshot.hasData) {
          return Scaffold(
          appBar: AppBar(title: Text(fa ? 'بازی اونو' : 'UNO')),
          body: const Center(child: CircularProgressIndicator()),
          );
        }
        return UnoOnlineScreen(
          serverUrl: snapshot.data!['serverUrl'] as String,
          accessToken: snapshot.data!['token'] as String,
          playerId: snapshot.data!['playerId'] as String,
        );
      },
    );
  }
}
