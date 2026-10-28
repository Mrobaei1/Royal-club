import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'profile_avatar.dart';
import 'services/leaderboard_service.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  bool _loading = true;
  bool _weekly = true;
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
      final data = await LeaderboardService.fetch(weekly: _weekly);
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
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    return Directionality(
      textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          title: Text(isEnglish ? (_weekly ? 'Weekly leaderboard' : 'All-time leaderboard') : (_weekly ? 'رتبه‌بندی هفتگی' : 'رتبه‌بندی کلی')),
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.primary,
          actions: [
            TextButton(
              onPressed: _loading ? null : () {
                setState(() => _weekly = !_weekly);
                _load();
              },
              child: Text(isEnglish ? (_weekly ? 'All-time' : 'Weekly') : (_weekly ? 'رتبه‌بندی کلی' : 'رتبه‌بندی هفتگی')),
            ),
            IconButton(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.refresh),
              tooltip: appText(context, 'به‌روزرسانی', 'Refresh'),
            ),
          ],
        ),
        body: SafeArea(
          child: _loading
              ? Center(child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary))
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.cloud_off, color: Theme.of(context).colorScheme.primary, size: 42),
                            const SizedBox(height: 12),
                            Text(appError(context, _error), textAlign: TextAlign.center,
                                style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                            const SizedBox(height: 12),
                            FilledButton.icon(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh),
                              label: Text(appText(context, 'تلاش دوباره', 'Try again')),
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
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              (isEnglish ? 'No completed games are available for ranking yet.' : 'هنوز بازی تمام‌شده‌ای برای رتبه‌بندی ثبت نشده است.'),
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), height: 1.5),
                            ),
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: Theme.of(context).colorScheme.primary,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: _players.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final player = _players[index];
                              final isCurrentUser = player['userId']?.toString() == _currentUserId;
                              final username = player['username']?.toString();
                              return Card(
                                color: isCurrentUser ? Theme.of(context).colorScheme.surfaceContainerHighest : Theme.of(context).colorScheme.surface,
                                child: ListTile(
                                  leading: RoyalAvatar(
                                    dataUrl: player['avatarDataUrl']?.toString(),
                                    radius: 23,
                                    backgroundColor: index < 3 ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.surfaceContainerHighest,
                                    foregroundColor: index < 3 ? Theme.of(context).colorScheme.onPrimary : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), 
                                  ),
                                  title: Text(
                                    username == null || username.isEmpty ? appText(context, 'بازیکن', 'Player') : '@$username',
                                    style: TextStyle(
                                      color: isCurrentUser ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.onSurface,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  subtitle: Text(
                                    isEnglish
                                      ? 'Level ${player['level'] ?? 1} · Wins: ${player['wins'] ?? 0} · Losses: ${player['losses'] ?? 0} · Games: ${player['gamesPlayed'] ?? 0}'
                                      : appText(context, 'سطح ${player['level'] ?? 1}  ·  برد: ${player['wins'] ?? 0}  ·  باخت: ${player['losses'] ?? 0}  ·  بازی: ${player['gamesPlayed'] ?? 0}', 'Level ${player['level'] ?? 1}  ·  Wins: ${player['wins'] ?? 0}  ·  Losses: ${player['losses'] ?? 0}  ·  Games: ${player['gamesPlayed'] ?? 0}'),
                                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12),
                                  ),
                                  trailing: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text('${_weekly ? (player['score'] ?? 0) : (player['rating'] ?? 1000)}',
                                          style: TextStyle(
                                            color: Theme.of(context).colorScheme.primary,
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          )),
                                      Text(isEnglish ? (_weekly ? 'Weekly points' : 'Rating') : (_weekly ? 'امتیاز هفتگی' : 'امتیاز'), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.54), fontSize: 10)),
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
