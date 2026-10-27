import 'package:flutter/material.dart';
import 'profile_avatar.dart';
import 'services/leaderboard_service.dart';

const _leaderboardGold = Color(0xFFD8B45A);
const _leaderboardNavy = Color(0xFF10182B);
const _leaderboardPanel = Color(0xFF17243A);

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  bool _loading = true;
  String? _error;
  String? _currentUserId;
  List<Map<String, dynamic>> _players = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() { _loading = true; _error = null; });
    try {
      final data = await LeaderboardService.fetch();
      final rows = (data['leaderboard'] as List? ?? const [])
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList();
      if (mounted) {
        setState(() {
          _players = rows;
          _currentUserId = data['currentUserId']?.toString();
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          title: const Text('رتبه‌بندی بازیکنان'),
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.primary,
          actions: [
            IconButton(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: 'به‌روزرسانی',
            ),
          ],
        ),
        body: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: _leaderboardGold))
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.cloud_off, color: _leaderboardGold, size: 42),
                            const SizedBox(height: 12),
                            Text(_error!, textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.white70)),
                            const SizedBox(height: 12),
                            FilledButton.icon(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh),
                              label: const Text('تلاش دوباره'),
                              style: FilledButton.styleFrom(
                                backgroundColor: Theme.of(context).colorScheme.primary,
                                foregroundColor: Theme.of(context).colorScheme.onPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : _players.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'هنوز بازی تمام‌شده‌ای برای رتبه‌بندی ثبت نشده است.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white70, height: 1.5),
                            ),
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: _leaderboardGold,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _players.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final player = _players[index];
                              final isCurrentUser = player['userId']?.toString() == _currentUserId;
                              final username = player['username']?.toString();
                              return Card(
                                color: isCurrentUser ? const Color(0xFF26344B) : _leaderboardPanel,
                                child: ListTile(
                                  leading: RoyalAvatar(
                                    dataUrl: player['avatarDataUrl']?.toString(),
                                    radius: 23,
                                    backgroundColor: index < 3 ? _leaderboardGold : _leaderboardNavy,
                                    foregroundColor: index < 3 ? _leaderboardNavy : Colors.white70,
                                  ),
                                  title: Text(
                                    username == null || username.isEmpty ? 'بازیکن' : '@$username',
                                    style: TextStyle(
                                      color: isCurrentUser ? _leaderboardGold : Colors.white,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  subtitle: Text(
                                    'برد: ${player['wins'] ?? 0}  ·  باخت: ${player['losses'] ?? 0}  ·  بازی: ${player['gamesPlayed'] ?? 0}',
                                    style: const TextStyle(color: Colors.white60, fontSize: 12),
                                  ),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text('${player['rating'] ?? 1000}',
                                          style: const TextStyle(
                                            color: _leaderboardGold,
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          )),
                                      const Text('امتیاز', style: TextStyle(color: Colors.white54, fontSize: 10)),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
        ),
      ),
    );
  }
}
