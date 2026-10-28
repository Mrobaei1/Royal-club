import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'l10n/app_localizations.dart';
import 'l10n/app_text.dart';
import 'friends_screen.dart';
import 'account_screen.dart';
import 'notifications_screen.dart';
import 'engine_backgammon_screen.dart';
import 'services/auth_service.dart';
import 'theme_state.dart';
import 'online_lobby_screen.dart';
import 'wallet_screen.dart';
import 'admin_screen.dart';
import 'contact_screen.dart';
import 'chat_screen.dart';
import 'services/chat_service.dart';
import 'services/friends_service.dart';

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
              cardTheme: CardThemeData(color: selected.panel),
              textTheme: ThemeData(brightness: selected.dark ? Brightness.dark : Brightness.light).textTheme.apply(bodyColor: selected.dark ? Colors.white : Colors.black, displayColor: selected.dark ? Colors.white : Colors.black),
              primaryTextTheme: ThemeData(brightness: selected.dark ? Brightness.dark : Brightness.light).primaryTextTheme.apply(bodyColor: selected.dark ? Colors.white : Colors.black, displayColor: selected.dark ? Colors.white : Colors.black),
              iconTheme: IconThemeData(color: selected.dark ? Colors.white : Colors.black),
              appBarTheme: AppBarTheme(backgroundColor: selected.background, foregroundColor: selected.dark ? selected.accent : Colors.black, titleTextStyle: TextStyle(color: selected.dark ? selected.accent : Colors.black, fontSize: 20, fontWeight: FontWeight.w600)),
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
              Text(appText(context, 'در حال بررسی نشست قبلی...', 'Checking previous session...'),
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
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
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: SizedBox(height: MediaQuery.sizeOf(sheetContext).height * 0.72,
          child: Column(children: [
            Padding(padding: const EdgeInsets.fromLTRB(20, 4, 20, 12), child: Text(appText(context, 'پوسته برنامه', 'App theme'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            Expanded(child: ListView.builder(itemCount: royalThemes.length, itemBuilder: (context, i) => ListTile(
              leading: Icon(Icons.palette_outlined, color: royalThemes[i].accent),
              title: Text(royalThemes[i].localizedName(context), style: TextStyle(color: royalThemes[i].dark ? Colors.white : Colors.black)),
              trailing: i == royalThemeState.index ? Icon(Icons.check_circle, color: royalThemes[i].accent) : Icon(Icons.circle_outlined, color: royalThemeState.current.dark ? Colors.white70 : Colors.black54),
              onTap: () { royalThemeState.select(i); Navigator.of(sheetContext).pop(); },
            ))),
          ]),
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
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text(
                appText(context, 'زبان برنامه', 'App language'),
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
      case 'contact': page = const ContactScreen(); break;
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
    final isEnglish = royalLocaleState.locale.languageCode == 'en';
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
                      Text(AppLocalizations.of(context).strategyTagline, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .65), fontSize: 9, letterSpacing: 2, fontWeight: FontWeight.w600)),
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
                    PopupMenuItem(value: 'admin', child: ListTile(dense: true, leading: Icon(Icons.admin_panel_settings_outlined), title: Text(appText(context, 'پنل مدیریت', 'Admin panel')))),
                    PopupMenuItem(value: 'contact', child: ListTile(dense: true, leading: Icon(Icons.contact_support_outlined), title: Text(appText(context, 'ارتباط با ما', 'Contact us')))),
                    const PopupMenuDivider(),
                    PopupMenuItem(
                      value: 'languageMenu',
                      child: ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.language_rounded),
                        title: Text(appText(context, 'زبان برنامه', 'App language')),
                        trailing: Icon(Icons.chevron_left_rounded),
                      ),
                    ),
                    const PopupMenuDivider(),
                    PopupMenuItem(
                      value: 'themeMenu',
                      child: ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.palette_outlined),
                        title: Text(appText(context, 'پوسته برنامه', 'App theme')),
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
                      textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
                      child: AlertDialog(
                        backgroundColor: Theme.of(dialogContext).colorScheme.surface,
                        title: Text(appText(dialogContext, 'انتخاب حالت تخته‌نرد', 'Choose backgammon mode'), style: TextStyle(color: Theme.of(dialogContext).colorScheme.primary, fontWeight: FontWeight.bold)),
                        content: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(appText(dialogContext, 'روش بازی را انتخاب کنید.', 'Choose how you want to play.'), style: TextStyle(color: Theme.of(dialogContext).colorScheme.onSurface.withValues(alpha: 0.7))),
                            const SizedBox(height: 14),
                            FilledButton.icon(
                              onPressed: () => Navigator.pop(dialogContext, 'offline'),
                              icon: const Icon(Icons.smart_toy_outlined),
                              label: Text(isEnglish ? 'Offline vs AI' : 'بازی آفلاین با هوش مصنوعی'),
                            ),
                            const SizedBox(height: 8),
                            OutlinedButton.icon(
                              onPressed: () => Navigator.pop(dialogContext, 'online'),
                              icon: const Icon(Icons.public_rounded),
                              label: Text(isEnglish ? 'Online game' : 'بازی آنلاین'),
                              style: OutlinedButton.styleFrom(foregroundColor: Theme.of(dialogContext).colorScheme.primary),
                            ),
                          ],
                        ),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(isEnglish ? 'Cancel' : 'انصراف')),
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
              GameTile(title: AppLocalizations.of(context).chess, subtitle: AppLocalizations.of(context).comingSoon, icon: Icons.grid_4x4_rounded, comingSoon: true),
              const SizedBox(height: 12),
              GameTile(title: AppLocalizations.of(context).cardGames, subtitle: royalLocaleState.locale.languageCode == 'fa' ? 'به‌زودی' : 'Coming soon', icon: Icons.style_rounded, comingSoon: true),
              const SizedBox(height: 26),
              Center(child: Text('${AppLocalizations.of(context).appTitle}  •  ${AppLocalizations.of(context).playWithHonour}',
                style: TextStyle(color: Color(0xFF77839A), fontSize: 9, letterSpacing: 1.5, fontWeight: FontWeight.w600))),
              const SizedBox(height: 10),
              Center(child: Text(appText(context, 'نسخه 1.1.9', 'Version 1.1.9'),
                style: TextStyle(color: Color(0xFF77839A), fontSize: 11, fontWeight: FontWeight.w600))),
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
                          color: selectedTheme.dark ? Colors.white : Colors.black,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 5),
                  Text(subtitle,
                      textDirection: TextDirection.rtl,
                      style: TextStyle(
                          color: selectedTheme.dark ? Colors.white70 : Colors.black54, fontSize: 12)),
                ],
              )),
              if (comingSoon)
                Text(AppLocalizations.of(context).comingSoon.toUpperCase(),
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
  final _otpCode = TextEditingController();
  late bool _register = widget.initialRegister;
  bool _phoneOtpAvailable = false;
  bool _usePhoneOtp = false;
  bool _otpRequested = false;
  bool _busy = false;
  bool _rememberMe = true;
  bool _checkingSession = true;
  String? _message;

  @override
  void initState() {
    super.initState();
    _loadRememberedEmail();
    _loadPhoneOtpStatus();
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
    _otpCode.dispose();
    super.dispose();
  }

  Future<void> _loadPhoneOtpStatus() async {
    try {
      final status = await AuthService.phoneOtpStatus();
      if (mounted) setState(() => _phoneOtpAvailable = status['available'] == true);
    } catch (_) {
      if (mounted) setState(() => _phoneOtpAvailable = false);
    }
  }

  Future<void> _requestPhoneOtp() async {
    if (_phone.text.trim().isEmpty) {
      setState(() => _message = appText(context, 'شماره موبایل ایران را وارد کنید.', 'Enter an Iranian mobile number.'));
      return;
    }
    if (_register && (_email.text.trim().isEmpty || _password.text.isEmpty || _fullName.text.trim().isEmpty)) {
      setState(() => _message = appText(context, 'نام، ایمیل و رمز عبور را قبل از دریافت کد وارد کنید.', 'Enter your name, email, and password before requesting a code.'));
      return;
    }
    if (_register && (_password.text.runes.length < 6 || utf8.encode(_password.text).length > 128)) {
      setState(() => _message = appText(context, 'رمز عبور باید حداقل ۶ کاراکتر و حداکثر ۱۲۸ بایت باشد.', 'Password must be at least 6 characters and at most 128 bytes.'));
      return;
    }
    setState(() { _busy = true; _message = null; });
    try {
      final result = await AuthService.requestPhoneOtp(
        phone: _phone.text,
        purpose: _register ? 'register' : 'login',
      );
      if (!mounted) return;
      setState(() {
        _otpRequested = true;
        final testCode = result['testCode']?.toString();
        _message = testCode == null
            ? appText(context, 'اگر شماره قابل تأیید باشد، کد ارسال می‌شود.', 'If the number is eligible, a verification code will be sent.')
            : appText(context, 'کد آزمایشی توسعه: $testCode', 'Development test code: $testCode');
      });
    } catch (e) {
      if (mounted) setState(() => _message = appError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitPhoneOtp() async {
    if (!_otpRequested) {
      await _requestPhoneOtp();
      return;
    }
    if (!RegExp(r'^\\d{6}    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _message = appText(context, 'ایمیل و رمز عبور را وارد کن.', 'Enter your email and password.'));
      return;
    }
    if (_register && _fullName.text.trim().isEmpty) {
      setState(() => _message = appText(context, 'نام کاربر را وارد کن.', 'Enter your name.'));
      return;
    }
    if (_register && _phone.text.trim().isEmpty) {
      setState(() => _message = appText(context, 'شماره تلفن را وارد کن.', 'Enter your phone number.'));
      return;
    }
    if (_register && _password.text.runes.length < 6) {
      setState(() => _message = appText(context, 'رمز عبور باید حداقل ۶ کاراکتر باشد.', 'Password must be at least 6 characters.'));
      return;
    }
    if (_register && utf8.encode(_password.text).length > 128) {
      setState(() => _message = appText(context, 'رمز عبور نباید بیشتر از ۱۲۸ بایت باشد.', 'Password must not exceed 128 bytes.'));
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
              fullName: _fullName.text, phone: _phone.text, country: '')
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
          _message = appText(context, 'ثبت‌نام انجام شد. برای ورود، رمز عبور را دوباره وارد کنید.', 'Registration complete. Enter your password again to log in.');
        });
      } else {
        setState(() => _message = appText(context, 'ورود انجام شد، اما توکن دریافت نشد.', 'Login succeeded, but no token was received.'));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = appError(context, e));
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
                      _otpRequested = false;
                      _otpCode.clear();
                      _message = null;
                    }),
                  ),
                  if (_phoneOtpAvailable) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() {
                        _usePhoneOtp = !_usePhoneOtp;
                        _otpRequested = false;
                        _otpCode.clear();
                        _message = null;
                      }),
                      child: Text(_usePhoneOtp
                          ? appText(context, 'استفاده از ایمیل و رمز عبور', 'Use email and password')
                          : appText(context, 'ورود یا ثبت‌نام با کد پیامکی', 'Use phone verification code')),
                    ),
                  ],
                  const SizedBox(height: 20),
                  if (_register) ...[
                    TextField(controller: _fullName, textCapitalization: TextCapitalization.words,
                      autofillHints: const [AutofillHints.name],
                      decoration: InputDecoration(labelText: AppLocalizations.of(context).fullName, border: const OutlineInputBorder(), prefixIcon: const Icon(Icons.person_outline))),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      onChanged: (_) {
                        if (_otpRequested) setState(() { _otpRequested = false; _otpCode.clear(); });
                      },
                      decoration: InputDecoration(
                        labelText: '${AppLocalizations.of(context).phone} (${appText(context, 'بدون کد کشور', 'no country code')})',
                        hintText: appText(context, 'مثلاً 09123456789', 'e.g. 09123456789'),
                        helperText: appText(context, 'فقط شماره تلفن ایران را وارد کنید؛ کد کشور لازم نیست.', 'Enter an Iranian mobile number; no country code is needed.'),
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (_usePhoneOtp && !_register) ...[
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      onChanged: (_) {
                        if (_otpRequested) setState(() { _otpRequested = false; _otpCode.clear(); });
                      },
                      decoration: InputDecoration(
                        labelText: appText(context, 'شماره موبایل ایران', 'Iranian mobile number'),
                        hintText: appText(context, 'مثلاً 09123456789', 'e.g. 09123456789'),
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (!_usePhoneOtp || _register) TextField(
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
                  if (!_usePhoneOtp || _register) TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: AppLocalizations.of(context).password,
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (!_register && !_usePhoneOtp) ...[
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _rememberMe,
                      controlAffinity: ListTileControlAffinity.leading,
                      title: Text(AppLocalizations.of(context).rememberMe),
                      subtitle: Text(
                          appText(context, 'نام کاربری و رمز عبور به‌صورت امن روی دستگاه ذخیره می‌شوند.', 'Your username and password are stored securely on this device.')),
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
                  if (_usePhoneOtp) ...[
                    if (_otpRequested) TextField(
                      controller: _otpCode,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: InputDecoration(
                        labelText: appText(context, 'کد تأیید شش‌رقمی', 'Six-digit verification code'),
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.password_outlined),
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _busy || _checkingSession ? null : _requestPhoneOtp,
                      icon: const Icon(Icons.sms_outlined),
                      label: Text(_otpRequested
                          ? appText(context, 'ارسال دوباره کد', 'Resend code')
                          : appText(context, 'دریافت کد تأیید', 'Send verification code')),
                    ),
                  ],
                  FilledButton(
                    onPressed: _busy || _checkingSession ? null : (_usePhoneOtp ? _submitPhoneOtp : _submit),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: _busy
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(_usePhoneOtp ? (_register ? appText(context, 'تأیید کد و ایجاد حساب', 'Verify code and create account') : appText(context, 'تأیید کد و ورود', 'Verify code and log in')) : (_register ? appText(context, 'ایجاد حساب', 'Create account') : appText(context, 'ورود به حساب', 'Log in'))),
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
).hasMatch(_otpCode.text.trim())) {
      setState(() => _message = appText(context, 'کد شش‌رقمی را وارد کنید.', 'Enter the six-digit verification code.'));
      return;
    }
    setState(() { _busy = true; _message = null; });
    try {
      final wasRegister = _register;
      final result = wasRegister
          ? await AuthService.registerWithPhoneOtp(
              phone: _phone.text,
              code: _otpCode.text,
              email: _email.text,
              password: _password.text,
              fullName: _fullName.text,
              country: '',
            )
          : await AuthService.loginWithPhoneOtp(phone: _phone.text, code: _otpCode.text);
      if (!mounted) return;
      if (wasRegister) {
        await AuthService.setRememberedCredentials(_email.text, _password.text, _rememberMe);
      } else {
        await AuthService.setRememberedCredentials('', '', false);
      }
      if (!mounted) return;
      if (result['token'] is String && (result['token'] as String).isNotEmpty) {
        widget.onAuthenticated();
      } else {
        setState(() => _message = appText(context, 'ورود موفق بود، اما توکن دریافت نشد.', 'Authentication succeeded, but no token was received.'));
      }
    } catch (e) {
      if (mounted) setState(() => _message = appError(context, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _message = appText(context, 'ایمیل و رمز عبور را وارد کن.', 'Enter your email and password.'));
      return;
    }
    if (_register && _fullName.text.trim().isEmpty) {
      setState(() => _message = appText(context, 'نام کاربر را وارد کن.', 'Enter your name.'));
      return;
    }
    if (_register && _phone.text.trim().isEmpty) {
      setState(() => _message = appText(context, 'شماره تلفن را وارد کن.', 'Enter your phone number.'));
      return;
    }
    if (_register && _password.text.runes.length < 6) {
      setState(() => _message = appText(context, 'رمز عبور باید حداقل ۶ کاراکتر باشد.', 'Password must be at least 6 characters.'));
      return;
    }
    if (_register && utf8.encode(_password.text).length > 128) {
      setState(() => _message = appText(context, 'رمز عبور نباید بیشتر از ۱۲۸ بایت باشد.', 'Password must not exceed 128 bytes.'));
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
              fullName: _fullName.text, phone: _phone.text, country: '')
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
          _message = appText(context, 'ثبت‌نام انجام شد. برای ورود، رمز عبور را دوباره وارد کنید.', 'Registration complete. Enter your password again to log in.');
        });
      } else {
        setState(() => _message = appText(context, 'ورود انجام شد، اما توکن دریافت نشد.', 'Login succeeded, but no token was received.'));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _message = appError(context, e));
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
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      decoration: InputDecoration(
                        labelText: '${AppLocalizations.of(context).phone} (${appText(context, 'بدون کد کشور', 'no country code')})',
                        hintText: appText(context, 'مثلاً 09123456789', 'e.g. 09123456789'),
                        helperText: appText(context, 'فقط شماره تلفن را وارد کنید؛ کد کشور لازم نیست.', 'Enter only the phone number; no country code is needed.'),
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.phone_outlined),
                      ),
                    ),
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
                      subtitle: Text(
                          appText(context, 'نام کاربری و رمز عبور به‌صورت امن روی دستگاه ذخیره می‌شوند.', 'Your username and password are stored securely on this device.')),
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
                          : Text(_register ? appText(context, 'ایجاد حساب', 'Create account') : appText(context, 'ورود به حساب', 'Log in')),
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
