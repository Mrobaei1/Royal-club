import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'friends_screen.dart';
import 'account_screen.dart';
import 'notifications_screen.dart';
import 'engine_backgammon_screen.dart';
import 'services/auth_service.dart';
import 'online_lobby_screen.dart';
import 'wallet_screen.dart';
import 'admin_screen.dart';
import 'chat_screen.dart';
import 'services/chat_service.dart';
import 'services/friends_service.dart';

const List<RoyalTheme> royalThemes = [
  RoyalTheme('کهکشانی', Color(0xFF17112F), Color(0xFF251B45), Color(0xFFB9A0FF)),
  RoyalTheme('فیروزه‌ای', Color(0xFF082F3A), Color(0xFF104956), Color(0xFF55E6D0)),
  RoyalTheme('غروب مرجانی', Color(0xFF321C2B), Color(0xFF4B2937), Color(0xFFFF9B83)),
  RoyalTheme('یاقوت کبود', Color(0xFF0B1D42), Color(0xFF173263), Color(0xFF82B7FF)),
  RoyalTheme('رزگلد', Color(0xFF301D2B), Color(0xFF493041), Color(0xFFFFC1B8)),
  RoyalTheme('جنگل زمردی', Color(0xFF092D28), Color(0xFF12463B), Color(0xFF83E6AD)),
  RoyalTheme('آرکتیک روشن', Color(0xFFF0F5FA), Color(0xFFFFFFFF), Color(0xFF4269A8), dark: false),
  RoyalTheme('گرافیتی نئونی', Color(0xFF171A20), Color(0xFF252B35), Color(0xFFFFD166)),
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

class RoyalLocaleState extends ChangeNotifier {
  RoyalLocaleState() { _load(); }
  Locale _locale = const Locale('fa');
  Locale get locale => _locale;
  Future<void> _load() async {
    try {
      final saved = await AuthService.readLanguagePreference();
      if (saved == 'fa' || saved == 'en') {
        _locale = Locale(saved!);
        notifyListeners();
      }
    } catch (_) {}
  }
  Future<void> select(String languageCode) async {
    if (languageCode != 'fa' && languageCode != 'en') return;
    _locale = Locale(languageCode);
    notifyListeners();
    try { await AuthService.saveLanguagePreference(languageCode); } catch (_) {}
  }
}

final RoyalLocaleState royalLocaleState = RoyalLocaleState();
const Color navy = Color(0xFF10182B);
const Color panel = Color(0xFF17243A);
const Color gold = Color(0xFFD8B45A);

void main() => runApp(const RoyalClubApp());

class RoyalClubApp extends StatelessWidget {
  const RoyalClubApp({super.key});

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: royalThemeState,
        builder: (context, _) {
          final selected = royalThemeState.current;
          return AnimatedBuilder(
            animation: royalLocaleState,
            builder: (context, _) => MaterialApp(
            debugShowCheckedModeBanner: false,
            title: 'Royal Club',
            locale: royalLocaleState.locale,
            supportedLocales: const [Locale('fa'), Locale('en')],
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
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
          ),
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
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.workspace_premium_rounded, color: Theme.of(context).colorScheme.primary, size: 64),
              SizedBox(height: 18),
              Text('ROYAL CLUB',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.primary, fontSize: 22, fontWeight: FontWeight.w900)),
              SizedBox(height: 20),
              CircularProgressIndicator(color: Theme.of(context).colorScheme.primary),
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

class HomeScreen extends StatefulWidget {
  final VoidCallback? onLogout;
  const HomeScreen({super.key, this.onLogout});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _pendingRequests = 0;
  int _unreadMessages = 0;
  Timer? _badgeTimer;

  @override
  void initState() {
    super.initState();
    _refreshMenuBadges();
    _badgeTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _refreshMenuBadges(),
    );
  }

  @override
  void dispose() {
    _badgeTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshMenuBadges() async {
    try {
      final data = await FriendsService.list();
      final incoming = data['incomingRequests'] as List? ?? const [];
      if (mounted && _pendingRequests != incoming.length) {
        setState(() => _pendingRequests = incoming.length);
      }
    } catch (_) {
      // Keep the last known count if the connection is temporarily unavailable.
    }

    try {
      final conversations = await ChatService.conversations();
      final unread = conversations.fold<int>(0, (total, item) {
        if (item is! Map) return total;
        final count = item['unreadCount'];
        return total + (count is num ? count.toInt() : int.tryParse('$count') ?? 0);
      });
      if (mounted && _unreadMessages != unread) {
        setState(() => _unreadMessages = unread);
      }
    } catch (_) {
      // Keep the last known count if the connection is temporarily unavailable.
    }
  }

  void _showThemeMenu(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: royalThemeState.current.panel,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text('پوسته برنامه', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            for (var i = 0; i < royalThemes.length; i++)
              ListTile(
                leading: Icon(Icons.palette_outlined, color: royalThemes[i].accent),
                title: Text(royalThemes[i].name),
                trailing: i == royalThemeState.index
                    ? Icon(Icons.check_circle, color: royalThemes[i].accent)
                    : const Icon(Icons.circle_outlined),
                onTap: () {
                  royalThemeState.select(i);
                  Navigator.of(sheetContext).pop();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showLanguageMenu(BuildContext context) {
    final current = royalLocaleState.locale.languageCode;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: royalThemeState.current.panel,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text(
                'زبان برنامه / App language',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
            ),
            for (final language in const [
              ('fa', 'فارسی'),
              ('en', 'English'),
            ])
              ListTile(
                leading: Icon(
                  Icons.language_rounded,
                  color: royalThemeState.current.accent,
                ),
                title: Text(language.$2),
                trailing: current == language.$1
                    ? Icon(Icons.check_circle,
                        color: royalThemeState.current.accent)
                    : const Icon(Icons.circle_outlined),
                onTap: () {
                  royalLocaleState.select(language.$1);
                  Navigator.of(sheetContext).pop();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _openMenu(BuildContext context, String value) {
    if (value == 'themeMenu') {
      _showThemeMenu(context);
      return;
    }
    if (value == 'languageMenu') {
      _showLanguageMenu(context);
      return;
    }
    if (value.startsWith('language:')) {
      royalLocaleState.select(value.substring(9));
      return;
    }
    if (value.startsWith('theme:')) {
      final index = int.tryParse(value.substring(6));
      if (index != null) royalThemeState.select(index);
      return;
    }
    final Widget? page;
    switch (value) {
      case 'friends': page = const FriendsScreen(); break;
      case 'chat': page = const ChatScreen(); break;
      case 'notifications': page = const NotificationsScreen(); break;
      case 'account': page = AccountScreen(onLogout: widget.onLogout ?? () {}); break;
      case 'admin': page = const AdminScreen(); break;
      case 'wallet': page = const WalletScreen(); break;
      default: page = null;
    }
    if (page != null) {
      Navigator.of(context)
          .push(MaterialPageRoute<void>(builder: (_) => page!))
          .then((_) => _refreshMenuBadges());
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = royalThemeState.current;
    return Scaffold(
      backgroundColor: theme.background,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [theme.panel, theme.background],
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
                    gradient: LinearGradient(colors: [theme.accent, const Color(0xFFB89543)]),
                  ),
                  child: Icon(Icons.workspace_premium_rounded, color: theme.background, size: 29),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('ROYAL CLUB', style: TextStyle(color: theme.accent, fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: 2.2)),
                      const SizedBox(height: 3),
                      Text('THE ART OF STRATEGY', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .65), fontSize: 9, letterSpacing: 2, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  tooltip: AppLocalizations.of(context).settings,
                  icon: Icon(Icons.menu_rounded, color: theme.accent, size: 30),
                  onSelected: (value) => _openMenu(context, value),
                  itemBuilder: (context) => [
                    PopupMenuItem(value: 'account', child: ListTile(dense: true, leading: Icon(Icons.account_circle_outlined), title: Text(AppLocalizations.of(context).account))),
                    PopupMenuItem(value: 'friends', child: ListTile(dense: true, leading: Icon(Icons.people_outline), title: Text(AppLocalizations.of(context).friends, style: TextStyle(color: _pendingRequests > 0 ? Colors.redAccent : null)))),
                    PopupMenuItem(value: 'chat', child: ListTile(dense: true, leading: Icon(Icons.chat_bubble_outline), title: Text(AppLocalizations.of(context).privateChat, style: TextStyle(color: _unreadMessages > 0 ? Colors.redAccent : null)))),
                    PopupMenuItem(value: 'notifications', child: ListTile(dense: true, leading: Icon(Icons.notifications_outlined), title: Text(AppLocalizations.of(context).notifications))),
                    PopupMenuItem(value: 'wallet', child: ListTile(dense: true, leading: Icon(Icons.account_balance_wallet_outlined), title: Text(AppLocalizations.of(context).wallet))),
                    const PopupMenuItem(value: 'admin', child: ListTile(dense: true, leading: Icon(Icons.admin_panel_settings_outlined), title: Text('پنل مدیریت'))),
                    const PopupMenuDivider(),
                    const PopupMenuItem(
                      value: 'languageMenu',
                      child: ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.language_rounded),
                        title: Text('زبان برنامه / Language'),
                        trailing: Icon(Icons.chevron_left_rounded),
                      ),
                    ),
                    const PopupMenuDivider(),
                    const PopupMenuItem(
                      value: 'themeMenu',
                      child: ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.palette_outlined),
                        title: Text('پوسته برنامه'),
                        trailing: Icon(Icons.chevron_left_rounded),
                      ),
                    ),
                  ],
                ),
              ]),
              const SizedBox(height: 20),
              Divider(color: theme.accent.withValues(alpha: .65), thickness: 1, height: 1),
              const SizedBox(height: 20),
              Text(AppLocalizations.of(context).games, textDirection: royalLocaleState.locale.languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 21, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              GameTile(
                title: AppLocalizations.of(context).backgammon,
                subtitle: royalLocaleState.locale.languageCode == 'fa' ? 'بازی کلاسیک و رقابتی' : 'Classic competitive game',
                icon: Icons.casino_rounded,
                onTap: () async {
                  final mode = await showDialog<String>(
                    context: context,
                    builder: (dialogContext) => Directionality(
                      textDirection: TextDirection.rtl,
                      child: AlertDialog(
                        backgroundColor: const Color(0xFF17243A),
                        title: const Text('انتخاب حالت تخته‌نرد', style: TextStyle(color: Color(0xFFD8B45A), fontWeight: FontWeight.bold)),
                        content: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text('روش بازی را انتخاب کنید.', style: TextStyle(color: Colors.white70)),
                            const SizedBox(height: 14),
                            FilledButton.icon(
                              onPressed: () => Navigator.pop(dialogContext, 'offline'),
                              icon: const Icon(Icons.smart_toy_outlined),
                              label: const Text('بازی آفلاین با هوش مصنوعی'),
                            ),
                            const SizedBox(height: 8),
                            OutlinedButton.icon(
                              onPressed: () => Navigator.pop(dialogContext, 'online'),
                              icon: const Icon(Icons.public_rounded),
                              label: const Text('بازی آنلاین'),
                              style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFD8B45A)),
                            ),
                          ],
                        ),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('انصراف')),
                        ],
                      ),
                    ),
                  );
                  if (!context.mounted || mode == null) return;
                  Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => mode == 'online' ? const OnlineLobbyScreen() : const EngineBackgammonScreen(),
                  ));
                },
              ),
              const SizedBox(height: 12),
              GameTile(
                title: royalLocaleState.locale.languageCode == 'fa' ? 'بازی آنلاین' : 'Online play',
                subtitle: royalLocaleState.locale.languageCode == 'fa' ? 'ساخت اتاق و پیوستن به حریف' : 'Create a room or join an opponent',
                icon: Icons.public_rounded,
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OnlineLobbyScreen())),
              ),
              const SizedBox(height: 12),
              GameTile(title: AppLocalizations.of(context).chess, subtitle: royalLocaleState.locale.languageCode == 'fa' ? 'به‌زودی' : 'Coming soon', icon: Icons.grid_4x4_rounded, comingSoon: true),
              const SizedBox(height: 12),
              GameTile(title: AppLocalizations.of(context).cardGames, subtitle: royalLocaleState.locale.languageCode == 'fa' ? 'به‌زودی' : 'Coming soon', icon: Icons.style_rounded, comingSoon: true),
              const SizedBox(height: 26),
              const Center(child: Text('ROYAL CLUB  •  PLAY WITH HONOUR',
                style: TextStyle(color: Color(0xFF77839A), fontSize: 9, letterSpacing: 1.5, fontWeight: FontWeight.w600))),
            ],
          ),
        ),
      ),
    );
  }
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
  Widget build(BuildContext context) {
    final selectedTheme = royalThemeState.current;
    return Material(
        color: selectedTheme.panel,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(22),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 17),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: selectedTheme.accent.withValues(alpha: .22)),
            ),
            child: Row(children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: selectedTheme.accent.withValues(alpha: .10),
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(color: selectedTheme.accent.withValues(alpha: .25)),
                ),
                child: Icon(icon, color: selectedTheme.accent, size: 27),
              ),
              const SizedBox(width: 15),
              Expanded(
                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      textDirection: TextDirection.rtl,
                      style: TextStyle(
                          color: selectedTheme.dark ? Colors.white : const Color(0xFF182033),
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
                Text('SOON',
                    style: TextStyle(
                        color: selectedTheme.accent,
                        fontSize: 9,
                        letterSpacing: 1,
                        fontWeight: FontWeight.bold))
              else
                Icon(Icons.arrow_forward_ios_rounded,
                    color: selectedTheme.accent, size: 15),
            ]),
          ),
        ),
      );
  }
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
      final password = await AuthService.rememberedPassword();
      if (!mounted) return;
      if (email != null && email.isNotEmpty) {
        _email.text = email;
        _rememberMe = true;
      }
      if (password != null && password.isNotEmpty) {
        _password.text = password;
        _rememberMe = true;
        _register = false;
      }
    } catch (_) {
      // If secure storage is unavailable, allow manual sign-in.
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
        await AuthService.setRememberedCredentials(
            _email.text, _password.text, _rememberMe);
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
        appBar: AppBar(title: Text(AppLocalizations.of(context).account)),
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
                    segments: [
                      ButtonSegment(value: false, label: Text(AppLocalizations.of(context).login)),
                      ButtonSegment(value: true, label: Text(AppLocalizations.of(context).register)),
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
                      decoration: InputDecoration(labelText: AppLocalizations.of(context).fullName, border: const OutlineInputBorder(), prefixIcon: const Icon(Icons.person_outline))),
                    const SizedBox(height: 14),
                    TextField(controller: _phone, keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: InputDecoration(labelText: AppLocalizations.of(context).phone, hintText: '+49 123 456789', border: const OutlineInputBorder(), prefixIcon: const Icon(Icons.phone_outlined))),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<String>(initialValue: _country,
                      decoration: InputDecoration(labelText: AppLocalizations.of(context).country, border: const OutlineInputBorder(), prefixIcon: const Icon(Icons.public_outlined)),
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
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).email,
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.email_outlined),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).password,
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (!_register) ...[
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _rememberMe,
                      controlAffinity: ListTileControlAffinity.leading,
                      title: Text(AppLocalizations.of(context).rememberMe),
                      subtitle: const Text(
                          'نام کاربری و رمز عبور به‌صورت امن روی دستگاه ذخیره می‌شوند.'),
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
