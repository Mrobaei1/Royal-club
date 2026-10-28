import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'package:flutter/services.dart';
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
  List<dynamic> _reports = [];
  final _email = TextEditingController();
  final _amount = TextEditingController(text: '100');
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _notificationTitle = TextEditingController();
  final _notificationBody = TextEditingController();
  List<dynamic> _users = [];
  bool _busy = false;
  Map<String, dynamic> _smsSettings = {};
  String _smsMode = 'disabled';
  String _smsProvider = 'kavenegar';
  final _smsSender = TextEditingController();
  final _smsTemplate = TextEditingController();
  final _smsApiKey = TextEditingController();
  final _smsTtl = TextEditingController(text: '120');
  final _smsCooldown = TextEditingController(text: '60');
  final _smsAttempts = TextEditingController(text: '5');
  final _smsDailyLimit = TextEditingController(text: '100');

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
    _smsSender.dispose(); _smsTemplate.dispose(); _smsApiKey.dispose(); _smsTtl.dispose(); _smsCooldown.dispose(); _smsAttempts.dispose(); _smsDailyLimit.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final owner = await AdminService.isOwner();
      if (!owner) {
        if (mounted) setState(() { _owner = false; _loading = false; _error = null; });
        return;
      }
      final results = await Future.wait([AdminService.plans(), AdminService.reports(), AdminService.smsOtpSettings()]);
      if (!mounted) return;
      final sms = results[2] as Map<String, dynamic>;
      _smsSettings = sms; _smsMode = sms['deliveryMode']?.toString() ?? 'disabled';
      _smsProvider = sms['provider']?.toString().isNotEmpty == true ? sms['provider'].toString() : 'kavenegar';
      _smsSender.text = sms['senderId']?.toString() ?? ''; _smsTemplate.text = sms['templateId']?.toString() ?? '';
      _smsTtl.text = (sms['otpTtlSeconds'] ?? 120).toString(); _smsCooldown.text = (sms['resendCooldownSeconds'] ?? 60).toString();
      _smsAttempts.text = (sms['maxAttempts'] ?? 5).toString(); _smsDailyLimit.text = (sms['dailyLimit'] ?? 100).toString();
      setState(() { _owner = true; _plans = results[0]; _reports = results[1]; _loading = false; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString().replaceFirst('Exception: ', ''); });
    }
  }


  Future<void> _saveSmsSettings() async {
    setState(() => _busy = true);
    try {
      final saved = await AdminService.saveSmsOtpSettings({
        'enabled': false, 'deliveryMode': _smsMode, 'provider': _smsProvider,
        'senderId': _smsSender.text.trim(), 'templateId': _smsTemplate.text.trim(),
        if (_smsApiKey.text.isNotEmpty) 'apiKey': _smsApiKey.text,
        'otpTtlSeconds': int.tryParse(_smsTtl.text) ?? 120,
        'resendCooldownSeconds': int.tryParse(_smsCooldown.text) ?? 60,
        'maxAttempts': int.tryParse(_smsAttempts.text) ?? 5,
        'dailyLimit': int.tryParse(_smsDailyLimit.text) ?? 100,
      });
      _smsApiKey.clear();
      if (!mounted) return;
      setState(() => _smsSettings = saved);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'تنظیمات ذخیره شد؛ ارسال واقعی همچنان غیرفعال است.', 'Settings saved; real SMS sending remains disabled.')))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally { if (mounted) setState(() => _busy = false); }
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

  Future<void> _exportUser(dynamic user) async {
    setState(() => _busy = true);
    try {
      final profile = await AdminService.exportUserProfile(user['id'].toString());
      final lines = <String>[
        'شناسه کاربر: ${profile['id'] ?? ''}',
        'نام کاربری: ${profile['username'] ?? ''}',
        'ایمیل: ${profile['email'] ?? ''}',
        'تلفن: ${profile['phone'] ?? ''}',
        'کشور: ${profile['country'] ?? ''}',
        'موجودی اعتبار: ${profile['walletBalance'] ?? '0'}',
        'تاریخ ثبت‌نام: ${profile['createdAt'] ?? ''}',
      ];
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(appText(context, 'مشخصات کاربر', 'User details')),
          content: SingleChildScrollView(child: SelectableText(lines.join('\\n'))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'بستن', 'Close'))),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: lines.join('\\n')));
                if (dialogContext.mounted) Navigator.pop(dialogContext);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text(appText(context, 'مشخصات در کلیپ‌بورد کپی شد.', 'User details copied to clipboard.'))));
              },
              icon: const Icon(Icons.copy),
              label: Text(appText(context, 'کپی برای استخراج', 'Copy for export')),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
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

  Future<void> _updateReport(dynamic report, String status) async {
    setState(() => _busy = true);
    try {
      await AdminService.updateReport(report['id'].toString(), status);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('وضعیت گزارش به‌روزرسانی شد.')));
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
    textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
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

              Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('امنیت و احراز هویت — پیامک / OTP', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                const Text('ارسال واقعی پیامک و ورود با OTP تا تصمیم مدیر و تکمیل آداپتور قفل است.', style: TextStyle(color: Colors.orange)),
                const SwitchListTile(contentPadding: EdgeInsets.zero, title: Text('فعال‌سازی OTP پیامکی'), subtitle: Text('فعلاً غیرفعال و غیرقابل فعال‌سازی'), value: false, onChanged: null),
                DropdownButtonFormField<String>(value: _smsMode == 'development_simulator' ? 'development_simulator' : 'disabled', decoration: const InputDecoration(labelText: 'حالت ارسال'), items: const [
                  DropdownMenuItem(value: 'disabled', child: Text('غیرفعال (پیش‌فرض)')),
                  DropdownMenuItem(value: 'development_simulator', child: Text('شبیه‌ساز توسعه، بدون پیامک واقعی')),
                ], onChanged: _busy ? null : (v) => setState(() => _smsMode = v ?? 'disabled')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(value: _smsProvider, decoration: const InputDecoration(labelText: 'ارائه‌دهنده (قابل تغییر در آینده)'), items: const [
                  DropdownMenuItem(value: 'kavenegar', child: Text('کاوه‌نگار')),
                  DropdownMenuItem(value: 'ippanel', child: Text('IPPanel')),
                  DropdownMenuItem(value: 'other', child: Text('سایر')),
                ], onChanged: _busy ? null : (v) => setState(() => _smsProvider = v ?? 'kavenegar')),
                const SizedBox(height: 8),
                TextField(controller: _smsApiKey, obscureText: true, decoration: InputDecoration(labelText: 'کلید API (اختیاری)', helperText: _smsSettings['apiKeyConfigured'] == true ? 'کلید ذخیره شده و مخفی است.' : 'ذخیره امن نیازمند کلید رمزنگاری سمت سرور است.', border: const OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(controller: _smsSender, decoration: const InputDecoration(labelText: 'شناسه فرستنده', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(controller: _smsTemplate, decoration: const InputDecoration(labelText: 'شناسه الگوی پیامک', border: OutlineInputBorder())),
                Row(children: [Expanded(child: TextField(controller: _smsTtl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'اعتبار کد (ثانیه)'))), const SizedBox(width: 8), Expanded(child: TextField(controller: _smsCooldown, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'فاصله ارسال مجدد')))]),
                Row(children: [Expanded(child: TextField(controller: _smsAttempts, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'حداکثر تلاش'))), const SizedBox(width: 8), Expanded(child: TextField(controller: _smsDailyLimit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'سقف روزانه')))]),
                const SizedBox(height: 10),
                FilledButton.icon(onPressed: _busy ? null : _saveSmsSettings, icon: const Icon(Icons.save_outlined), label: const Text('ذخیره تنظیمات غیرفعال')),
                Text('کلید ذخیره شده: ${_smsSettings['apiKeyConfigured'] == true ? 'بله (مخفی)' : 'خیر'}', style: const TextStyle(fontSize: 12)),
              ]))),
              const SizedBox(height: 22),
              const Text('اعتباردهی به کاربر', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'ایمیل دقیق کاربر', border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(onPressed: _busy ? null : _search, child: const Text('جستجوی کاربر')),
              for (final user in _users) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('@${user['username'] ?? 'کاربر'}', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(user['email']?.toString() ?? ''),
                TextField(controller: _amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'مقدار اعتبار')),
                TextField(controller: _description, decoration: const InputDecoration(labelText: 'توضیح تراکنش')),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : () => _credit(user), child: const Text('ثبت اعتبار')),
                OutlinedButton(onPressed: _busy ? null : () => _notify(userId: user['id'].toString()), child: const Text('ارسال اعلان به این کاربر')),
                OutlinedButton.icon(onPressed: _busy ? null : () => _exportUser(user), icon: const Icon(Icons.person_search_outlined), label: const Text('استخراج مشخصات کاربر')),
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
              Row(children: [
                const Expanded(child: Text('گزارش‌های کاربران', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
                IconButton(onPressed: _busy ? null : _load, tooltip: 'تازه‌سازی گزارش‌ها', icon: const Icon(Icons.refresh)),
              ]),
              const Text('گزارش‌های باز با حداقل ۲ گزارشگر یکتا در ۷ روز برجسته می‌شوند.', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              if (_reports.isEmpty) const Text('گزارش ثبت‌شده‌ای وجود ندارد.'),
              for (final report in _reports) Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(report['reportedEmail']?.toString() ?? 'کاربر', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text('گزارشگر: ${report['reporterEmail'] ?? report['reporterId']}'),
                    Text('گزارش‌های ۷ روز اخیر: ${report['uniqueReportsLast7Days']} گزارشگر یکتا از ${report['reportsLast7Days']} گزارش'),
                    if ((report['uniqueReportsLast7Days'] as num?)?.toInt() != null && ((report['uniqueReportsLast7Days'] as num).toInt() >= 2))
                      const Chip(label: Text('نیازمند بررسی مدیر')),
                    const SizedBox(height: 4),
                    Text(report['reason']?.toString() ?? ''),
                    Text('وضعیت: ${report['status']}'),
                    if (report['status'] == 'open') Wrap(spacing: 8, children: [
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'reviewed'), child: const Text('بررسی شد')),
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'dismissed'), child: const Text('رد گزارش')),
                      FilledButton.tonal(onPressed: _busy ? null : () => _updateReport(report, 'actioned'), child: const Text('اقدام شد')),
                    ]),
                  ]),
                ),
              ),
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
