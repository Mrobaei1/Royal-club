import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'package:image_picker/image_picker.dart';
import 'services/auth_service.dart';

class AccountScreen extends StatefulWidget {
  final VoidCallback onLogout;
  const AccountScreen({super.key, required this.onLogout});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Map<String, dynamic>? _user;
  Map<String, dynamic> _customizationPricing = {};
  bool _loading = true;
  String? _error;
  bool _avatarSaving = false;
  bool _phoneOtpAvailable = false;
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final result = await AuthService.me();
      if (mounted) {
        setState(() {
          _user = Map<String, dynamic>.from(result['user'] as Map? ?? {});
          _loading = false;
        });
      }
      try {
        final status = await AuthService.phoneOtpStatus();
        if (mounted) setState(() => _phoneOtpAvailable = status['available'] == true);
      } catch (_) {
        if (mounted) setState(() => _phoneOtpAvailable = false);
      }
      try {
        final pricing = await AuthService.customizationPricing();
        if (mounted) setState(() => _customizationPricing = pricing);
      } catch (_) {
        if (mounted) setState(() => _customizationPricing = {});
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = appError(context, error);
          _loading = false;
        });
      }
    }
  }

  Future<void> _editUsername() async {
    final controller = TextEditingController(text: _user?['username']?.toString() ?? '');
    final picked = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Theme.of(context).colorScheme.surface,
        title: Text(appText(context, 'تغییر نام کاربری', 'Change username')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: controller, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: appText(context, 'نام کاربری', 'Username'), hintText: 'royal_player7', prefixText: '@', helperText: appText(context, '۳ تا ۲۴ حرف؛ حروف انگلیسی، عدد، نقطه یا زیرخط', '3–24 characters; English letters, numbers, dots or underscores'))),
            if (_customizationPricing.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(appText(context,
                'هزینه تغییر نام کاربری: ${_customizationPricing['usernameChangePriceCredits'] ?? 0} اعتبار',
                'Username change cost: ${_customizationPricing['usernameChangePriceCredits'] ?? 0} credits')),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: Text(appText(context, 'ذخیره', 'Save'))),
        ],
      ),
    );
    controller.dispose();
    if (picked == null || picked.trim().isEmpty || !mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      final updated = await AuthService.updateUsername(picked);
      if (mounted) setState(() { _user?['username'] = updated['username']; _loading = false; });
    } catch (error) {
      if (mounted) setState(() { _error = appError(context, error); _loading = false; });
    }
  }
  Future<void> _linkPhoneWithOtp() async {
    if (!_phoneOtpAvailable || _loading) return;
    final phoneController = TextEditingController(text: _user?['phone']?.toString() ?? '');
    final phone = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(context, 'تأیید شماره موبایل', 'Verify mobile number')),
        content: TextField(
          controller: phoneController,
          keyboardType: TextInputType.phone,
          decoration: InputDecoration(
            labelText: appText(context, 'شماره موبایل ایران', 'Iranian mobile number'),
            hintText: '09123456789',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, phoneController.text.trim()), child: Text(appText(context, 'دریافت کد', 'Send code'))),
        ],
      ),
    );
    phoneController.dispose();
    if (phone == null || phone.trim().isEmpty || !mounted) return;

    setState(() { _loading = true; _error = null; });
    try {
      final requested = await AuthService.requestPhoneOtp(phone: phone, purpose: 'link');
      if (!mounted) return;
      final testCode = requested['testCode']?.toString();
      final codeController = TextEditingController(text: testCode ?? '');
      final code = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(appText(context, 'کد تأیید تلفن', 'Phone verification code')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (testCode != null)
                Text(appText(context, 'کد آزمایشی توسعه: $testCode', 'Development test code: $testCode')),
              TextField(
                controller: codeController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(labelText: appText(context, 'کد شش‌رقمی', 'Six-digit code')),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, codeController.text.trim()), child: Text(appText(context, 'تأیید و پیوند', 'Verify and link'))),
          ],
        ),
      );
      codeController.dispose();
      if (code == null || code.isEmpty || !mounted) return;
      final linked = await AuthService.linkPhoneWithOtp(phone: phone, code: code);
      if (mounted) {
        setState(() {
          _user?['phone'] = linked['phoneE164'] ?? phone;
          _error = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'شماره تلفن با موفقیت تأیید و پیوند شد.', 'Phone number verified and linked successfully.')),
        ));
      }
    } catch (error) {
      if (mounted) setState(() => _error = appError(context, error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatar() async {
    if (_avatarSaving) return;
    try {
      final image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 72,
        maxWidth: 512,
        maxHeight: 512,
      );
      if (image == null || !mounted) return;
      final bytes = await image.readAsBytes();
      if (bytes.length > 650 * 1024) {
        setState(() => _error = appText(context, 'حجم تصویر انتخابی زیاد است؛ لطفاً تصویر کوچک‌تری انتخاب کنید.', 'The selected image is too large. Please choose a smaller image.'));
        return;
      }
      final extension = image.name.toLowerCase().split('.').last;
      final mime = switch (extension) {
        'png' => 'image/png',
        'webp' => 'image/webp',
        _ => 'image/jpeg',
      };
      final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      final firstAvatarFree = _customizationPricing['avatarFirstChangeFree'] == true;
      final avatarPrice = (_customizationPricing['avatarChangePriceCredits'] as num?)?.toInt() ?? 0;
      if (!firstAvatarFree && avatarPrice > 0) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(appText(context, 'تأیید هزینه تغییر تصویر', 'Confirm avatar change cost')),
            content: Text(appText(context,
              'این تغییر تصویر پروفایل ${avatarPrice} اعتبار هزینه دارد. ادامه می‌دهید؟',
              'This profile photo change costs ${avatarPrice} credits. Continue?')),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
              FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(appText(context, 'تأیید و ادامه', 'Confirm and continue'))),
            ],
          ),
        );
        if (confirmed != true || !mounted) return;
      }
      setState(() { _avatarSaving = true; _error = null; });
      final result = await AuthService.updateAvatar(dataUrl);
      if (!mounted) return;
      setState(() {
        _user?['avatarDataUrl'] = result['avatarDataUrl'] ?? dataUrl;
        _customizationPricing['avatarFirstChangeFree'] = false;
        _avatarSaving = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = appError(context, error);
          _avatarSaving = false;
        });
      }
    }
  }

  Widget _avatar() {
    final value = _user?['avatarDataUrl'];
    Uint8List? bytes;
    if (value is String && value.startsWith('data:image/')) {
      final comma = value.indexOf(',');
      if (comma >= 0) {
        try { bytes = base64Decode(value.substring(comma + 1)); } catch (_) {}
      }
    }
    return Column(
      children: [
        CircleAvatar(
          radius: 48,
          backgroundColor: Theme.of(context).colorScheme.surface,
          backgroundImage: bytes == null ? null : MemoryImage(bytes),
          child: bytes == null
              ? Icon(Icons.account_circle_outlined, color: Theme.of(context).colorScheme.primary, size: 76)
              : null,
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _avatarSaving ? null : _pickAvatar,
          icon: _avatarSaving
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.photo_library_outlined),
          label: Text(_avatarSaving ? appText(context, 'در حال ذخیره تصویر...', 'Saving image...') : appText(context, 'انتخاب عکس پروفایل', 'Choose profile photo')),
          style: OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.primary, side: BorderSide(color: Theme.of(context).colorScheme.primary)),
        ),
      ],
    );
  }

  Future<void> _editProfile() async {
    if (_user == null) return;
    final nameController = TextEditingController(text: _user?['fullName']?.toString() ?? '');
    final phoneController = TextEditingController(text: _user?['phone']?.toString() ?? '');
    String country = _user?['country']?.toString() ?? 'Germany';
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    final countries = <String, String>{
      'Germany': isEnglish ? 'Germany' : 'آلمان', 'Iran': isEnglish ? 'Iran' : 'ایران', 'United States': isEnglish ? 'United States' : 'ایالات متحده',
      'United Kingdom': isEnglish ? 'United Kingdom' : 'بریتانیا', 'Turkey': isEnglish ? 'Turkey' : 'ترکیه',
      'United Arab Emirates': isEnglish ? 'United Arab Emirates' : 'امارات متحده عربی', 'Other': isEnglish ? 'Other' : 'سایر کشورها',
    };
    final picked = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          backgroundColor: Theme.of(context).colorScheme.surface,
          title: Text(appText(context, 'ویرایش اطلاعات حساب', 'Edit account details')),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: nameController, textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(labelText: appText(context, 'نام کامل', 'Full name'), border: const OutlineInputBorder())),
              const SizedBox(height: 14),
              TextField(controller: phoneController, keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: appText(context, 'شماره تلفن', 'Phone number'), border: const OutlineInputBorder())),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: countries.containsKey(country) ? country : 'Other',
                decoration: InputDecoration(labelText: appText(context, 'کشور', 'Country'), border: const OutlineInputBorder()),
                items: countries.entries.map((entry) => DropdownMenuItem<String>(value: entry.key, child: Text(entry.value))).toList(),
                onChanged: (value) { if (value != null) setDialogState(() => country = value); },
              ),
              const SizedBox(height: 10),
              Text(appText(context, 'ایمیل و شناسه کاربری ثابت‌اند؛ تغییر ایمیل به فرایند امنیتی جداگانه نیاز دارد.', 'Email and username are fixed; changing the email requires a separate security process.'), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, {
              'fullName': nameController.text.trim(), 'phone': phoneController.text.trim(), 'country': country,
            }), child: Text(appText(context, 'ذخیره تغییرات', 'Save changes'))),
          ],
        ),
      ),
    );
    nameController.dispose();
    phoneController.dispose();
    if (picked == null || !mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      final updated = await AuthService.updateProfile(
        fullName: picked['fullName'] ?? '', phone: picked['phone'] ?? '', country: picked['country'] ?? '',
      );
      if (!mounted) return;
      setState(() {
        _user?['fullName'] = updated['fullName'] ?? picked['fullName'];
        _user?['phone'] = updated['phone'] ?? picked['phone'];
        _user?['country'] = updated['country'] ?? picked['country'];
        _loading = false;
      });
    } catch (error) {
      if (mounted) setState(() { _error = appError(context, error); _loading = false; });
    }
  }

  Widget _detail(IconData icon, String label, String value) => Card(
        color: Theme.of(context).colorScheme.surface,
        child: ListTile(
          leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
          title: Text(label,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
          subtitle: Text(value.isEmpty ? appText(context, 'ثبت نشده', 'Not set') : value,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15)),
        ),
      );

  int _xpThresholdForLevel(int level) {
    var total = 0;
    for (var current = 1; current < level; current++) {
      final n = current - 1;
      total += (300 + 5 * n + 0.08 * n * n).round();
    }
    return total;
  }

  Widget _progressionCard() {
    final xp = (_user?['xpPoints'] as num?)?.toInt() ?? 0;
    final level = ((_user?['level'] as num?)?.toInt() ?? 1).clamp(1, 100).toInt();
    final atMaxLevel = level >= 100;
    final currentThreshold = _xpThresholdForLevel(level);
    final nextThreshold = atMaxLevel ? currentThreshold : _xpThresholdForLevel(level + 1);
    final needed = atMaxLevel ? 0 : (nextThreshold - xp).clamp(0, nextThreshold);
    final span = nextThreshold - currentThreshold;
    final double progress = atMaxLevel || span <= 0 ? 1.0 : ((xp - currentThreshold) / span).clamp(0.0, 1.0).toDouble();
    final accent = Theme.of(context).colorScheme.primary;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Card(
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.workspace_premium_outlined, color: accent, size: 28),
              const SizedBox(width: 10),
              Expanded(child: Text(appText(context, 'سطح و امتیاز تجربه', 'Level and experience'),
                style: TextStyle(color: onSurface, fontSize: 17, fontWeight: FontWeight.bold))),
              Text(appText(context, 'سطح $level', 'Level $level'),
                style: TextStyle(color: accent, fontWeight: FontWeight.bold, fontSize: 16)),
            ]),
            const SizedBox(height: 12),
            Text(appText(context, 'امتیاز تجربه: $xp XP', 'Experience: $xp XP'),
              style: TextStyle(color: onSurface, fontSize: 15)),
            const SizedBox(height: 10),
            LinearProgressIndicator(value: progress, minHeight: 8, borderRadius: BorderRadius.circular(8)),
            const SizedBox(height: 8),
            Text(
              atMaxLevel
                ? appText(context, 'به بالاترین سطح رسیده‌اید.', 'You have reached the maximum level.')
                : appText(context, 'تا سطح بعدی: $needed امتیاز تجربه', 'XP to next level: $needed'),
              style: TextStyle(color: onSurface.withValues(alpha: 0.7), fontSize: 12),
            ),
            const SizedBox(height: 4),
            Text(appText(context, 'سطح‌های به‌دست‌آمده دائمی هستند؛ بازی آفلاین امتیاز ندارد.',
              'Earned levels are permanent; offline practice gives no XP.'),
              style: TextStyle(color: onSurface.withValues(alpha: 0.65), fontSize: 11)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: Text(appText(context, 'حساب کاربری', 'Account')),
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            foregroundColor: Theme.of(context).colorScheme.primary,
          ),
          body: SafeArea(
            child: _loading
                ? Center(
                    child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary))
                : ListView(
                    padding: const EdgeInsets.all(18),
                    children: [
                      _avatar(),
                      const SizedBox(height: 10),
                      Text(appText(context, 'اطلاعات حساب', 'Account information'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontSize: 22,
                              fontWeight: FontWeight.bold)),
                      const SizedBox(height: 20),
                      if (_error != null)
                        Text(appError(context, _error),
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.redAccent)),
                      if (_user != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: FilledButton.icon(
                            onPressed: _editProfile,
                            icon: const Icon(Icons.edit_outlined),
                            label: Text(appText(context, 'ویرایش اطلاعات حساب', 'Edit account details')),
                            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary, padding: const EdgeInsets.all(14)),
                          ),
                        ),
                      if (_user != null) ...[
                        _progressionCard(),
                        Card(
                          color: Theme.of(context).colorScheme.surface,
                          child: ListTile(
                            leading: Icon(Icons.alternate_email, color: Theme.of(context).colorScheme.primary),
                            title: Text(appText(context, 'نام کاربری', 'Username'), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
                            subtitle: Text('@${_user!['username']?.toString() ?? appText(context, 'تنظیم نشده', 'Not set')}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 16)),
                            trailing: IconButton(onPressed: _editUsername, icon: Icon(Icons.edit_outlined, color: Theme.of(context).colorScheme.primary), tooltip: appText(context, 'ویرایش نام کاربری', 'Edit username')),
                          ),
                        ),
                        _detail(Icons.badge_outlined, appText(context, 'نام کامل', 'Full name'),
                            _user!['fullName']?.toString() ?? ''),
                        _detail(Icons.email_outlined, appText(context, 'ایمیل', 'Email'),
                            _user!['email']?.toString() ?? ''),
                        _detail(Icons.phone_outlined, appText(context, 'تلفن', 'Phone'),
                            _user!['phone']?.toString() ?? ''),
                        if (_phoneOtpAvailable)
                          OutlinedButton.icon(
                            onPressed: _loading ? null : _linkPhoneWithOtp,
                            icon: const Icon(Icons.verified_user_outlined),
                            label: Text(appText(context, 'تأیید یا تغییر شماره تلفن', 'Verify or change phone number')),
                          ),
                        _detail(Icons.public_outlined, appText(context, 'کشور', 'Country'),
                            _user!['country']?.toString() ?? ''),
                        _detail(Icons.numbers, appText(context, 'شناسه کاربری', 'User ID'),
                            _user!['id']?.toString() ?? ''),
                      ],
                      const SizedBox(height: 24),
                      OutlinedButton.icon(
                        onPressed: () {
                          widget.onLogout();
                          Navigator.of(context).pop();
                        },
                        icon: const Icon(Icons.logout),
                        label: Text(appText(context, 'خروج از حساب', 'Log out')),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Theme.of(context).colorScheme.primary,
                          side: BorderSide(color: Theme.of(context).colorScheme.primary),
                          padding: const EdgeInsets.all(14),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      );
}
