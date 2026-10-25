import 'package:flutter/material.dart';
import 'services/match_service.dart';

const _gold = Color(0xFFD8B45A);
const _navy = Color(0xFF10182B);

class OnlineLobbyScreen extends StatefulWidget {
  const OnlineLobbyScreen({super.key});
  @override
  State<OnlineLobbyScreen> createState() => _OnlineLobbyScreenState();
}

class _OnlineLobbyScreenState extends State<OnlineLobbyScreen> {
  List<Map<String, dynamic>> _matches = [];
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
    final rows = await MatchService.listOpen();
    if (mounted) setState(() => _matches = rows);
  });

  Future<void> _create() => _run(() async {
    final match = await MatchService.create();
    if (mounted) setState(() => _created = match);
    final rows = await MatchService.listOpen();
    if (mounted) setState(() => _matches = rows);
  });

  Future<void> _join(Map<String, dynamic> room) => _run(() async {
    final match = await MatchService.join(room['id'].toString());
    if (!mounted) return;
    await showDialog<void>(context: context, builder: (context) => AlertDialog(
      backgroundColor: const Color(0xFF17243A),
      title: const Text('به اتاق پیوستید', style: TextStyle(color: _gold)),
      content: Text('کد اتاق: ${match['roomCode'] ?? '—'}\nوضعیت: ${match['status'] ?? '—'}\n\nاتصال اتاق به صفحه بازی و همگام‌سازی حرکت‌ها هنوز در مرحله بعدی توسعه است.',
        style: const TextStyle(color: Colors.white, height: 1.6)),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('متوجه شدم'))],
    ));
    await _refresh();
  });

  Future<void> _cancelCreated() => _run(() async {
    final id = _created?['id'];
    if (id == null) return;
    await MatchService.cancel(id.toString());
    if (mounted) setState(() => _created = null);
  });

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: _navy,
      appBar: AppBar(title: const Text('بازی آنلاین'), backgroundColor: _navy, foregroundColor: _gold,
        actions: [IconButton(onPressed: _loading ? null : _refresh, icon: const Icon(Icons.refresh), tooltip: 'به‌روزرسانی')]),
      body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('اتاق‌های تخته‌نرد', style: TextStyle(color: _gold, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('ساخت اتاق و پیوستن به حریف از طریق API احراز هویت‌شده انجام می‌شود.', style: TextStyle(color: Colors.white70, height: 1.5)),
        const SizedBox(height: 16),
        FilledButton.icon(onPressed: _loading ? null : _create, icon: const Icon(Icons.add), label: const Text('ساخت اتاق جدید'),
          style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _navy, padding: const EdgeInsets.all(14))),
        if (_created != null) Card(color: const Color(0xFF17243A), child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('اتاق شما ساخته شد', style: TextStyle(color: _gold, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('کد: ${_created!['roomCode'] ?? '—'}   ·   شناسه: ${_created!['id'] ?? '—'}', style: const TextStyle(color: Colors.white)),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: _loading ? null : _cancelCreated, icon: const Icon(Icons.cancel_outlined), label: const Text('لغو اتاق در انتظار')),
        ]))),
        if (_error != null) Container(margin: const EdgeInsets.only(top: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.red.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
        if (_loading) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(color: _gold))),
        const SizedBox(height: 20),
        const Text('اتاق‌های قابل پیوستن', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        if (!_loading && _matches.isEmpty) const Padding(padding: EdgeInsets.all(18), child: Text('در حال حاضر اتاق بازی آزادی وجود ندارد.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white60))),
        ..._matches.map((room) => Card(color: const Color(0xFF17243A), child: ListTile(
          leading: const Icon(Icons.casino, color: _gold),
          title: Text('اتاق ${room['roomCode'] ?? room['id']}', style: const TextStyle(color: Colors.white)),
          subtitle: Text('میزبان: ${room['hostName'] ?? 'بازیکن'}', style: const TextStyle(color: Colors.white70)),
          trailing: FilledButton(onPressed: _loading ? null : () => _join(room), style: FilledButton.styleFrom(backgroundColor: _gold, foregroundColor: _navy), child: const Text('پیوستن')),
        ))),
      ])),
    ),
  );
}
