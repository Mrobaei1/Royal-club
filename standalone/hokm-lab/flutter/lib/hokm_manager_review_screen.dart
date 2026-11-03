import 'package:flutter/material.dart';

import 'l10n/app_text.dart';
import 'services/hokm_service.dart';

class HokmManagerReviewScreen extends StatefulWidget {
  final HokmApi api;
  final String roomId;

  const HokmManagerReviewScreen({
    super.key,
    required this.api,
    required this.roomId,
  });

  @override
  State<HokmManagerReviewScreen> createState() => _HokmManagerReviewScreenState();
}

class _HokmManagerReviewScreenState extends State<HokmManagerReviewScreen> {
  Map<String, dynamic>? _review;
  bool _busy = false;
  String? _error;

  String t(String fa, String en) => appText(context, fa, en);
  int get _version => (_review?['version'] as num?)?.toInt() ?? 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.api.managerView(widget.roomId);
      if (mounted) setState(() => _review = result);
    } catch (error) {
      if (mounted) setState(() => _error = appError(context, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reviewReport(String id) async {
    await _mutate(() => widget.api.reviewReport(widget.roomId, id,
        'Reviewed by an authorized manager.', _version));
  }

  Future<void> _reviewAppeal(String id, String decision) async {
    await _mutate(() => widget.api.reviewAppeal(widget.roomId, id, decision,
        'Reviewed by an authorized manager.', _version));
  }

  Future<void> _mutate(Future<Map<String, dynamic>> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await action();
      if (mounted) setState(() => _review = result);
    } catch (error) {
      if (mounted) setState(() => _error = appError(context, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Map<String, dynamic>> _items(String key) =>
      ((_review?[key] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

  @override
  Widget build(BuildContext context) {
    final reports = _items('reports');
    final appeals = _items('appeals');
    return Scaffold(
      appBar: AppBar(
        title: Text(t('بررسی مدیریت حکم', 'Hokm manager review')),
        actions: [IconButton(
          tooltip: t('بروزرسانی', 'Refresh'),
          onPressed: _busy ? null : _load,
          icon: const Icon(Icons.refresh),
        )],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        if (_busy) const LinearProgressIndicator(),
        if (_error != null) Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
        ),
        Text('${t('گزارش‌های تقلب', 'Cheating reports')} (${reports.length})',
          style: Theme.of(context).textTheme.titleLarge),
        if (reports.isEmpty) Text(t('گزارشی ثبت نشده است.', 'No reports submitted.')),
        ...reports.map((report) {
          final id = report['reportId']?.toString() ?? '';
          return Card(child: ListTile(
            title: Text(report['reason']?.toString() ?? ''),
            subtitle: Text('${report['status']} • ${report['reportedUserId']}'),
            trailing: report['status'] == 'pending'
                ? IconButton(
                    tooltip: t('ثبت بررسی', 'Mark reviewed'),
                    onPressed: _busy ? null : () => _reviewReport(id),
                    icon: const Icon(Icons.fact_check_outlined),
                  )
                : const Icon(Icons.check_circle_outline),
          ));
        }),
        const Divider(height: 32),
        Text('${t('اعتراض به نتیجه', 'Result appeals')} (${appeals.length})',
          style: Theme.of(context).textTheme.titleLarge),
        if (appeals.isEmpty) Text(t('اعتراضی ثبت نشده است.', 'No appeals submitted.')),
        ...appeals.map((appeal) {
          final id = appeal['appealId']?.toString() ?? '';
          return Card(child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(appeal['reason']?.toString() ?? ''),
              Text('${appeal['status']}'),
              if (appeal['status'] == 'pending') Wrap(spacing: 8, children: [
                OutlinedButton(
                  onPressed: _busy ? null : () => _reviewAppeal(id, 'confirmed'),
                  child: Text(t('تأیید', 'Confirm')),
                ),
                OutlinedButton(
                  onPressed: _busy ? null : () => _reviewAppeal(id, 'dismissed'),
                  child: Text(t('رد اعتراض', 'Dismiss')),
                ),
              ]),
            ]),
          ));
        }),
      ]),
    );
  }
}
