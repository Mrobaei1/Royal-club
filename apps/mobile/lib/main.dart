import 'dart:convert';
import 'package:flutter/material.dart';
import 'friends_screen.dart';
import 'account_screen.dart';
import 'notifications_screen.dart';
import 'engine_backgammon_screen.dart';
import 'services/auth_service.dart';
import 'online_lobby_screen.dart';
import 'wallet_screen.dart';
import 'admin_screen.dart';
import 'chat_screen.dart';

const List<RoyalTheme> royalThemes = [
  RoyalTheme('سلطنتی', Color(0xFF10182B), Color(0xFF17243A), Color(0xFFD8B45A)),
  RoyalTheme('زمردی', Color(0xFF092B27), Color(0xFF12443B), Color(0xFF70D6A4)),
  RoyalTheme('اقیانوسی', Color(0xFF0B1D35), Color(0xFF15365A), Color(0xFF72C9F8)),
  RoyalTheme('یاقوتی', Color(0xFF2B1020), Color(0xFF481B32), Color(0xFFFF91B5)),
  RoyalTheme('روشن', Color(0xFFF1F3F7), Color(0xFFFFFFFF), Color(0xFF8A6420), dark: false),
];

class RoyalTheme {
  final String name;
  final Color background;
  final Color panel;
  final Color accent;
  final bool dark;
  const RoyalTheme(this.name, this.background, this.panel, this.accent, {this.dark = true});
}

class RoyalThemeState extends ChangeNotifier {
  RoyalThemeState() { _load(); }
  int index = 0;
  RoyalTheme get current => royalThemes[index];
  Future<void> _load() async {
    try {
      final value = await AuthService.readThemePreference();
      if (value != null && value >= 0 && value < royalThemes.length) {
        index = value;
        notifyListeners();
      }
    } catch (_) {}
  }
  Future<void> select(int value) async {
    if (value < 0 || value >= royalThemes.length) return;
    index = value;
    notifyListeners();
    await AuthService.saveThemePreference(value);
  }
}

final RoyalThemeState royalThemeState = RoyalThemeState();
Color get navy => royalThemeState.current.background;
Color get panel => royalThemeState.current.panel;
Color get gold => royalThemeState.current.accent;

void main() => runApp(const RoyalClubApp());

class RoyalClubApp extends StatelessWidget {
  const RoyalClubApp({super.key});

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: royalThemeState,
        builder: (context, _) {
          final selected = royalThemeState.current;
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            title: 'Royal Club',
            theme: ThemeData(
              useMaterial3: true,
              brightness: selected.dark ? Brightness.dark : Brightness.light,
              scaffoldBackgroundColor: selected.background,
              colorScheme: ColorScheme.fromSeed(
                seedColor: selected.accent,
                brightness: selected.dark ? Brightness.dark : Brightness.light,
                surface: selected.panel,
              ),
              appBarTheme: AppBarTheme(
                backgroundColor: selected.background,
                foregroundColor: selected.accent,
              ),
              cardTheme: CardThemeData(color: selected.panel),
            ),
            home: const AuthGate(),
          );
        },
      );
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _checking = true;
  bool _authenticated = false;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    var valid = false;
    try {
      await AuthService.me();
      valid = true;
    } catch (_) {
      // توکن وجود ندارد یا نشست دیگر معتبر نیست.
    }
    if (!mounted) return;
    setState(() {
      _authenticated = valid;
      _checking = false;
    });
  }

  void _onAuthenticated() {
    if (!mounted) return;
    setState(() => _authenticated = true);
  }

  void _onLogout() {
    AuthService.logout().then((_) {
      if (mounted) setState(() => _authenticated = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        backgroundColor: navy,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.workspace_premium_rounded, color: gold, size: 64),
              SizedBox(height: 18),
              Text('ROYAL CLUB',
                  style: TextStyle(
                      color: gold, fontSize: 22, fontWeight: FontWeight.w900)),
              SizedBox(height: 20),
              CircularProgressIndicator(color: gold),
              SizedBox(height: 12),
              Text('در حال بررسی نشست قبلی...',
                  style: TextStyle(color: Colors.white70)),
            ],
          ),
        ),
      );
    }
    return _authenticated
        ? HomeScreen(onLogout: _onLogout)
        : AuthScreen(onAuthenticated: _onAuthenticated, initialRegister: true);
  }
}

class HomeScreen extends StatelessWidget {
  final VoidCallback? onLogout;
  const HomeScreen({super.key, this.onLogout});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF17243A), Color(0xFF0B1020)],
            ),
          ),
          child: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
              children: [
                Row(children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(15),
                      gradient: const LinearGradient(
                        colors: [gold, Color(0xFFB89543)],
                      ),
                    ),
                    child: const Icon(Icons.workspace_premium_rounded,
                        color: navy, size: 29),
                  ),
                  const SizedBox(width: 13),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('ROYAL CLUB',
                            style: TextStyle(
                                color: gold,
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 2.2)),
                        SizedBox(height: 3),
                        Text('THE ART OF STRATEGY',
                            style: TextStyle(
                                color: Color(0xFFB9C2D3),
                                fontSize: 9,
                                letterSpacing: 2,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
                    decoration: BoxDecoration(
                      border: Border.all(color: gold.withValues(alpha: .4)),
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: const Row(children: [
                      Icon(Icons.circle, color: gold, size: 7),
                      SizedBox(width: 6),
                      Text('ONLINE',
                          style: TextStyle(
                              color: gold,
                              fontSize: 9,
                              letterSpacing: 1.1,
                              fontWeight: FontWeight.bold)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 18),
                const SizedBox(height: 27),                const Row(children: [
                  Expanded(
                      child: Text('بازی‌ها',
                          textDirection: TextDirection.rtl,
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 21,
                              fontWeight: FontWeight.w800))),
                ]),
                const SizedBox(height: 14),
                GameTile(
                    title: 'تخته‌نرد',
                    subtitle: 'بازی کلاسیک و رقابتی',
                    icon: Icons.casino_rounded,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const EngineBackgammonScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'بازی آنلاین',
                    subtitle: 'ساخت اتاق و پیوستن به حریف',
                    icon: Icons.public_rounded,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const OnlineLobbyScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'دوستان',
                    subtitle: 'درخواست دوستی و مدیریت فهرست دوستان',
                    icon: Icons.people_alt_rounded,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const FriendsScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'گفت‌وگوهای خصوصی',
                    subtitle: 'پیام‌رسانی برای دوستان دارای اشتراک فعال',
                    icon: Icons.chat_bubble_outline_rounded,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const ChatScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'اعلان‌ها',
                    subtitle: 'درخواست‌های دوستی و پیام‌های سیستم',
                    icon: Icons.notifications_active_outlined,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const NotificationsScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'حساب کاربری',
                    subtitle: 'مشاهده مشخصات و خروج امن',
                    icon: Icons.account_circle_outlined,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => AccountScreen(
                                onLogout: onLogout ?? () {})))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'پنل مدیریت',
                    subtitle: 'اعتبار کاربران و قیمت اشتراک‌ها',
                    icon: Icons.admin_panel_settings_outlined,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const AdminScreen()))),
                const SizedBox(height: 12),
                GameTile(
                    title: 'کیف پول و اشتراک',
                    subtitle: 'موجودی اعتبار و مدیریت اشتراک ویژه',
                    icon: Icons.account_balance_wallet_outlined,
                    onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const WalletScreen()))),
                const SizedBox(height: 12),
                const GameTile(
                    title: 'شطرنج',
                    subtitle: 'به‌زودی',
                    icon: Icons.grid_4x4_rounded,
                    comingSoon: true),
                const SizedBox(height: 12),
                const GameTile(
                    title: 'بازی‌های کارتی',
                    subtitle: 'به‌زودی',
                    icon: Icons.style_rounded,
                    comingSoon: true),
                const SizedBox(height: 26),
                const SizedBox(height: 30),
                const SizedBox(height: 24),
                const Center(
                    child: Text('ROYAL CLUB  •  PLAY WITH HONOUR',
                        style: TextStyle(
                            color: Color(0xFF77839A),
                            fontSize: 9,
                            letterSpacing: 1.5,
                            fontWeight: FontWeight.w600))),
              ],
            ),
          ),
        ),
      );
}

class GameTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final bool comingSoon;

  const GameTile(
      {super.key,
      required this.title,
      required this.subtitle,
      required this.icon,
      this.onTap,
      this.comingSoon = false});

  @override
  Widget build(BuildContext context) => Material(
        color: panel,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: gold.withValues(alpha: .22)),
            ),
            child: Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: gold.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(color: gold.withValues(alpha: .25)),
                ),
                child: Icon(icon, color: gold, size: 27),
              ),
              const SizedBox(width: 15),
              Expanded(
                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      textDirection: TextDirection.rtl,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  Text(subtitle,
                      textDirection: TextDirection.rtl,
                      style: const TextStyle(
                          color: Color(0xFFAEB9CB), fontSize: 12)),
                ],
              )),
              if (comingSoon)
                const Text('SOON',
                    style: TextStyle(
                        color: gold,
                        fontSize: 9,
                        letterSpacing: 1,
                        fontWeight: FontWeight.bold))
              else
                const Icon(Icons.arrow_forward_ios_rounded,
                    color: gold, size: 15),
            ]),
          ),
        ),
      );
}

class AuthScreen extends StatefulWidget {
  final VoidCallback onAuthenticated;
  final bool initialRegister;

  const AuthScreen({
    super.key,
    required this.onAuthenticated,
    this.initialRegister = false,
  });

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  final _phone = TextEditingController();
  String _country = 'Germany';
  late bool _register = widget.initialRegister;
  bool _busy = false;
  bool _rememberMe = true;
  bool _checkingSession = true;
  String? _message;

  @override
  void initState() {
    super.initState();
    _loadRememberedEmail();
  }

  Future<void> _loadRememberedEmail() async {
    try {
      final email = await AuthService.rememberedEmail();
      if (!mounted) return;
      if (email != null && email.isNotEmpty) {
        _email.text = email;
        _rememberMe = true;
      }
    } finally {
      if (mounted) setState(() => _checkingSession = false);
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _fullName.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _message = 'ایمیل و رمز عبور را وارد کن.');
      return;
    }
    if (_register && _fullName.text.trim().isEmpty) {
      setState(() => _message = 'نام کاربر را وارد کن.');
      return;
    }
    if (_register && _phone.text.trim().isEmpty) {
      setState(() => _message = 'شماره تلفن را وارد کن.');
      return;
    }
    if (_register && _password.text.runes.length < 6) {
      setState(() => _message = 'رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (_register && utf8.encode(_password.text).length > 128) {
      setState(() => _message = 'رمز عبور نباید بیشتر از ۱۲۸ بایت باشد.');
      return;
    }

    setState(() {
      _busy = true;
      _message = null;
    });

    final wasRegister = _register;
    try {
      final result = wasRegister
          ? await AuthService.register(_email.text, _password.text,
              fullName: _fullName.text, phone: _phone.text, country: _country)
          : await AuthService.login(_email.text, _password.text);

      if (!mounted) return;

      if (result['token'] is String &&
          (result['token'] as String).isNotEmpty) {
        await AuthService.setRememberedEmail(_email.text, _rememberMe);
        if (!mounted) return;
        widget.onAuthenticated();
      } else if (wasRegister) {
        setState(() {
          _register = false;
          _message = 'ثبت‌نام انجام شد. برای ورود، رمز عبور را دوباره وارد کنید.';
        });
      } else {
        setState(() => _message = 'ورود انجام شد، اما توکن دریافت نشد.');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('حساب کاربری')),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.workspace_premium_rounded,
                      color: gold, size: 64),
                  const SizedBox(height: 12),
                  const Text('ROYAL CLUB',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: gold,
                          fontSize: 24,
                          fontWeight: FontWeight.w900)),
                  const SizedBox(height: 28),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('ورود')),
                      ButtonSegment(value: true, label: Text('ثبت‌نام')),
                    ],
                    selected: {_register},
                    onSelectionChanged: (v) => setState(() {
                      _register = v.first;
                      _message = null;
                    }),
                  ),
                  const SizedBox(height: 20),
                  if (_register) ...[
                    TextField(controller: _fullName, textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.name],
                      decoration: const InputDecoration(labelText: 'نام و نام خانوادگی', border: OutlineInputBorder(), prefixIcon: Icon(Icons.person_outline))),
                    const SizedBox(height: 14),
                    TextField(controller: _phone, keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: const InputDecoration(labelText: 'شماره تلفن', hintText: '+49 123 456789', border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone_outlined))),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(initialValue: _country,
                      decoration: const InputDecoration(labelText: 'کشور', border: OutlineInputBorder(), prefixIcon: Icon(Icons.public_outlined)),
                      items: const [
                        DropdownMenuItem(value: 'Germany', child: Text('آلمان')),
                        DropdownMenuItem(value: 'Iran', child: Text('ایران')),
                        DropdownMenuItem(value: 'United States', child: Text('ایالات متحده')),
                        DropdownMenuItem(value: 'United Kingdom', child: Text('بریتانیا')),
                        DropdownMenuItem(value: 'Turkey', child: Text('ترکیه')),
                        DropdownMenuItem(value: 'United Arab Emirates', child: Text('امارات متحده عربی')),
                        DropdownMenuItem(value: 'Other', child: Text('سایر کشورها')),
                      ], onChanged: _busy ? null : (value) { if (value != null) setState(() => _country = value); }),
                    const SizedBox(height: 14),
                  ],
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                      labelText: 'ایمیل',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.email_outlined),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: _register ? 'رمز عبور (حداقل ۶ کاراکتر)' : 'رمز عبور',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (!_register) ...[
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _rememberMe,
                      controlAffinity: ListTileControlAffinity.leading,
                      title: const Text('مرا به خاطر بسپار'),
                      subtitle: const Text(
                          'ایمیل ذخیره می‌شود و نشست معتبر حفظ خواهد شد.'),
                      onChanged: _busy
                          ? null
                          : (value) =>
                              setState(() => _rememberMe = value ?? false),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (_checkingSession)
                    const Padding(
                      padding: EdgeInsets.all(8),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _busy || _checkingSession ? null : _submit,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: _busy
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_register ? 'ایجاد حساب' : 'ورود به حساب'),
                    ),
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: 16),
                    Text(_message!, textAlign: TextAlign.center),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
}
