import 'package:flutter/material.dart';
import 'contact_service.dart';
import 'theme_state.dart';

class ContactScreen extends StatefulWidget {
  const ContactScreen({super.key});
  @override
  State<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends State<ContactScreen> {
  bool _loading = true;
  bool _owner = false;
  bool _saving = false;
  String? _error;
  final List<_ContactRow> _rows = [];

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    for (final row in _rows) { row.label.dispose(); row.value.dispose(); }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([ContactService.list(), ContactService.isOwner()]);
      if (!mounted) return;
      final methods = results[0] as List<dynamic>;
      setState(() {
        _owner = results[1] as bool;
        for (final row in _rows) { row.label.dispose(); row.value.dispose(); }
        _rows.clear();
        for (final item in methods) {
          if (item is Map) _rows.add(_ContactRow(item['label']?.toString() ?? '', item['value']?.toString() ?? ''));
        }
        if (_owner && _rows.isEmpty) _rows.add(_ContactRow('', ''));
        _loading = false; _error = null;
      });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final methods = _rows.map((r) => {'label': r.label.text.trim(), 'value': r.value.text.trim()})
          .where((r) => r['label']!.isNotEmpty && r['value']!.isNotEmpty).toList();
      await ContactService.save(methods);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('راه‌های ارتباطی ذخیره شد.')));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = royalThemeState.current;
    return Directionality(textDirection: TextDirection.rtl, child: Scaffold(
      appBar: AppBar(title: const Text('ارتباط با ما')),
      body: _loading ? const Center(child: CircularProgressIndicator())
      : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!, textAlign: TextAlign.center), const SizedBox(height: 12),
          FilledButton(onPressed: _load, child: const Text('تلاش دوباره')),
        ])))
      : ListView(padding: const EdgeInsets.all(18), children: [
          Text(_owner ? 'راه‌های ارتباطی رسمی Royal Club را مدیریت کن. تغییرات ذخیره‌شده برای همه کاربران نمایش داده می‌شود.' : 'برای ارتباط با تیم مدیریت، از راه‌های رسمی زیر استفاده کن.',
            style: TextStyle(color: theme.dark ? Colors.white70 : Colors.black87)),
          const SizedBox(height: 16),
          if (_rows.isEmpty && !_owner) const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('هنوز راه ارتباطی‌ای توسط مالک برنامه ثبت نشده است.'))),
          for (var i = 0; i < _rows.length; i++)
            Card(color: theme.panel, child: Padding(padding: const EdgeInsets.all(12), child: _owner
              ? Column(children: [
                  TextField(controller: _rows[i].label, decoration: const InputDecoration(labelText: 'عنوان (مثلاً ایمیل پشتیبانی)')),
                  const SizedBox(height: 8),
                  TextField(controller: _rows[i].value, minLines: 1, maxLines: 3, decoration: const InputDecoration(labelText: 'آدرس یا شناسه ارتباطی')),
                  Align(alignment: Alignment.centerLeft, child: IconButton(tooltip: 'حذف این مورد', onPressed: () => setState(() { final row = _rows.removeAt(i); row.label.dispose(); row.value.dispose(); }), icon: const Icon(Icons.delete_outline))),
                ])
              : ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.contact_support_outlined, color: theme.accent),
                  title: Text(_rows[i].label.text, style: TextStyle(fontWeight: FontWeight.w700, color: theme.dark ? Colors.white : Colors.black)),
                  subtitle: SelectableText(_rows[i].value.text, style: TextStyle(color: theme.dark ? Colors.white70 : Colors.black87))))),
          if (_owner) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: _rows.length >= 20 ? null : () => setState(() => _rows.add(_ContactRow('', ''))), icon: const Icon(Icons.add), label: const Text('افزودن راه ارتباطی')),
            const SizedBox(height: 8),
            FilledButton.icon(onPressed: _saving ? null : _save,
              icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_outlined),
              label: const Text('ذخیره تغییرات')),
          ],
        ]),
    ));
  }
}

class _ContactRow {
  final TextEditingController label;
  final TextEditingController value;
  _ContactRow(String title, String address) : label = TextEditingController(text: title), value = TextEditingController(text: address);
}
