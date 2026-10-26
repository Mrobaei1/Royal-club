import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';
import 'services/match_service.dart';
import 'online_match_screen.dart';

const _gold = Color(0xFFD8B45A);
const _navy = Color(0xFF10182B);

class OnlineLobbyScreen extends StatefulWidget {
  const OnlineLobbyScreen({super.key});
  @override
  State<OnlineLobbyScreen> createState() => _OnlineLobbyScreenState();
}

class _OnlineLobbyScreenState extends State<OnlineLobbyScreen> {
  List<Map<String, dynamic>> _matches = [];
  List<Map<String, dynamic>> _history = [];
  Map<String, dynamic>? _created;
  bool _loading = false;
  String? _error;

  @override
  void initState() { super.initState(); _refresh(); }

  Future<void> _run(Future<void> Function() action) async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _refresh() => _run(() async {
    final results = await Future.wait([MatchService.listOpen(), MatchService.history()]);
    if (mounted) setState(() { _matches = results[0]; _history = results[1]; });
  });

  Future<void> _create() => _run(() async {
    final match = await MatchService.create();
    if (!mounted) return;
    setState(() => _created = match);
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OnlineMatchScreen(match: match),
    ));
    final rows = await MatchService.listOpen();
    if (mounted) setState(() => _matches = rows);
  });

  Future<void> _join(Map<String, dynamic> room) => _run(() async {
    final match = await MatchService.join(room['id'].toString());
    if (!mounted) return;
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => OnlineMatchScreen(match: match),
    ));
    final rows = await MatchService.listOpen();
    if (mounted) setState(() => _matches = rows);
  });

  Future<void> _cancelCreated() => _run(() async {
    final id = _created?['id'];
    if (id == null) return;
    await MatchService.cancel(id.toString());
    if (mounted) setState(() => _created = null);
  });

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
    child: Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(title: Text(AppLocalizations.of(context)!.onlinePlayTitle), backgroundColor: _navy, foregroundColor: _gold,
        actions: [IconButton(onPressed: _loading ? null : _refresh, icon: const Icon(Icons.refresh), tooltip: AppLocalizations.of(context)!.refresh)]),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        Text(AppLocalizations.of(context)!.backgammonRooms, style: TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(AppLocalizations.of(context)!.onlineLobbyDescription, style: TextStyle(color: Colors.white70, height: 1.5)),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _loading ? null : _create, icon: const Icon(Icons.add), label: Text(AppLocalizations.of(context)!.createNewRoom),
          style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _navy, padding: const EdgeInsets.all(14))),
        if (_created != null) Card(color: const Color(0xFF17243A), child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(AppLocalizations.of(context)!.roomCreated, style: TextStyle(color: _gold, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('${AppLocalizations.of(context)!.roomCodeLabel}: ${_created!['roomCode'] ?? '—'}   ·   ${AppLocalizations.of(context)!.roomIdLabel}: ${_created!['id'] ?? '—'}', style: const TextStyle(color: Colors.white)),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: _loading ? null : _cancelCreated, icon: const Icon(Icons.cancel_outlined), label: Text(AppLocalizations.of(context)!.cancelPendingRoom)),
        ]))),
        if (_error != null) Container(margin: const EdgeInsets.only(top: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.red.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
        if (_loading) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(color: _gold))),
        const SizedBox(height: 20),
        Text(AppLocalizations.of(context)!.joinableRooms, style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (!_loading && _matches.isEmpty) const Padding(padding: EdgeInsets.all(18), child: Text(AppLocalizations.of(context)!.noOpenRooms, textAlign: TextAlign.center, style: TextStyle(color: Colors.white60))),
        ..._matches.map((room) => Card(color: const Color(0xFF17243A), child: ListTile(
          leading: const Icon(Icons.casino, color: _gold),
          title: Text('${AppLocalizations.of(context)!.roomLabel} ${room['roomCode'] ?? room['id']}', style: const TextStyle(color: Colors.white)),
          subtitle: Text('${AppLocalizations.of(context)!.hostLabel}: ${room['hostName'] ?? AppLocalizations.of(context)!.playerFallback}', style: const TextStyle(color: Colors.white70)),
          trailing: FilledButton(onPressed: _loading ? null : () => _join(room), style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _navy), child: Text(AppLocalizations.of(context)!.join)),
        ))),
        const SizedBox(height: 24),
        Text(AppLocalizations.of(context)!.recentGameResults, style: TextStyle(color: _gold, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (!_loading && _history.isEmpty)
          const Padding(padding: EdgeInsets.all(12), child: Text(AppLocalizations.of(context)!.noCompletedGames, style: TextStyle(color: Colors.white60))),
        ..._history.map((game) {
          final result = game['result']?.toString() ?? 'unknown';
          final won = result == 'win';
          final resultLabel = won ? AppLocalizations.of(context)!.winLabel : result == 'loss' ? AppLocalizations.of(context)!.lossLabel : AppLocalizations.of(context)!.unknownResult;
          return Card(
            color: const Color(0xFF17243A),
            child: ListTile(
              leading: Icon(won ? Icons.emoji_events_outlined : Icons.sports_esports_outlined,
                color: won ? _gold : Colors.white60),
              title: Text(resultLabel, style: TextStyle(color: won ? _gold : Colors.white)),
              subtitle: Text('${AppLocalizations.of(context)!.opponentLabel}: ${game['opponentEmail'] ?? AppLocalizations.of(context)!.playerFallback} • ${AppLocalizations.of(context)!.roomLabel} ${game['roomCode'] ?? game['id']}',
                style: const TextStyle(color: Colors.white70)),
              trailing: const Icon(Icons.history, color: Colors.white38),
            ),
          );
        }),
      ])),
    ),
  );
}
