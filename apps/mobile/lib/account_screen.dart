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
  bool _loading = true;
  String? _error;
  bool _avatarSaving = false;
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
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString().replaceFirst('Exception: ', '');
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
        content: TextField(controller: controller, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: appText(context, 'نام کاربری', 'Username'), hintText: 'royal_player7', prefixText: '@', helperText: appText(context, '۳ تا ۲۴ حرف؛ حروف انگلیسی، عدد، نقطه یا زیرخط', '3–24 characters; English letters, numbers, dots or underscores'))),
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
      if (mounted) setState(() { _error = error.toString().replaceFirst('Exception: ', ''); _loading = false; });
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
      setState(() { _avatarSaving = true; _error = null; });
      final result = await AuthService.updateAvatar(dataUrl);
      if (!mounted) return;
      setState(() {
        _user?['avatarDataUrl'] = result['avatarDataUrl'] ?? dataUrl;
        _avatarSaving = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString().replaceFirst('Exception: ', '');
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
    const countries = <String, String>{
      'Germany': 'آلمان', 'Iran': 'ایران', 'United States': 'ایالات متحده',
      'United Kingdom': 'بریتانیا', 'Turkey': 'ترکیه',
      'United Arab Emirates': 'امارات متحده عربی', 'Other': 'سایر کشورها',
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
                decoration: const InputDecoration(labelText: 'کشور', border: OutlineInputBorder()),
                items: countries.entries.map((entry) => DropdownMenuItem<String>(value: entry.key, child: Text(entry.value))).toList(),
                onChanged: (value) { if (value != null) setDialogState(() => country = value); },
              ),
              const SizedBox(height: 10),
              Text('ایمیل و شناسه کاربری ثابت‌اند؛ تغییر ایمیل به فرایند امنیتی جداگانه نیاز دارد.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('انصراف')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, {
              'fullName': nameController.text.trim(), 'phone': phoneController.text.trim(), 'country': country,
            }), child: const Text('ذخیره تغییرات')),
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
      if (mounted) setState(() { _error = error.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Widget _detail(IconData icon, String label, String value) => Card(
        color: Theme.of(context).colorScheme.surface,
        child: ListTile(
          leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
          title: Text(label,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
          subtitle: Text(value.isEmpty ? 'ثبت نشده' : value,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15)),
        ),
      );

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
        child: Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          appBar: AppBar(
            title: const Text('حساب کاربری'),
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
                      Text('اطلاعات حساب',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontSize: 22,
                              fontWeight: FontWeight.bold)),
                      const SizedBox(height: 20),
                      if (_error != null)
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.redAccent)),
                      if (_user != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: FilledButton.icon(
                            onPressed: _editProfile,
                            icon: const Icon(Icons.edit_outlined),
                            label: const Text('ویرایش اطلاعات حساب'),
                            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.primary, foregroundColor: Theme.of(context).colorScheme.onPrimary, padding: const EdgeInsets.all(14)),
                          ),
                        ),
                      if (_user != null) ...[
                        Card(
                          color: Theme.of(context).colorScheme.surface,
                          child: ListTile(
                            leading: Icon(Icons.alternate_email, color: Theme.of(context).colorScheme.primary),
                            title: Text('نام کاربری', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 12)),
                            subtitle: Text('@${_user!['username']?.toString() ?? 'تنظیم نشده'}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 16)),
                            trailing: IconButton(onPressed: _editUsername, icon: Icon(Icons.edit_outlined, color: Theme.of(context).colorScheme.primary), tooltip: 'ویرایش نام کاربری'),
                          ),
                        ),
                        _detail(Icons.badge_outlined, 'نام کامل',
                            _user!['fullName']?.toString() ?? ''),
                        _detail(Icons.email_outlined, 'ایمیل',
                            _user!['email']?.toString() ?? ''),
                        _detail(Icons.phone_outlined, 'تلفن',
                            _user!['phone']?.toString() ?? ''),
                        _detail(Icons.public_outlined, 'کشور',
                            _user!['country']?.toString() ?? ''),
                        _detail(Icons.numbers, 'شناسه کاربری',
                            _user!['id']?.toString() ?? ''),
                      ],
                      const SizedBox(height: 24),
                      OutlinedButton.icon(
                        onPressed: () {
                          widget.onLogout();
                          Navigator.of(context).pop();
                        },
                        icon: const Icon(Icons.logout),
                        label: const Text('خروج از حساب'),
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
