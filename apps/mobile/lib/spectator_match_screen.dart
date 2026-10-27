import 'dart:async';
import 'package:flutter/material.dart';
import 'online_match_screen.dart';
import 'profile_avatar.dart';
import 'services/match_service.dart';

const _spectatorGold = Color(0xFFD8B45A);
const _spectatorNavy = Color(0xFF10182B);

class SpectatorMatchScreen extends StatefulWidget {
  final Map<String, dynamic> match;
  const SpectatorMatchScreen({super.key, required this.match});

  @override
  State<SpectatorMatchScreen> createState() => _SpectatorMatchScreenState();
}

class _SpectatorMatchScreenState extends State<SpectatorMatchScreen> {
  Timer? _poller;
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _match = {};
  Map<String, dynamic> _state = {};

  bool get _isEnglish => Localizations.localeOf(context).languageCode == 'en';
  String get _id => widget.match['id'].toString();

  @override
  void initState() {
    super.initState();
    _match = Map<String, dynamic>.from(widget.match);
    _refresh();
    _poller = Timer.periodic(const Duration(seconds: 2), (_) => _refresh(silent: true));
  }

  @override
  void dispose() {
    _poller?.cancel();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if (_loading && silent) return;
    try {
      final data = await MatchService.spectate(_id);
      if (!mounted) return;
      setState(() {
        _match = Map<String, dynamic>.from(data['match'] as Map);
        _state = Map<String, dynamic>.from(data['state'] as Map);
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEnglish = _isEnglish;
    final rawBoard = (_state['board'] as List?) ?? const [];
    final points = rawBoard.whereType<num>().toList();
    final dice = (_state['dice'] as List?)?.whereType<num>().toList() ?? const <num>[];
    final bar = (_state['bar'] as Map?) ?? const {};
    final off = (_state['off'] as Map?) ?? const {};
    return Directionality(
      textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          title: Text(isEnglish ? 'Live spectator' : 'تماشای زنده'),
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.primary,
          actions: [
            IconButton(
              onPressed: () => _refresh(),
              tooltip: isEnglish ? 'Refresh' : 'به‌روزرسانی',
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
              Card(
                color: Theme.of(context).colorScheme.surface,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              children: [
                                RoyalAvatar(dataUrl: _match['hostAvatarDataUrl']?.toString(), radius: 26),
                                const SizedBox(height: 6),
                                Text('@${_match['hostName'] ?? 'player'}', textAlign: TextAlign.center,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                          Text(isEnglish ? 'VS' : 'در برابر', style: const TextStyle(color: _spectatorGold, fontWeight: FontWeight.bold)),
                          Expanded(
                            child: Column(
                              children: [
                                RoyalAvatar(dataUrl: _match['guestAvatarDataUrl']?.toString(), radius: 26),
                                const SizedBox(height: 6),
                                Text('@${_match['guestName'] ?? 'player'}', textAlign: TextAlign.center,
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        isEnglish ? 'Room ${_match['roomCode'] ?? _id} · Read-only live view'
                            : 'اتاق ${_match['roomCode'] ?? _id} · تماشای زنده بدون امکان حرکت',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white60),
                      ),
                    ],
                  ),
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator(color: _spectatorGold)),
                ),
              if (points.length == 24) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6E4A2B),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: _spectatorGold),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(isEnglish ? 'LIVE' : 'زنده', style: const TextStyle(color: _spectatorGold, fontWeight: FontWeight.bold)),
                          const SizedBox(width: 12),
                          ...List.generate(2, (index) => Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 5),
                            child: Container(
                              width: 34,
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                              child: Text(index < dice.length ? '${dice[index]}' : '–',
                                style: const TextStyle(color: _spectatorNavy, fontWeight: FontWeight.bold, fontSize: 18)),
                            ),
                          )),
                        ],
                      ),
                      const SizedBox(height: 10),
                      OnlineBackgammonBoard(
                        points: points,
                        selectedPoint: null,
                        onPointTap: (_) {},
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  color: Theme.of(context).colorScheme.surface,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      isEnglish
                          ? 'Bar — host: ${bar['host'] ?? 0}, guest: ${bar['guest'] ?? 0}   ·   Off — host: ${off['host'] ?? 0}, guest: ${off['guest'] ?? 0}'
                          : 'مهره‌های خارج از بازی — میزبان: ${bar['host'] ?? 0}، مهمان: ${bar['guest'] ?? 0}   ·   خارج‌شده: میزبان: ${off['host'] ?? 0}، مهمان: ${off['guest'] ?? 0}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Text(
                isEnglish
                    ? 'Spectators cannot roll dice, move checkers, resign, or change the match.'
                    : 'تماشاگر نمی‌تواند تاس بریزد، مهره حرکت دهد، تسلیم شود یا وضعیت مسابقه را تغییر دهد.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white54),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
