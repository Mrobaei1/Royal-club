import 'package:flutter/material.dart';

class ChessPlayerProfile {
  const ChessPlayerProfile({
    required this.username,
    required this.level,
    required this.xp,
    required this.rating,
    required this.games,
    required this.wins,
    required this.losses,
    required this.draws,
    required this.winRate,
  });

  factory ChessPlayerProfile.fromJson(Map<String, dynamic> json) => ChessPlayerProfile(
        username: json['username'] as String? ?? '',
        level: (json['level'] as num?)?.toInt() ?? 1,
        xp: (json['xp'] as num?)?.toInt() ?? 0,
        rating: (json['rating'] as num?)?.toInt() ?? 1200,
        games: (json['games'] as num?)?.toInt() ?? 0,
        wins: (json['wins'] as num?)?.toInt() ?? 0,
        losses: (json['losses'] as num?)?.toInt() ?? 0,
        draws: (json['draws'] as num?)?.toInt() ?? 0,
        winRate: (json['winRate'] as num?)?.toDouble() ?? 0,
      );

  final String username;
  final int level;
  final int xp;
  final int rating;
  final int games;
  final int wins;
  final int losses;
  final int draws;
  final double winRate;
}

class ChessPlayerProfileCard extends StatelessWidget {
  const ChessPlayerProfileCard({super.key, required this.profile});

  final ChessPlayerProfile profile;

  @override
  Widget build(BuildContext context) {
    final fa = Localizations.localeOf(context).languageCode == 'fa';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  child: Text(profile.username.isEmpty ? '?' : profile.username.characters.first.toUpperCase()),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(profile.username, style: Theme.of(context).textTheme.titleMedium,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                Text(fa ? 'سطح ${profile.level}' : 'Level ${profile.level}'),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                _metric(fa ? 'امتیاز' : 'Rating', profile.rating.toString()),
                _metric(fa ? 'تجربه' : 'XP', profile.xp.toString()),
                _metric(fa ? 'بازی' : 'Games', profile.games.toString()),
                _metric(fa ? 'برد' : 'Wins', profile.wins.toString()),
                _metric(fa ? 'باخت' : 'Losses', profile.losses.toString()),
                _metric(fa ? 'مساوی' : 'Draws', profile.draws.toString()),
                _metric(fa ? 'نرخ برد' : 'Win rate', '${profile.winRate.toStringAsFixed(1)}%'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, String value) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      );
}
