import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'services/auth_service.dart';

const _accountGold = Color(0xFFD8B45A);
const _accountNavy = Color(0xFF10182B);
const _accountPanel = Color(0xFF17243A);

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
        backgroundColor: _accountPanel,
        title: const Text('تغییر نام کاربری'),
        content: TextField(controller: controller, textDirection: TextDirection.ltr, decoration: const InputDecoration(labelText: 'نام کاربری', hintText: 'royal_player7', prefixText: '@', helperText: '۳ تا ۲۴ حرف؛ حروف انگلیسی، عدد، نقطه یا زیرخط')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: const Text('ذخیره')),
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
        setState(() => _error = 'حجم تصویر انتخابی زیاد است؛ لطفاً تصویر کوچک‌تری انتخاب کنید.');
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
          backgroundColor: _accountPanel,
          backgroundImage: bytes == null ? null : MemoryImage(bytes),
          child: bytes == null
              ? const Icon(Icons.account_circle_outlined, color: _accountGold, size: 76)
              : null,
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _avatarSaving ? null : _pickAvatar,
          icon: _avatarSaving
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.photo_library_outlined),
          label: Text(_avatarSaving ? 'در حال ذخیره تصویر...' : 'انتخاب عکس پروفایل'),
          style: OutlinedButton.styleFrom(foregroundColor: _accountGold, side: const BorderSide(color: _accountGold)),
        ),
      ],
    );
  }

  Widget _detail(IconData icon, String label, String value) => Card(
        color: _accountPanel,
        child: ListTile(
          leading: Icon(icon, color: _accountGold),
          title: Text(label,
              style: const TextStyle(color: Colors.white60, fontSize: 12)),
          subtitle: Text(value.isEmpty ? 'ثبت نشده' : value,
              style: const TextStyle(color: Colors.white, fontSize: 15)),
        ),
      );

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: _accountNavy,
          appBar: AppBar(
            title: const Text('حساب کاربری'),
            backgroundColor: _accountNavy,
            foregroundColor: _accountGold,
          ),
          body: SafeArea(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: _accountGold))
                : ListView(
                    padding: const EdgeInsets.all(18),
                    children: [
                      _avatar(),
                      const SizedBox(height: 10),
                      const Text('اطلاعات حساب',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              color: _accountGold,
                              fontSize: 22,
                              fontWeight: FontWeight.bold)),
                      const SizedBox(height: 20),
                      if (_error != null)
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.redAccent)),
                      if (_user != null) ...[
                        Card(
                          color: _accountPanel,
                          child: ListTile(
                            leading: const Icon(Icons.alternate_email, color: _accountGold),
                            title: const Text('نام کاربری', style: TextStyle(color: Colors.white60, fontSize: 12)),
                            subtitle: Text('@${_user!['username']?.toString() ?? 'تنظیم نشده'}', style: const TextStyle(color: Colors.white, fontSize: 16)),
                            trailing: IconButton(onPressed: _editUsername, icon: const Icon(Icons.edit_outlined, color: _accountGold), tooltip: 'ویرایش نام کاربری'),
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
                          foregroundColor: _accountGold,
                          side: const BorderSide(color: _accountGold),
                          padding: const EdgeInsets.all(14),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      );
}
