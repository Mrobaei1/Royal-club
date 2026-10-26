import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';
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

  Future<void> _editUsername() async {
    final controller = TextEditingController(text: _user?['username']?.toString() ?? '');
    final picked = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _accountPanel,
        title: Text(AppLocalizations.of(context)!.editUsername),
        content: TextField(controller: controller, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.username, hintText: 'royal_player7', prefixText: '@', helperText: AppLocalizations.of(context)!.usernameRules)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context)!.cancel)),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: Text(AppLocalizations.of(context)!.save)),
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
  Widget _detail(IconData icon, String label, String value) => Card(
        color: _accountPanel,
        child: ListTile(
          leading: Icon(icon, color: _accountGold),
          title: Text(label,
              style: const TextStyle(color: Colors.white60, fontSize: 12)),
          subtitle: Text(value.isEmpty ? AppLocalizations.of(context)!.notSet : value,
              style: const TextStyle(color: Colors.white, fontSize: 15)),
        ),
      );

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
        child: Scaffold(
          backgroundColor: _accountNavy,
          appBar: AppBar(
            title: Text(AppLocalizations.of(context)!.accountTitle),
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
                      Text(AppLocalizations.of(context)!.accountInfo,
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
                            title: Text(AppLocalizations.of(context)!.username, style: TextStyle(color: Colors.white60, fontSize: 12)),
                            subtitle: Text('@${_user!['username']?.toString() ?? AppLocalizations.of(context)!.notSet}', style: const TextStyle(color: Colors.white, fontSize: 16)),
                            trailing: IconButton(onPressed: _editUsername, icon: const Icon(Icons.edit_outlined, color: _accountGold), tooltip: AppLocalizations.of(context)!.editUsernameTooltip),
                          ),
                        ),
                        _detail(Icons.badge_outlined, AppLocalizations.of(context)!.fullNameLabel,
                            _user!['fullName']?.toString() ?? ''),
                        _detail(Icons.email_outlined, AppLocalizations.of(context)!.emailLabel,
                            _user!['email']?.toString() ?? ''),
                        _detail(Icons.phone_outlined, AppLocalizations.of(context)!.phoneLabel,
                            _user!['phone']?.toString() ?? ''),
                        _detail(Icons.public_outlined, AppLocalizations.of(context)!.countryLabel,
                            _user!['country']?.toString() ?? ''),
                        _detail(Icons.numbers, AppLocalizations.of(context)!.userIdLabel,
                            _user!['id']?.toString() ?? ''),
                      ],
                      const SizedBox(height: 24),
                      OutlinedButton.icon(
                        onPressed: () {
                          widget.onLogout();
                          Navigator.of(context).pop();
                        },
                        icon: const Icon(Icons.logout),
                        label: Text(AppLocalizations.of(context)!.logout),
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
