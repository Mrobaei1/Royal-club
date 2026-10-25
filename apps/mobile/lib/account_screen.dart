import 'package:flutter/material.dart';
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
                      const Icon(Icons.account_circle_outlined,
                          color: _accountGold, size: 76),
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
                        onPressed: widget.onLogout,
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
