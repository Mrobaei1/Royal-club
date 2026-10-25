import 'package:flutter/material.dart';
import 'services/admin_service.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});
  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  bool _loading = true;
  bool _owner = false;
  String? _error;
  List<dynamic> _plans = [];
  final _email = TextEditingController();
  final _amount = TextEditingController(text: '100');
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _notificationTitle = TextEditingController();
  final _notificationBody = TextEditingController();
  List<dynamic> _users = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _email.dispose();
    _amount.dispose();
    _description.dispose();
    _price.dispose();
    _notificationTitle.dispose();
    _notificationBody.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final owner = await AdminService.isOwner();
      if (!owner) {
        if (mounted) setState(() { _owner = false; _loading = false; _error = null; });
        return;
      }
      final plans = await AdminService.plans();
      if (!mounted) return;
      setState(() { _owner = true; _plans = plans; _loading = false; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString().replaceFirst('Exception: ', ''); });
    }
  }

  Future<void> _search() async {
    setState(() => _busy = true);
    try {
      final users = await AdminService.findUser(_email.text);
      if (mounted) setState(() { _users = users; });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _credit(dynamic user) async {
    final amount = int.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('مقدار اعتبار باید عدد مثبت باشد.')));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.credit(user['id'].toString(), amount, _description.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اعتبار با موفقیت ثبت شد.')));
        await _search();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _notify({String? userId}) async {
    final title = _notificationTitle.text.trim();
    final body = _notificationBody.text.trim();
    if (title.isEmpty || title.length > 120 || body.length > 1000) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('عنوان الزامی است؛ عنوان حداکثر ۱۲۰ و متن حداکثر ۱۰۰۰ نویسه.')));
      return;
    }
    setState(() => _busy = true);
    try {
      final count = await AdminService.sendNotification(userId: userId, title: title, body: body);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('اعلان برای $count کاربر ارسال شد.')));
      if (mounted && userId == null) {
        _notificationTitle.clear();
        _notificationBody.clear();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _togglePlan(dynamic plan, bool active) async {
    setState(() => _busy = true);
    try {
      await AdminService.updatePlan(plan['code'].toString(), active: active);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(active ? 'اشتراک فعال شد.' : 'اشتراک غیرفعال شد.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editPlan(dynamic plan) async {
    final name = TextEditingController(text: plan['name']?.toString() ?? '');
    final days = TextEditingController(text: plan['durationDays']?.toString() ?? '30');
    final price = TextEditingController(text: plan['priceCredits']?.toString() ?? '0');
    final formKey = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('ویرایش اشتراک'),
      content: Form(key: formKey, child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextFormField(controller: name, decoration: const InputDecoration(labelText: 'نام اشتراک'), validator: (v) => v == null || v.trim().isEmpty ? 'نام الزامی است' : null),
        TextFormField(controller: days, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'مدت (روز)'), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 1 ? 'مدت نامعتبر است' : null),
        TextFormField(controller: price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'قیمت (اعتبار)'), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 0 ? 'قیمت نامعتبر است' : null),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('انصراف')),
        FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(context, true); }, child: const Text('ذخیره')),
      ],
    ));
    if (accepted != true) { name.dispose(); days.dispose(); price.dispose(); return; }
    try {
      await AdminService.updatePlan(plan['code'].toString(), name: name.text.trim(), durationDays: int.parse(days.text), priceCredits: int.parse(price.text));
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اشتراک به‌روزرسانی شد.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      name.dispose(); days.dispose(); price.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(title: const Text('پنل مدیریت'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : _error != null
        ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
        : !_owner
          ? const Center(child: Padding(padding: EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.lock_outline, size: 54), SizedBox(height: 14),
              Text('دسترسی مدیر فعال نیست', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              SizedBox(height: 8), Text('این بخش فقط برای شناسه مالک تعریف‌شده در تنظیمات سرور قابل استفاده است.', textAlign: TextAlign.center),
            ])))
          : ListView(padding: const EdgeInsets.all(16), children: [
              const Text('اعتباردهی به کاربر', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'ایمیل دقیق کاربر', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(onPressed: _busy ? null : _search, child: const Text('جستجوی کاربر')),
              for (final user in _users) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user['fullName']?.toString() ?? 'کاربر', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(user['email']?.toString() ?? ''),
                TextField(controller: _amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'مقدار اعتبار')),
                TextField(controller: _description, decoration: const InputDecoration(labelText: 'توضیح تراکنش')),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : () => _credit(user), child: const Text('ثبت اعتبار')),
                OutlinedButton(onPressed: _busy ? null : () => _notify(userId: user['id'].toString()), child: const Text('ارسال اعلان به این کاربر')),
              ]))),
              const SizedBox(height: 22),
              const Text('ارسال اعلان', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              TextField(controller: _notificationTitle, maxLength: 120, decoration: const InputDecoration(labelText: 'عنوان اعلان', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _notificationBody, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'متن اعلان', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton.icon(onPressed: _busy ? null : () => _notify(), icon: const Icon(Icons.campaign_outlined), label: const Text('ارسال اعلان به همه کاربران')),
              const SizedBox(height: 22),
              const Text('مدیریت اشتراک‌ها', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              for (final plan in _plans) Card(child: ListTile(
                leading: const Icon(Icons.workspace_premium),
                title: Text(plan['name']?.toString() ?? ''),
                subtitle: Text('${plan['durationDays']} روز • ${plan['priceCredits']} اعتبار'),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  Switch(
                    value: plan['active'] == true,
                    onChanged: _busy ? null : (value) => _togglePlan(plan, value),
                  ),
                  IconButton(onPressed: _busy ? null : () => _editPlan(plan), icon: const Icon(Icons.edit)),
                ]),
              )),
            ]),
    ),
  );
}
