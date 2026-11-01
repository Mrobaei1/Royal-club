import 'package:flutter/material.dart';

class ChessTimeControl {
  const ChessTimeControl({
    required this.id,
    required this.displayName,
    required this.baseMs,
    required this.incrementMs,
    required this.enabled,
  });

  final String id;
  final String displayName;
  final int baseMs;
  final int incrementMs;
  final bool enabled;
}

class ChessAdminSettingsScreen extends StatelessWidget {
  const ChessAdminSettingsScreen({
    super.key,
    required this.controls,
    required this.canManage,
    required this.onSave,
    required this.onDelete,
  });

  final List<ChessTimeControl> controls;
  final bool canManage;
  final ValueChanged<ChessTimeControl> onSave;
  final ValueChanged<String> onDelete;

  bool _isPersian(BuildContext context) =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'fa';

  String _duration(int ms, bool fa) {
    final minutes = ms ~/ 60000;
    final seconds = (ms % 60000) ~/ 1000;
    if (minutes > 0) return fa ? '$minutes دقیقه' : '$minutes min';
    return fa ? '$seconds ثانیه' : '$seconds sec';
  }

  Future<void> _edit(BuildContext context, {ChessTimeControl? existing}) async {
    final fa = _isPersian(context);
    final id = TextEditingController(text: existing?.id ?? '');
    final name = TextEditingController(text: existing?.displayName ?? '');
    final base = TextEditingController(text: ((existing?.baseMs ?? 300000) ~/ 1000).toString());
    final increment = TextEditingController(text: ((existing?.incrementMs ?? 0) ~/ 1000).toString());
    var enabled = existing?.enabled ?? true;
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<ChessTimeControl>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(existing == null
              ? (fa ? 'افزودن زمان بازی' : 'Add time control')
              : (fa ? 'ویرایش زمان بازی' : 'Edit time control')),
          content: Form(
            key: formKey,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextFormField(controller: id, enabled: existing == null,
                    decoration: InputDecoration(labelText: fa ? 'شناسه' : 'ID'),
                    validator: (v) => (v == null || !RegExp(r'^[a-zA-Z0-9_-]{1,40}$').hasMatch(v))
                        ? (fa ? 'شناسه معتبر نیست' : 'Enter a valid ID') : null),
                  TextFormField(controller: name,
                    decoration: InputDecoration(labelText: fa ? 'نام نمایشی' : 'Display name'),
                    validator: (v) => v == null || v.trim().isEmpty || v.trim().length > 80
                        ? (fa ? 'نام باید بین ۱ تا ۸۰ نویسه باشد' : 'Name must be 1–80 characters') : null),
                  TextFormField(controller: base, keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: fa ? 'زمان پایه (ثانیه)' : 'Base time (seconds)'),
                    validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 1 || int.parse(v) > 86400
                        ? (fa ? 'زمان باید بین ۱ تا ۸۶۴۰۰ ثانیه باشد' : 'Enter 1–86400 seconds') : null),
                  TextFormField(controller: increment, keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: fa ? 'افزایش هر حرکت (ثانیه)' : 'Increment per move (seconds)'),
                    validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 0 || int.parse(v) > 60
                        ? (fa ? 'افزایش باید بین صفر تا ۶۰ ثانیه باشد' : 'Enter 0–60 seconds') : null),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(fa ? 'فعال' : 'Enabled'),
                    value: enabled,
                    onChanged: (value) => setDialogState(() => enabled = value),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext),
              child: Text(fa ? 'انصراف' : 'Cancel')),
            FilledButton(onPressed: () {
              if (!formKey.currentState!.validate()) return;
              Navigator.pop(dialogContext, ChessTimeControl(
                id: id.text.trim(), displayName: name.text.trim(),
                baseMs: int.parse(base.text) * 1000,
                incrementMs: int.parse(increment.text) * 1000,
                enabled: enabled,
              ));
            }, child: Text(fa ? 'ذخیره' : 'Save')),
          ],
        ),
      ),
    );
    if (result != null) onSave(result);
    id.dispose();
    name.dispose();
    base.dispose();
    increment.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fa = _isPersian(context);
    if (!canManage) {
      return Scaffold(
        appBar: AppBar(title: Text(fa ? 'تنظیمات شطرنج' : 'Chess settings')),
        body: Center(child: Text(fa ? 'دسترسی مدیریت ندارید' : 'You do not have permission to manage settings')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(fa ? 'مدیریت زمان‌های شطرنج' : 'Chess time controls'),
        actions: [IconButton(
          tooltip: fa ? 'افزودن' : 'Add',
          onPressed: () => _edit(context),
          icon: const Icon(Icons.add),
        )],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: controls.length,
        separatorBuilder: (_, __) => const Divider(),
        itemBuilder: (context, index) {
          final control = controls[index];
          return ListTile(
            title: Text(control.displayName),
            subtitle: Text('${_duration(control.baseMs, fa)} • +${control.incrementMs ~/ 1000}s'),
            leading: Icon(control.enabled ? Icons.timer : Icons.timer_off),
            trailing: Wrap(
              children: [
                IconButton(
                  tooltip: fa ? 'ویرایش' : 'Edit',
                  onPressed: () => _edit(context, existing: control),
                  icon: const Icon(Icons.edit),
                ),
                IconButton(
                  tooltip: fa ? 'حذف' : 'Delete',
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (dialogContext) => AlertDialog(
                        title: Text(fa ? 'حذف زمان بازی؟' : 'Delete time control?'),
                        content: Text(control.displayName),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(dialogContext, false),
                            child: Text(fa ? 'انصراف' : 'Cancel')),
                          FilledButton(onPressed: () => Navigator.pop(dialogContext, true),
                            child: Text(fa ? 'حذف' : 'Delete')),
                        ],
                      ),
                    );
                    if (confirmed == true) onDelete(control.id);
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
