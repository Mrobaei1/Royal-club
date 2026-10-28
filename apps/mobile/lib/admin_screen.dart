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
      final plans = results[0] as List<dynamic>;
      final reports = results[1] as List<dynamic>;
      setState(() { _owner = true; _plans = plans; _reports = reports; _loading = false; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = appError(context, e); });
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
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'تنظیمات ذخیره شد؛ ارسال واقعی همچنان غیرفعال است.', 'Settings saved; real SMS sending remains disabled.'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _search() async {
    setState(() => _busy = true);
    try {
      final users = await AdminService.findUser(_email.text);
      if (mounted) setState(() { _users = users; });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _exportUser(dynamic user) async {
    setState(() => _busy = true);
    try {
      final profile = await AdminService.exportUserProfile(user['id'].toString());
      if (!mounted) return;
      final lines = <String>[
        appText(context, 'شناسه کاربر: ${profile['id'] ?? ''}', 'User ID: ${profile['id'] ?? ''}'),
        appText(context, 'نام کاربری: ${profile['username'] ?? ''}', 'Username: ${profile['username'] ?? ''}'),
        appText(context, 'ایمیل: ${profile['email'] ?? ''}', 'Email: ${profile['email'] ?? ''}'),
        appText(context, 'تلفن: ${profile['phone'] ?? ''}', 'Phone: ${profile['phone'] ?? ''}'),
        appText(context, 'کشور: ${profile['country'] ?? ''}', 'Country: ${profile['country'] ?? ''}'),
        appText(context, 'موجودی اعتبار: ${profile['walletBalance'] ?? '0'}', 'Credit balance: ${profile['walletBalance'] ?? '0'}'),
        appText(context, 'تاریخ ثبت‌نام: ${profile['createdAt'] ?? ''}', 'Registration date: ${profile['createdAt'] ?? ''}'),
      ];
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
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'مشخصات در کلیپ‌بورد کپی شد.', 'User details copied to clipboard.'))));
              },
              icon: const Icon(Icons.copy),
              label: Text(appText(context, 'کپی برای استخراج', 'Copy for export')),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _credit(dynamic user) async {
    final amount = int.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'مقدار اعتبار باید عدد مثبت باشد.', 'Credit amount must be a positive number.'))));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.credit(user['id'].toString(), amount, _description.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'اعتبار با موفقیت ثبت شد.', 'Credits added successfully.'))));
        await _search();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _notify({String? userId}) async {
    final title = _notificationTitle.text.trim();
    final body = _notificationBody.text.trim();
    if (title.isEmpty || title.length > 120 || body.length > 1000) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'عنوان الزامی است؛ عنوان حداکثر ۱۲۰ و متن حداکثر ۱۰۰۰ نویسه.', 'A title is required; title must be at most 120 characters and message at most 1,000 characters.'))));
      return;
    }
    setState(() => _busy = true);
    try {
      final count = await AdminService.sendNotification(userId: userId, title: title, body: body);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'اعلان برای $count کاربر ارسال شد.', 'Notification sent to $count users.'))));
      if (mounted && userId == null) {
        _notificationTitle.clear();
        _notificationBody.clear();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _updateReport(dynamic report, String status) async {
    setState(() => _busy = true);
    try {
      await AdminService.updateReport(report['id'].toString(), status);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'وضعیت گزارش به‌روزرسانی شد.', 'Report status updated.'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
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
          SnackBar(content: Text(active ? appText(context, 'اشتراک فعال شد.', 'Subscription enabled.') : appText(context, 'اشتراک غیرفعال شد.', 'Subscription disabled.'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(appError(context, e))),
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
      title: Text(appText(context, 'ویرایش اشتراک', 'Edit subscription')),
      content: Form(key: formKey, child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextFormField(controller: name, decoration: InputDecoration(labelText: appText(context, 'نام اشتراک', 'Subscription name')), validator: (v) => v == null || v.trim().isEmpty ? appText(context, 'نام الزامی است', 'Name is required') : null),
        TextFormField(controller: days, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'مدت (روز)', 'Duration (days)')), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 1 ? appText(context, 'مدت نامعتبر است', 'Invalid duration') : null),
        TextFormField(controller: price, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'قیمت (اعتبار)', 'Price (credits)')), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 0 ? appText(context, 'قیمت نامعتبر است', 'Invalid price') : null),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
        FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(context, true); }, child: Text(appText(context, 'ذخیره', 'Save'))),
      ],
    ));
    if (accepted != true) { name.dispose(); days.dispose(); price.dispose(); return; }
    try {
      await AdminService.updatePlan(plan['code'].toString(), name: name.text.trim(), durationDays: int.parse(days.text), priceCredits: int.parse(price.text));
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'اشتراک به‌روزرسانی شد.', 'Subscription updated.'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      name.dispose(); days.dispose(); price.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
    child: Scaffold(
      appBar: AppBar(title: Text(appText(context, 'پنل مدیریت', 'Admin panel')), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : _error != null
        ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(appError(context, _error), textAlign: TextAlign.center)))
        : !_owner
          ? Center(child: Padding(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.lock_outline, size: 54), SizedBox(height: 14),
              Text(appText(context, 'دسترسی مدیر فعال نیست', 'Administrator access is not enabled'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              SizedBox(height: 8), Text(appText(context, 'این بخش فقط برای شناسه مالک تعریف‌شده در تنظیمات سرور قابل استفاده است.', 'This section is available only to the owner ID configured on the server.'), textAlign: TextAlign.center),
            ])))
          : ListView(padding: const EdgeInsets.all(16), children: [

              Card(child: Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(appText(context, 'امنیت و احراز هویت — پیامک / OTP', 'Security & authentication — SMS / OTP'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Text(appText(context, 'ارسال واقعی پیامک و ورود با OTP تا تصمیم مدیر و تکمیل آداپتور قفل است.', 'Real SMS delivery and OTP login remain locked until the owner decides and the provider adapter is complete.'), style: TextStyle(color: Colors.orange)),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(appText(context, 'فعال‌سازی OTP پیامکی', 'Enable SMS OTP')), subtitle: Text(appText(context, 'فعلاً غیرفعال و غیرقابل فعال‌سازی', 'Currently disabled and cannot be enabled')), value: false, onChanged: null),
                DropdownButtonFormField<String>(initialValue: _smsMode == 'development_simulator' ? 'development_simulator' : 'disabled', decoration: InputDecoration(labelText: appText(context, 'حالت ارسال', 'Delivery mode')), items: [
                  DropdownMenuItem(value: 'disabled', child: Text(appText(context, 'غیرفعال (پیش‌فرض)', 'Disabled (default)'))),
                  DropdownMenuItem(value: 'development_simulator', child: Text(appText(context, 'شبیه‌ساز توسعه، بدون پیامک واقعی', 'Development simulator, no real SMS'))),
                ], onChanged: _busy ? null : (v) => setState(() => _smsMode = v ?? 'disabled')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(initialValue: _smsProvider, decoration: InputDecoration(labelText: appText(context, 'ارائه‌دهنده (قابل تغییر در آینده)', 'Provider (replaceable later)')), items: [
                  DropdownMenuItem(value: 'kavenegar', child: Text('KaveNegar')),
                  DropdownMenuItem(value: 'ippanel', child: Text('IPPanel')),
                  DropdownMenuItem(value: 'other', child: Text(appText(context, 'سایر', 'Other'))),
                ], onChanged: _busy ? null : (v) => setState(() => _smsProvider = v ?? 'kavenegar')),
                const SizedBox(height: 8),
                TextField(controller: _smsApiKey, obscureText: true, decoration: InputDecoration(labelText: appText(context, 'کلید API (اختیاری)', 'API key (optional)'), helperText: _smsSettings['apiKeyConfigured'] == true ? appText(context, 'کلید ذخیره شده و مخفی است.', 'The saved key is hidden.') : appText(context, 'ذخیره امن نیازمند کلید رمزنگاری سمت سرور است.', 'Secure storage requires a server-side encryption key.'), border: const OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(controller: _smsSender, decoration: InputDecoration(labelText: appText(context, 'شناسه فرستنده', 'Sender ID'), border: const OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(controller: _smsTemplate, decoration: InputDecoration(labelText: appText(context, 'شناسه الگوی پیامک', 'SMS template ID'), border: const OutlineInputBorder())),
                Row(children: [Expanded(child: TextField(controller: _smsTtl, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'اعتبار کد (ثانیه)', 'Code validity (seconds)')))), const SizedBox(width: 8), Expanded(child: TextField(controller: _smsCooldown, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'فاصله ارسال مجدد', 'Resend cooldown (seconds)'))))]),
                Row(children: [Expanded(child: TextField(controller: _smsAttempts, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'حداکثر تلاش', 'Maximum attempts')))), const SizedBox(width: 8), Expanded(child: TextField(controller: _smsDailyLimit, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'سقف روزانه', 'Daily limit'))))]),
                const SizedBox(height: 10),
                FilledButton.icon(onPressed: _busy ? null : _saveSmsSettings, icon: const Icon(Icons.save_outlined), label: Text(appText(context, 'ذخیره تنظیمات غیرفعال', 'Save disabled settings'))),
                Text(appText(context, 'کلید ذخیره شده: ${_smsSettings['apiKeyConfigured'] == true ? 'بله (مخفی)' : 'خیر'}', 'Saved key: ${_smsSettings['apiKeyConfigured'] == true ? 'yes (hidden)' : 'no'}'), style: const TextStyle(fontSize: 12)),
              ]))),
              const SizedBox(height: 22),
              Text(appText(context, 'اعتباردهی به کاربر', 'Credit a user'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: appText(context, 'ایمیل دقیق کاربر', 'Exact user email'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(onPressed: _busy ? null : _search, child: Text(appText(context, 'جستجوی کاربر', 'Search user'))),
              for (final user in _users) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('@${user['username'] ?? appText(context, 'کاربر', 'User')}', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(user['email']?.toString() ?? ''),
                TextField(controller: _amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'مقدار اعتبار', 'Credit amount'))),
                TextField(controller: _description, decoration: InputDecoration(labelText: appText(context, 'توضیح تراکنش', 'Transaction description'))),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : () => _credit(user), child: Text(appText(context, 'ثبت اعتبار', 'Add credits'))),
                OutlinedButton(onPressed: _busy ? null : () => _notify(userId: user['id'].toString()), child: Text(appText(context, 'ارسال اعلان به این کاربر', 'Send notification to this user'))),
                OutlinedButton.icon(onPressed: _busy ? null : () => _exportUser(user), icon: const Icon(Icons.person_search_outlined), label: Text(appText(context, 'استخراج مشخصات کاربر', 'Export user details'))),
              ]))),
              const SizedBox(height: 22),
              Text(appText(context, 'ارسال اعلان', 'Send notification'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              TextField(controller: _notificationTitle, maxLength: 120, decoration: InputDecoration(labelText: appText(context, 'عنوان اعلان', 'Notification title'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _notificationBody, maxLines: 3, maxLength: 1000, decoration: InputDecoration(labelText: appText(context, 'متن اعلان', 'Notification message'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton.icon(onPressed: _busy ? null : () => _notify(), icon: const Icon(Icons.campaign_outlined), label: Text(appText(context, 'ارسال اعلان به همه کاربران', 'Send notification to all users'))),
              const SizedBox(height: 22),
              Row(children: [
                Expanded(child: Text(appText(context, 'گزارش‌های کاربران', 'User reports'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
                IconButton(onPressed: _busy ? null : _load, tooltip: appText(context, 'تازه‌سازی گزارش‌ها', 'Refresh reports'), icon: const Icon(Icons.refresh)),
              ]),
              Text(appText(context, 'گزارش‌های باز با حداقل ۲ گزارشگر یکتا در ۷ روز برجسته می‌شوند.', 'Open reports with at least 2 unique reporters in 7 days are highlighted.'), style: TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              if (_reports.isEmpty) Text(appText(context, 'گزارش ثبت‌شده‌ای وجود ندارد.', 'No reports have been submitted.')),
              for (final report in _reports) Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(report['reportedEmail']?.toString() ?? appText(context, 'کاربر', 'User'), style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text(appText(context, 'گزارشگر: ${report['reporterEmail'] ?? report['reporterId']}', 'Reporter: ${report['reporterEmail'] ?? report['reporterId']}')),
                    Text(appText(context, 'گزارش‌های ۷ روز اخیر: ${report['uniqueReportsLast7Days']} گزارشگر یکتا از ${report['reportsLast7Days']} گزارش', 'Last 7 days: ${report['uniqueReportsLast7Days']} unique reporters across ${report['reportsLast7Days']} reports')),
                    if ((report['uniqueReportsLast7Days'] as num?)?.toInt() != null && ((report['uniqueReportsLast7Days'] as num).toInt() >= 2))
                      Chip(label: Text(appText(context, 'نیازمند بررسی مدیر', 'Needs admin review'))),
                    const SizedBox(height: 4),
                    Text(report['reason']?.toString() ?? ''),
                    Text(appText(context, 'وضعیت: ${report['status']}', 'Status: ${report['status']}')),
                    if (report['status'] == 'open') Wrap(spacing: 8, children: [
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'reviewed'), child: Text(appText(context, 'بررسی شد', 'Reviewed'))),
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'dismissed'), child: Text(appText(context, 'رد گزارش', 'Dismiss report'))),
                      FilledButton.tonal(onPressed: _busy ? null : () => _updateReport(report, 'actioned'), child: Text(appText(context, 'اقدام شد', 'Action taken'))),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 22),
              Text(appText(context, 'مدیریت اشتراک‌ها', 'Subscription management'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              for (final plan in _plans) Card(child: ListTile(
                leading: const Icon(Icons.workspace_premium),
                title: Text(plan['name']?.toString() ?? ''),
                subtitle: Text(appText(context, '${plan['durationDays']} روز • ${plan['priceCredits']} اعتبار', '${plan['durationDays']} days • ${plan['priceCredits']} credits')),
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
