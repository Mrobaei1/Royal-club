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
  List<dynamic> _leagues = [];
  List<dynamic> _reports = [];
  List<dynamic> _permissionGrants = [];
  List<dynamic> _permissionAudit = [];
  List<dynamic> _agentTaskProposals = [];
  List<dynamic> _agentTasks = [];
  List<dynamic> _agentAudit = [];
  bool _agentAuditUnavailable = false;
  List<dynamic> _agentRoleTemplates = [];
  Map<String, dynamic>? _futureGameAgentTemplate;
  bool _agentTemplatesUnavailable = false;
  final _agentGameCode = TextEditingController();
  bool _agentProposalsUnavailable = false;
  bool _agentTasksUnavailable = false;
  final _agentTaskCode = TextEditingController();
  final _agentTaskTitle = TextEditingController();
  final _agentTaskDescription = TextEditingController();
  String _agentTaskDomain = 'operations';
  bool _agentTaskRead = true;
  bool _agentTaskRecommend = false;
  bool _delegatedPermissionsEnabled = false;
  final _usernameSearch = TextEditingController();
  final _countryFilter = TextEditingController();
  final _minBalanceFilter = TextEditingController();
  final _maxBalanceFilter = TextEditingController();
  String _subscriptionFilter = 'any';
  String _phoneFilter = 'any';
  String _notificationAudience = 'all';
  bool _showOnLogin = false;
  final Set<String> _selectedUserIds = <String>{};
  final _amount = TextEditingController(text: '100');
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _avatarChangePrice = TextEditingController(text: '0');
  final _usernameChangePrice = TextEditingController(text: '0');
  final _notificationTitle = TextEditingController();
  final _notificationBody = TextEditingController();
  List<dynamic> _users = [];
  bool _busy = false;
  bool _customizationPricingAvailable = false;
  Map<String, dynamic> _smsSettings = {};
  String _smsMode = 'disabled';
  String _smsProvider = 'kavenegar';
  final _smsSender = TextEditingController();
  final _smsTemplate = TextEditingController();
  final _smsApiKey = TextEditingController();
  final _smsTestPhone = TextEditingController();
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
    _usernameSearch.dispose();
    _countryFilter.dispose();
    _minBalanceFilter.dispose();
    _maxBalanceFilter.dispose();
    _agentTaskCode.dispose();
    _agentTaskTitle.dispose();
    _agentTaskDescription.dispose();
    _agentGameCode.dispose();
    _amount.dispose();
    _description.dispose();
    _price.dispose();
    _avatarChangePrice.dispose();
    _usernameChangePrice.dispose();
    _notificationTitle.dispose();
    _notificationBody.dispose();
    _smsSender.dispose(); _smsTemplate.dispose(); _smsApiKey.dispose(); _smsTestPhone.dispose(); _smsTtl.dispose(); _smsCooldown.dispose(); _smsAttempts.dispose(); _smsDailyLimit.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final owner = await AdminService.isOwner();
      if (!owner) {
        if (mounted) setState(() { _owner = false; _loading = false; _error = null; });
        return;
      }
      final results = await Future.wait([AdminService.plans(), AdminService.reports(), AdminService.smsOtpSettings(), AdminService.permissionSettings(), AdminService.permissionGrants(), AdminService.permissionAudit(), AdminService.leagues()]);
      if (!mounted) return;
      final sms = results[2] as Map<String, dynamic>;
      _smsSettings = sms; _smsMode = sms['deliveryMode']?.toString() ?? 'disabled';
      _smsProvider = 'kavenegar';
      _smsSender.text = sms['senderId']?.toString() ?? ''; _smsTemplate.text = sms['templateId']?.toString() ?? '';
      _smsTtl.text = (sms['otpTtlSeconds'] ?? 120).toString(); _smsCooldown.text = (sms['resendCooldownSeconds'] ?? 60).toString();
      _smsAttempts.text = (sms['maxAttempts'] ?? 5).toString(); _smsDailyLimit.text = (sms['dailyLimit'] ?? 100).toString();
      final plans = results[0] as List<dynamic>;
      final reports = results[1] as List<dynamic>;
      final permissionSettings = results[3] as Map<String, dynamic>;
      final grants = results[4] as List<dynamic>;
      final audit = results[5] as List<dynamic>;
      final leagues = results[6] as List<dynamic>;
      setState(() { _owner = true; _plans = plans; _reports = reports; _delegatedPermissionsEnabled = permissionSettings['enabled'] == true; _permissionGrants = grants; _permissionAudit = audit; _leagues = leagues; _loading = false; _error = null; });
      try {
        final customizationPricing = await AdminService.accountCustomizationPricing();
        if (mounted) {
          setState(() {
            _avatarChangePrice.text = (customizationPricing['avatarChangePriceCredits'] ?? 0).toString();
            _usernameChangePrice.text = (customizationPricing['usernameChangePriceCredits'] ?? 0).toString();
            _customizationPricingAvailable = true;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _customizationPricingAvailable = false);
      }
      await _loadAgentTaskProposals();
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = appError(context, e); });
    }
  }



  Future<void> _saveAccountCustomizationPricing() async {
    final avatarPrice = int.tryParse(_avatarChangePrice.text.trim());
    final usernamePrice = int.tryParse(_usernameChangePrice.text.trim());
    if (avatarPrice == null || usernamePrice == null ||
        avatarPrice < 0 || usernamePrice < 0 ||
        avatarPrice > 1000000000 || usernamePrice > 1000000000) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context, 'قیمت‌ها باید عدد صحیح بین صفر تا یک میلیارد باشند.', 'Prices must be whole numbers between zero and one billion.')),
      ));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.saveAccountCustomizationPricing(
        avatarChangePriceCredits: avatarPrice,
        usernameChangePriceCredits: usernamePrice,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'قیمت خدمات حساب ذخیره شد.', 'Account service prices saved.')),
        ));
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadAgentTaskProposals() async {
    try {
      final proposals = await AdminService.agentTaskProposals();
      if (mounted) setState(() { _agentTaskProposals = proposals; _agentProposalsUnavailable = false; });
    } catch (_) {
      if (mounted) setState(() { _agentTaskProposals = []; _agentProposalsUnavailable = true; });
    }
    try {
      final audit = await AdminService.agentTaskAudit();
      if (mounted) setState(() { _agentAudit = audit; _agentAuditUnavailable = false; });
    } catch (_) {
      if (mounted) setState(() { _agentAudit = []; _agentAuditUnavailable = true; });
    }
    try {
      final tasks = await AdminService.agentTasks();
      if (mounted) setState(() { _agentTasks = tasks; _agentTasksUnavailable = false; });
    } catch (_) {
      if (mounted) setState(() { _agentTasks = []; _agentTasksUnavailable = true; });
    }
    try {
      final templates = await AdminService.agentTemplates();
      if (mounted) setState(() { _agentRoleTemplates = templates; _agentTemplatesUnavailable = false; });
    } catch (_) {
      if (mounted) setState(() { _agentRoleTemplates = []; _agentTemplatesUnavailable = true; });
    }
  }

  Future<void> _loadFutureGameAgentTemplate() async {
    final gameCode = _agentGameCode.text.trim();
    if (gameCode.isEmpty) return;
    try {
      final template = await AdminService.futureGameAgentTemplate(gameCode);
      if (!mounted) return;
      setState(() => _futureGameAgentTemplate = template);
    } catch (e) {
      if (!mounted) return;
      setState(() => _futureGameAgentTemplate = null);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    }
  }

  void _applyAgentTemplate(Map<String, dynamic> template) {
    final rawCode = template['code']?.toString().trim().toLowerCase() ?? '';
    final code = rawCode.replaceAll(':', '_');
    final gameCode = template['gameCode']?.toString();
    final title = template['title']?.toString() ?? rawCode;
    final responsibility = template['responsibility']?.toString() ?? '';
    final domain = switch (rawCode) {
      'membership' => 'membership',
      'trust_safety' || 'community_moderation' => 'moderation',
      'leagues' => 'leagues',
      'wallet_audit' || 'analytics_reporting' => 'analytics',
      'deposit_review' => 'deposits',
      'customer_support' => 'membership',
      'growth_marketing' || 'content_communications' => 'marketing',
      'advertising' => 'advertising',
      _ => 'operations',
    };
    final capabilities = (template['defaultCapabilities'] as List<dynamic>? ?? const ['read'])
        .map((value) => value.toString())
        .toSet();
    setState(() {
      _agentTaskCode.text = code;
      _agentTaskTitle.text = gameCode == null ? title : '$title · $gameCode';
      _agentTaskDescription.text = gameCode == null
          ? responsibility
          : '$responsibility Game code: $gameCode';
      _agentTaskDomain = domain;
      _agentTaskRead = capabilities.contains('read');
      _agentTaskRecommend = capabilities.contains('recommend');
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(appText(context, 'قالب در فرم پیش‌نویس بارگذاری شد؛ برای ثبت، بررسی کنید.', 'Template loaded into the draft form; review it before saving.')),
    ));
  }

  Future<void> _createAgentTask() async {
    final code = _agentTaskCode.text.trim().toLowerCase();
    final title = _agentTaskTitle.text.trim();
    final description = _agentTaskDescription.text.trim();
    final capabilities = <String>[
      if (_agentTaskRead) 'read',
      if (_agentTaskRecommend) 'recommend',
    ];
    const allowedDomains = <String>{
      'membership', 'marketing', 'deposits', 'leagues', 'moderation',
      'operations', 'social', 'advertising', 'analytics',
    };
    if (!RegExp(r'^[a-z0-9_]{2,48}$').hasMatch(code) ||
        title.length < 3 || title.length > 120 ||
        !allowedDomains.contains(_agentTaskDomain) ||
        description.length > 2000 || capabilities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context,
          'کد، عنوان، حوزه و حداقل یک قابلیت مجاز را بررسی کنید.',
          'Check the code, title, domain, and select at least one allowed capability.')),
      ));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.createAgentTask(
        code: code,
        title: title,
        domain: _agentTaskDomain,
        description: description,
        requestedCapabilities: capabilities,
        requiresHumanApproval: true,
      );
      _agentTaskCode.clear();
      _agentTaskTitle.clear();
      _agentTaskDescription.clear();
      await _loadAgentTaskProposals();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context,
            'تعریف وظیفه به‌صورت پیش‌نویس ذخیره شد؛ اجرای خودکار غیرفعال است.',
            'Task definition saved as a draft; automatic execution remains disabled.')),
        ));
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rejectAgentProposal(dynamic proposal) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(context, 'رد پیشنهاد ایجنت', 'Reject agent proposal')),
        content: TextField(
          controller: reasonController,
          minLines: 2,
          maxLines: 4,
          maxLength: 500,
          decoration: InputDecoration(
            labelText: appText(context, 'دلیل رد (حداقل ۵ نویسه)', 'Reason (at least 5 characters)'),
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(
            onPressed: () {
              final value = reasonController.text.trim();
              if (value.length >= 5 && value.length <= 500) Navigator.pop(dialogContext, value);
            },
            child: Text(appText(context, 'ثبت رد', 'Confirm rejection')),
          ),
        ],
      ),
    );
    reasonController.dispose();
    if (reason == null || _busy) return;
    setState(() => _busy = true);
    try {
      await AdminService.rejectAgentTaskProposal(proposal['id'].toString(), reason);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context,
            'پیشنهاد رد و در گزارش ممیزی ثبت شد؛ اجرای ایجنت غیرفعال است.',
            'Proposal rejected and audited; agent execution remains disabled.')),
        ));
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createLeagueForGame(String gameCode) async {
    final nameController = TextEditingController();
    final minimumController = TextEditingController(text: '8');
    final daysController = TextEditingController(text: '1');
    var format = 'round_robin';
    var entryMode = 'free';
    var enabled = false;
    DateTime? startsAt;
    DateTime? endsAt;
    String dateText(DateTime? value) => value == null
        ? appText(context, 'تعیین نشده', 'Not set')
        : value.toLocal().toString().substring(0, 10);

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(appText(context, 'ایجاد لیگ مستقل', 'Create game league')),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(
                  controller: nameController,
                  maxLength: 120,
                  decoration: InputDecoration(labelText: appText(context, 'نام لیگ', 'League name')),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: format,
                  decoration: InputDecoration(labelText: appText(context, 'فرمت لیگ', 'League format')),
                  items: [
                    DropdownMenuItem(value: 'round_robin', child: Text(appText(context, 'دوره‌ای', 'Round robin'))),
                    DropdownMenuItem(value: 'swiss', child: Text(appText(context, 'سوئیسی', 'Swiss'))),
                    DropdownMenuItem(value: 'knockout', child: Text(appText(context, 'حذفی', 'Knockout'))),
                    DropdownMenuItem(value: 'groups_then_knockout', child: Text(appText(context, 'گروهی سپس حذفی', 'Groups then knockout'))),
                  ],
                  onChanged: (value) => setDialogState(() => format = value ?? 'round_robin'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: minimumController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: appText(context, 'حداقل شرکت‌کنندگان (۲ تا ۵۱۲)', 'Minimum participants (2–512)')),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: entryMode,
                  decoration: InputDecoration(labelText: appText(context, 'قانون ورود', 'Entry rule')),
                  items: [
                    DropdownMenuItem(value: 'free', child: Text(appText(context, 'رایگان', 'Free'))),
                    DropdownMenuItem(value: 'subscription_days', child: Text(appText(context, 'مصرف روز اشتراک', 'Consume subscription days'))),
                  ],
                  onChanged: (value) => setDialogState(() => entryMode = value ?? 'free'),
                ),
                if (entryMode == 'subscription_days')
                  TextField(
                    controller: daysController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: appText(context, 'روزهای مصرفی (۱ تا ۳۰)', 'Days consumed (1–30)')),
                  ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: dialogContext,
                      initialDate: startsAt ?? DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setDialogState(() => startsAt = DateTime(picked.year, picked.month, picked.day));
                  },
                  icon: const Icon(Icons.event_available_outlined),
                  label: Text('${appText(context, 'شروع لیگ', 'League starts')}: ${dateText(startsAt)}'),
                ),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: dialogContext,
                      initialDate: endsAt ?? startsAt ?? DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setDialogState(() => endsAt = DateTime(picked.year, picked.month, picked.day, 23, 59, 59, 999));
                  },
                  icon: const Icon(Icons.event_busy_outlined),
                  label: Text('${appText(context, 'پایان لیگ', 'League ends')}: ${dateText(endsAt)}'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(appText(context, 'فعال‌سازی لیگ هنگام ایجاد', 'Enable league on creation')),
                  subtitle: Text(appText(context, 'در حالت خاموش، لیگ برای کاربران نمایش داده نمی‌شود.', 'When off, the league is not visible to players.')),
                  value: enabled,
                  onChanged: (value) => setDialogState(() => enabled = value),
                ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    appText(context, 'شماره لیگ به‌صورت خودکار و مستقل برای همین بازی تخصیص داده می‌شود. ورود به لیگ از کیف پول اعتبار کم نمی‌کند.', 'The league number is allocated automatically within this game only. League entry never debits wallet credits.'),
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
            FilledButton(
              onPressed: () {
                final name = nameController.text.trim();
                final minimum = int.tryParse(minimumController.text);
                final days = int.tryParse(daysController.text) ?? 0;
                if (name.isEmpty || minimum == null || minimum < 2 || minimum > 512 ||
                    (entryMode == 'subscription_days' && (days < 1 || days > 30)) ||
                    (startsAt != null && endsAt != null && !endsAt!.isAfter(startsAt!))) {
                  return;
                }
                Navigator.pop(dialogContext, {
                  'name': name,
                  'minimum': minimum,
                  'format': format,
                  'entryMode': entryMode,
                  'days': entryMode == 'free' ? 0 : days,
                  'enabled': enabled,
                  'startsAt': startsAt?.toUtc().toIso8601String(),
                  'endsAt': endsAt?.toUtc().toIso8601String(),
                });
              },
              child: Text(appText(context, 'ایجاد لیگ', 'Create league')),
            ),
          ],
        ),
      ),
    );
    nameController.dispose();
    minimumController.dispose();
    daysController.dispose();
    if (result == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final league = await AdminService.createLeague(
        gameCode: gameCode,
        name: result['name'] as String,
        enabled: result['enabled'] as bool,
        entryMode: result['entryMode'] as String,
        subscriptionDaysCost: result['days'] as int,
        format: result['format'] as String,
        minimumParticipants: result['minimum'] as int,
        startsAt: result['startsAt'] as String?,
        endsAt: result['endsAt'] as String?,
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'لیگ شماره ${league['leagueNumber']} ثبت شد.', 'League #${league['leagueNumber']} created.')),
        ));
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editLeague(dynamic league) async {
    final nameController = TextEditingController(text: league['name']?.toString() ?? '');
    final daysController = TextEditingController(text: (league['subscriptionDaysCost'] ?? 1).toString());
    final currentRules = league['rules'] is Map ? Map<String, dynamic>.from(league['rules'] as Map) : <String, dynamic>{};
    final minParticipantsController = TextEditingController(text: (currentRules['minimumParticipants'] ?? 8).toString());
    var format = currentRules['format']?.toString() ?? 'round_robin';
    var mode = league['entryMode']?.toString() == 'subscription_days' ? 'subscription_days' : 'free';
    var enabled = league['enabled'] == true;
    DateTime? startsAt = DateTime.tryParse(league['startsAt']?.toString() ?? '')?.toLocal();
    DateTime? endsAt = DateTime.tryParse(league['endsAt']?.toString() ?? '')?.toLocal();
    String dateText(DateTime? value) => value == null
        ? appText(context, 'تعیین نشده', 'Not set')
        : value.toLocal().toString().substring(0, 10);
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(appText(context, 'تنظیم قوانین لیگ', 'Edit league rules')),
          content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nameController, decoration: InputDecoration(labelText: appText(context, 'نام لیگ', 'League name'))),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                final picked = await showDatePicker(
                  context: dialogContext,
                  initialDate: startsAt ?? DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                );
                if (picked != null) setDialogState(() => startsAt = DateTime(picked.year, picked.month, picked.day));
              },
              icon: const Icon(Icons.event_available_outlined),
              label: Text('${appText(context, 'شروع لیگ', 'League starts')}: ${dateText(startsAt)}'),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final picked = await showDatePicker(
                  context: dialogContext,
                  initialDate: endsAt ?? startsAt ?? DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime(2100),
                );
                if (picked != null) setDialogState(() => endsAt = DateTime(picked.year, picked.month, picked.day, 23, 59, 59, 999));
              },
              icon: const Icon(Icons.event_busy_outlined),
              label: Text('${appText(context, 'پایان لیگ', 'League ends')}: ${dateText(endsAt)}'),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: format,
              decoration: InputDecoration(labelText: appText(context, 'فرمت لیگ', 'League format')),
              items: [
                DropdownMenuItem(value: 'round_robin', child: Text(appText(context, 'دوره‌ای', 'Round robin'))),
                DropdownMenuItem(value: 'swiss', child: Text(appText(context, 'سوئیسی', 'Swiss'))),
                DropdownMenuItem(value: 'knockout', child: Text(appText(context, 'حذفی', 'Knockout'))),
                DropdownMenuItem(value: 'groups_then_knockout', child: Text(appText(context, 'گروهی سپس حذفی', 'Groups then knockout'))),
              ],
              onChanged: (value) => setDialogState(() => format = value ?? 'round_robin'),
            ),
            Align(alignment: AlignmentDirectional.centerStart, child: Text(appText(context, 'برنامه‌ریزی خودکار فعلاً فقط برای لیگ دوره‌ای فعال است؛ سایر فرمت‌ها به ساخت دورهای دستی نیاز دارند.', 'Automatic scheduling is currently available only for round-robin leagues; other formats require manager-created rounds.'), style: const TextStyle(fontSize: 12))),
            TextField(controller: minParticipantsController, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'حداقل شرکت‌کنندگان (۲ تا ۵۱۲)', 'Minimum participants (2–512)'))),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: mode,
              decoration: InputDecoration(labelText: appText(context, 'قانون ورود', 'Entry rule')),
              items: [
                DropdownMenuItem(value: 'free', child: Text(appText(context, 'رایگان', 'Free'))),
                DropdownMenuItem(value: 'subscription_days', child: Text(appText(context, 'مصرف روز اشتراک', 'Consume subscription days'))),
              ],
              onChanged: (value) => setDialogState(() => mode = value ?? 'free'),
            ),
            if (mode == 'subscription_days') TextField(
              controller: daysController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: appText(context, 'روزهای مصرفی (۱ تا ۳۰)', 'Days consumed (1–30)')),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(appText(context, 'فعال بودن لیگ', 'League enabled')),
              subtitle: Text(appText(context, 'لیگ فعال در فهرست بازیکنان دیده می‌شود.', 'Enabled leagues appear in the player list.')),
              value: enabled,
              onChanged: (value) => setDialogState(() => enabled = value),
            ),
            Text(appText(context, 'ورود به لیگ هرگز از کیف پول اعتبار کم نمی‌کند.', 'League entry never debits wallet credits.')),
          ])),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(dialogContext, 'انصراف', 'Cancel'))),
            FilledButton(onPressed: () {
              final name = nameController.text.trim();
              final days = int.tryParse(daysController.text) ?? 0;
              final minimum = int.tryParse(minParticipantsController.text);
              if (name.isEmpty || minimum == null || minimum < 2 || minimum > 512 ||
                  (mode == 'subscription_days' && (days < 1 || days > 30)) ||
                  (startsAt != null && endsAt != null && !endsAt!.isAfter(startsAt!))) {
                return;
              }
              Navigator.pop(dialogContext, {
                'name': name, 'enabled': enabled, 'entryMode': mode,
                'startsAt': startsAt?.toUtc().toIso8601String(),
                'endsAt': endsAt?.toUtc().toIso8601String(),
                'subscriptionDaysCost': mode == 'free' ? 0 : days,
                'rules': {
                  'format': format, 'minimumParticipants': minimum,
                  'restPolicy': 'balanced_report_actual_games',
                  'finalStagePolicy': 'manager_decides_by_format',
                  'appealDeadlineHours': 24,
                  'doubleAbsencePolicy': 'reschedule_if_possible',
                  'technicalIssuePolicy': 'reschedule_if_possible',
                },
              });
            }, child: Text(appText(context, 'ذخیره', 'Save'))),
          ],
        ),
      ),
    );
    nameController.dispose();
    daysController.dispose();
    minParticipantsController.dispose();
    if (result == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await AdminService.updateLeague(
        league['id'].toString(),
        name: result['name'] as String,
        enabled: result['enabled'] as bool,
        entryMode: result['entryMode'] as String,
        subscriptionDaysCost: result['subscriptionDaysCost'] as int,
        startsAt: result['startsAt'] as String?,
        endsAt: result['endsAt'] as String?,
        rules: Map<String, dynamic>.from(result['rules'] as Map),
      );
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'قوانین لیگ ذخیره شد.', 'League rules saved.')),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _scheduleLeague(dynamic league) async {
    final id = league['id']?.toString();
    if (id == null || id.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(context, 'ساخت برنامه مسابقات', 'Generate tournament schedule')),
        content: Text(appText(context,
          'برای لیگ دوره‌ای، برنامه همه دورها ساخته می‌شود. دور استراحت نیز ثبت خواهد شد. این کار فقط یک‌بار برای هر لیگ مجاز است.',
          'For round-robin leagues, all rounds will be generated and byes recorded. Scheduling is allowed only once per league.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(appText(context, 'ایجاد برنامه', 'Generate'))),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await AdminService.scheduleLeague(id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context,
          'برنامه ساخته شد: ${(result['rounds'] as List? ?? []).length} دور.',
          'Schedule generated: ${(result['rounds'] as List? ?? []).length} rounds.')),
      ));
      await _showLeagueReport(league);
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


  Future<void> _createManualLeagueRound(
    dynamic league,
    List<dynamic> participants,
    List<dynamic> existingRounds,
  ) async {
    final id = league['id']?.toString();
    if (id == null || id.isEmpty || participants.isEmpty) return;
    final format = (league['rules'] is Map
        ? (league['rules'] as Map)['format']?.toString()
        : 'round_robin') ?? 'round_robin';
    final options = participants.map((p) => <String, String>{
      'id': p['userId'].toString(),
      'username': p['username']?.toString() ?? p['userId'].toString(),
    }).toList();
    final nextRound = existingRounds
        .map((r) => int.tryParse(r['roundNumber']?.toString() ?? '') ?? 0)
        .fold<int>(0, (a, b) => a > b ? a : b) + 1;
    final fixtures = <Map<String, dynamic>>[];
    for (var i = 0; i < options.length; i += 2) {
      fixtures.add({
        'one': options[i]['id'],
        'two': i + 1 < options.length ? options[i + 1]['id'] : null,
        'bye': i + 1 >= options.length,
      });
    }
    final roundController = TextEditingController(text: nextRound.toString());
    var stage = 'regular';
    var managerApproved = false;
    Map<String, dynamic>? requestBody;
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => StatefulBuilder(
          builder: (context, setDialogState) => AlertDialog(
            title: Text(appText(context, 'ساخت دور دستی', 'Create manager-defined round')),
            content: SizedBox(
              width: 540,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TextField(
                      controller: roundController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(labelText: appText(context, 'شماره دور', 'Round number')),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: stage,
                      decoration: InputDecoration(labelText: appText(context, 'مرحله', 'Stage')),
                      items: [
                        DropdownMenuItem(value: 'regular', child: Text(appText(context, 'عادی', 'Regular'))),
                        if (format == 'knockout' || format == 'groups_then_knockout')
                          DropdownMenuItem(value: 'final', child: Text(appText(context, 'نهایی', 'Final'))),
                      ],
                      onChanged: (value) => setDialogState(() {
                        stage = value ?? 'regular';
                        if (stage != 'final') managerApproved = false;
                      }),
                    ),
                    if (stage == 'final')
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: managerApproved,
                        onChanged: (value) => setDialogState(() => managerApproved = value == true),
                        title: Text(appText(context, 'مرحله نهایی را صریحاً تأیید می‌کنم.', 'I explicitly approve creating the final stage.')),
                      ),
                    const Divider(),
                    Text(appText(context, 'مسابقات این دور', 'Fixtures in this round'), style: const TextStyle(fontWeight: FontWeight.bold)),
                    for (final fixture in fixtures)
                      Card(
                        margin: const EdgeInsets.symmetric(vertical: 5),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Column(
                            children: [
                              DropdownButtonFormField<String>(
                                initialValue: fixture['one'] as String?,
                                decoration: InputDecoration(labelText: appText(context, 'بازیکن اول', 'Player one')),
                                items: [
                                  for (final p in options)
                                    DropdownMenuItem(value: p['id'], child: Text('@${p['username']}')),
                                ],
                                onChanged: (value) => setDialogState(() => fixture['one'] = value),
                              ),
                              if (fixture['bye'] != true)
                                DropdownButtonFormField<String>(
                                  initialValue: fixture['two'] as String?,
                                  decoration: InputDecoration(labelText: appText(context, 'بازیکن دوم', 'Player two')),
                                  items: [
                                    for (final p in options)
                                      DropdownMenuItem(value: p['id'], child: Text('@${p['username']}')),
                                  ],
                                  onChanged: (value) => setDialogState(() => fixture['two'] = value),
                                ),
                              Row(
                                children: [
                                  Expanded(child: CheckboxListTile(
                                    contentPadding: EdgeInsets.zero,
                                    value: fixture['bye'] == true,
                                    onChanged: (value) => setDialogState(() {
                                      fixture['bye'] = value == true;
                                      if (value == true) fixture['two'] = null;
                                    }),
                                    title: Text(appText(context, 'استراحت (بدون حریف)', 'Bye (no opponent)')),
                                  )),
                                  IconButton(
                                    tooltip: appText(context, 'حذف مسابقه', 'Remove fixture'),
                                    onPressed: fixtures.length <= 1 ? null : () => setDialogState(() => fixtures.remove(fixture)),
                                    icon: const Icon(Icons.delete_outline),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        onPressed: () => setDialogState(() => fixtures.add({'one': null, 'two': null, 'bye': false})),
                        icon: const Icon(Icons.add),
                        label: Text(appText(context, 'افزودن مسابقه', 'Add fixture')),
                      ),
                    ),
                    Text(
                      appText(context, 'هر بازیکن در یک دور فقط یک‌بار می‌تواند در مسابقه یا استراحت ثبت شود. سرور تکراری‌ها را رد می‌کند.', 'A participant may appear only once per round, including a bye. The server rejects duplicate assignments.'),
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
              FilledButton(
                onPressed: () {
                  final round = int.tryParse(roundController.text);
                  final used = <String>{};
                  var valid = round != null && round >= 1 && round <= 1000 && fixtures.isNotEmpty;
                  final matches = <Map<String, dynamic>>[];
                  for (final fixture in fixtures) {
                    final one = fixture['one']?.toString();
                    final bye = fixture['bye'] == true;
                    final two = bye ? null : fixture['two']?.toString();
                    if (one == null || one.isEmpty || used.contains(one) ||
                        (!bye && (two == null || two.isEmpty || two == one || used.contains(two)))) {
                      valid = false;
                      break;
                    }
                    used.add(one);
                    if (two != null) used.add(two);
                    matches.add({'playerOneId': one, 'playerTwoId': two});
                  }
                  if (!valid || (stage == 'final' && !managerApproved)) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(appText(context, 'شماره دور، مسابقات یا تأیید مرحله نهایی معتبر نیست.', 'Check the round number, fixture assignments, and final-stage approval.')),
                    ));
                    return;
                  }
                  requestBody = {
                    'roundNumber': round,
                    'stage': stage,
                    'managerApproved': managerApproved,
                    'matches': matches,
                  };
                  Navigator.pop(dialogContext, true);
                },
                child: Text(appText(context, 'ثبت دور', 'Create round')),
              ),
            ],
          ),
        ),
      );
      if (confirmed != true || requestBody == null || !mounted) return;
      setState(() => _busy = true);
      final result = await AdminService.createLeagueRound(id, requestBody!);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context, 'دور ثبت شد؛ تعداد مسابقات: ${result['fixtureCount'] ?? 0}.', 'Round created; fixtures: ${result['fixtureCount'] ?? 0}.')),
      ));
      await _showLeagueReport(league);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      roundController.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showLeagueReport(dynamic league) async {
    final id = league['id']?.toString();
    if (id == null || id.isEmpty) return;
    setState(() => _busy = true);
    try {
      final report = await AdminService.leagueReport(id);
      if (!mounted) return;
      final participants = (report['participants'] as List? ?? const []);
      final rounds = (report['rounds'] as List? ?? const []);
      final matches = (report['matches'] as List? ?? const []);
      final appeals = (report['appeals'] as List? ?? const []);
      final format = league['rules'] is Map ? (league['rules'] as Map)['format']?.toString() ?? 'round_robin' : 'round_robin';
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(appText(context, 'گزارش لیگ: ${league['name'] ?? ''}', 'League report: ${league['name'] ?? ''}')),
          content: SizedBox(
            width: 520,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(appText(context, 'گزارش شرکت‌کنندگان', 'Participant report'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  for (final p in participants)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Text('${p['username'] ?? ''} — ${appText(context, 'بازی', 'Games')}: ${p['gamesPlayed'] ?? 0} · ${appText(context, 'استراحت', 'Byes')}: ${p['restRounds'] ?? 0}'),
                    ),
                  const Divider(),
                  Text(appText(context, 'دورها', 'Rounds'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  for (final round in rounds)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Text('${appText(context, 'دور', 'Round')} ${round['roundNumber']}: ${round['matchesResolved']}/${round['matchesTotal']}'),
                    ),
                  const Divider(),
                  Text(appText(context, 'مسابقات و رخدادها', 'Matches and incidents'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  if (matches.isEmpty) Text(appText(context, 'هنوز مسابقه‌ای زمان‌بندی نشده است.', 'No matches scheduled yet.')),
                  for (final match in matches)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('#${match['id']} · ${match['playerOneUsername'] ?? '—'} vs ${match['playerTwoUsername'] ?? appText(context, 'استراحت', 'Bye')}'),
                          Text('${match['status']} ${match['replacementAt'] == null ? '' : '· ${match['replacementAt']}'}'),
                          if (match['status'] == 'scheduled' || match['status'] == 'in_progress')
                            Wrap(
                              spacing: 4,
                              children: [
                                TextButton(
                                  onPressed: () => _setLeagueMatchStatus(dialogContext, match, status: 'completed', winnerId: match['playerOneId']?.toString()),
                                  child: Text(appText(context, 'برد نفر اول', 'Player 1 wins')),
                                ),
                                if (match['playerTwoId'] != null)
                                  TextButton(
                                    onPressed: () => _setLeagueMatchStatus(dialogContext, match, status: 'completed', winnerId: match['playerTwoId']?.toString()),
                                    child: Text(appText(context, 'برد نفر دوم', 'Player 2 wins')),
                                  ),
                                TextButton(
                                  onPressed: () => _setLeagueMatchStatus(dialogContext, match, status: 'double_absent', incidentNote: 'Both participants absent; replacement time to be arranged if possible.'),
                                  child: Text(appText(context, 'غیبت دوطرفه', 'Both absent')),
                                ),
                                TextButton(
                                  onPressed: () => _setLeagueMatchStatus(dialogContext, match, status: 'technical_issue', incidentNote: 'Technical interruption; replacement time to be arranged if possible.'),
                                  child: Text(appText(context, 'اختلال فنی', 'Technical issue')),
                                ),
                              ],
                            ),
                          if (match['status'] == 'double_absent' || match['status'] == 'technical_issue')
                            TextButton(
                              onPressed: () => _rescheduleLeagueMatch(dialogContext, match),
                              child: Text(appText(context, 'تعیین زمان جایگزین', 'Set replacement time')),
                            ),
                        ],
                      ),
                    ),
                  const Divider(),
                  Text(appText(context, 'اعتراض‌ها', 'Appeals'), style: const TextStyle(fontWeight: FontWeight.bold)),
                  if (appeals.isEmpty)
                    Text(appText(context, 'اعتراضی ثبت نشده است.', 'No appeals submitted.')),
                  for (final appeal in appeals)
                    if (appeal['status'] == 'open')
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${appeal['appellantUsername'] ?? ''} · ${appText(context, 'مسابقه', 'Match')} ${appeal['matchId']}'),
                            Text(appeal['reason']?.toString() ?? ''),
                            Wrap(
                              spacing: 8,
                              children: [
                                TextButton(
                                  onPressed: () async {
                                    try {
                                      await AdminService.resolveLeagueAppeal(appeal['id'].toString(), status: 'accepted');
                                      if (!dialogContext.mounted) return;
                                      Navigator.pop(dialogContext);
                                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'اعتراض پذیرفته شد.', 'Appeal accepted.'))));
                                    } catch (e) {
                                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
                                    }
                                  },
                                  child: Text(appText(context, 'پذیرش', 'Accept')),
                                ),
                                TextButton(
                                  onPressed: () async {
                                    try {
                                      await AdminService.resolveLeagueAppeal(appeal['id'].toString(), status: 'rejected');
                                      if (!dialogContext.mounted) return;
                                      Navigator.pop(dialogContext);
                                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'اعتراض رد شد.', 'Appeal rejected.'))));
                                    } catch (e) {
                                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
                                    }
                                  },
                                  child: Text(appText(context, 'رد', 'Reject')),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                ],
              ),
            ),
          ),
          actions: [
            if (format != 'round_robin')
              TextButton.icon(
                onPressed: participants.isEmpty ? null : () {
                  Navigator.pop(dialogContext);
                  _createManualLeagueRound(league, participants, rounds);
                },
                icon: const Icon(Icons.add),
                label: Text(appText(context, 'ساخت دور دستی', 'Create manual round')),
              ),
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'بستن', 'Close'))),
          ],
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setLeagueMatchStatus(
    BuildContext dialogContext,
    dynamic match, {
    required String status,
    String? winnerId,
    String? incidentNote,
    String? replacementAt,
  }) async {
    try {
      await AdminService.updateLeagueMatch(
        match['id'].toString(),
        status: status,
        winnerId: winnerId,
        incidentNote: incidentNote,
        replacementAt: replacementAt,
      );
      if (!dialogContext.mounted) return;
      Navigator.pop(dialogContext);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'وضعیت مسابقه ذخیره شد.', 'Match status saved.')),
        ));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    }
  }

  Future<void> _rescheduleLeagueMatch(BuildContext dialogContext, dynamic match) async {
    final controller = TextEditingController(
      text: DateTime.now().add(const Duration(days: 1)).toIso8601String(),
    );
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(appText(context, 'زمان جایگزین', 'Replacement time')),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(
            labelText: appText(context, 'تاریخ و ساعت ISO 8601', 'ISO 8601 date and time'),
            helperText: '2026-11-01T18:30:00Z',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: Text(appText(context, 'ذخیره', 'Save'))),
        ],
      ),
    );
    controller.dispose();
    if (value == null || value.isEmpty || !dialogContext.mounted) return;
    final priorStatus = match['status']?.toString() ?? '';
    await _setLeagueMatchStatus(
      dialogContext,
      match,
      status: 'rescheduled',
      replacementAt: value,
      incidentNote: '${priorStatus == 'technical_issue' ? 'technical_issue' : 'double_absent'}: rescheduled by manager',
    );
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

  Future<void> _testSmsConnection() async {
    setState(() => _busy = true);
    try {
      final result = await AdminService.testSmsConnection();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(result['ok'] == true
          ? appText(context, 'اتصال ارائه‌دهنده پیامک موفق بود.', 'SMS provider connection succeeded.')
          : appText(context, 'اتصال برقرار نشد؛ تنظیمات ارائه‌دهنده را بررسی کنید.', 'Connection failed; check provider settings.')),
      ));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _testSmsMessage() async {
    final phone = _smsTestPhone.text.trim();
    if (phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context, 'ابتدا شماره موبایل آزمایشی ایران را وارد کنید.', 'Enter an Iranian test mobile number first.')),
      ));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(appText(dialogContext, 'ارسال پیامک آزمایشی', 'Send test SMS')),
        content: Text(appText(
          dialogContext,
          'این عملیات یک پیامک واقعی به شماره واردشده می‌فرستد و ممکن است هزینه داشته باشد. فقط در صورت تأیید مالک ادامه دهید.',
          'This sends a real SMS to the entered number and may incur a charge. Continue only if the owner confirms.',
        )),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(appText(dialogContext, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(appText(dialogContext, 'تأیید هزینه و ارسال', 'Confirm cost and send'))),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await AdminService.testSmsMessage(phone: phone, confirmCost: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(result['ok'] == true
          ? appText(context, 'ارائه‌دهنده پیامک آزمایشی را پذیرفت.', 'Provider accepted the test SMS.')
          : appText(context, 'ارسال پیامک آزمایشی ناموفق بود.', 'Test SMS failed.')),
      ));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _setDelegatedPermissionsEnabled(bool enabled) async {
    if (enabled) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(appText(context, 'فعال‌سازی مجوزهای تفویض‌شده', 'Enable delegated permissions')),
          content: Text(appText(context, 'با این کار مجوزهای ثبت‌شده می‌توانند به مسیرهای سرور متصل‌شده دسترسی بدهند. فقط در صورت بررسی مجوزها ادامه دهید.', 'Existing grants may access server routes wired to delegated permissions. Continue only after reviewing the grants.')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(appText(context, 'فعال‌سازی', 'Enable'))),
          ],
        ),
      );
      if (confirmed != true) { return; }
    }
    setState(() => _busy = true);
    try {
      final saved = await AdminService.setDelegatedPermissionsEnabled(enabled);
      if (!mounted) return;
      setState(() => _delegatedPermissionsEnabled = saved['enabled'] == true);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(enabled
            ? appText(context, 'مجوزهای تفویض‌شده فعال شدند.', 'Delegated permissions enabled.')
            : appText(context, 'کلید قطع اضطراری فعال شد؛ مجوزهای تفویض‌شده غیرفعال‌اند.', 'Kill switch engaged; delegated permissions are disabled.')),
        ));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _grantPermission(dynamic user) async {
    String selected = 'reports.read';
    final reason = TextEditingController();
    final reference = TextEditingController();
    final scopeIds = TextEditingController();
    final formKey = GlobalKey<FormState>();
    const choices = <String>['reports.read', 'reports.manage'];
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
        title: Text(appText(context, 'اعطای مجوز محدود', 'Grant scoped permission')),
        content: Form(key: formKey, child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('@${user['username'] ?? appText(context, 'کاربر', 'user')}'),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: selected,
            isExpanded: true,
            decoration: InputDecoration(labelText: appText(context, 'مجوز', 'Permission')),
            items: choices.map((value) => DropdownMenuItem(value: value, child: Text(value))).toList(),
            onChanged: (value) { if (value != null) setDialogState(() => selected = value); },
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: reason,
            maxLength: 500,
            decoration: InputDecoration(labelText: appText(context, 'دلیل اعطای مجوز (الزامی)', 'Reason (required)')),
            validator: (value) => (value == null || value.trim().length < 5) ? appText(context, 'دلیل باید حداقل ۵ نویسه باشد.', 'Reason must be at least 5 characters.') : null,
          ),
          if (selected == 'reports.manage')
            TextFormField(
              controller: scopeIds,
              maxLength: 1200,
              decoration: InputDecoration(
                labelText: appText(context, 'شناسه کاربرهای هدف برای reports.manage', 'Target user IDs for reports.manage'),
                helperText: appText(context, 'برای مدیریت گزارش، حداکثر ۱۰۰ شناسه عددی را با ویرگول وارد کنید.', 'For report management, enter up to 100 numeric target user IDs separated by commas.'),
              ),
              validator: (value) {
                if (selected != 'reports.manage') return null;
                final ids = (value ?? '').split(',').map((id) => id.trim()).where((id) => id.isNotEmpty).toList();
                if (ids.isEmpty || ids.length > 100 || ids.any((id) => !RegExp(r'^[1-9][0-9]*$').hasMatch(id))) {
                  return appText(context, 'برای این مجوز حداکثر ۱۰۰ شناسه عددی معتبر وارد کنید.', 'Enter up to 100 valid numeric IDs for this permission.');
                }
                return null;
              },
            ),
          TextField(
            controller: reference,
            maxLength: 200,
            decoration: InputDecoration(labelText: appText(context, 'شناسه تأیید (اختیاری)', 'Approval reference (optional)')),
          ),
          Text(appText(context, 'این مجوز فقط در محدوده گزارش‌ها اثر دارد؛ reports.manage نیز فقط برای شناسه‌های هدف ثبت‌شده معتبر است. هیچ مجوزی خودکار ایجاد نمی‌شود.', 'This grant is operational only for the report routes; reports.manage is limited to the specified target user IDs. No grants are created automatically.'), style: const TextStyle(fontSize: 12)),
        ]))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () {
            if (formKey.currentState?.validate() == true) {
              Navigator.pop(dialogContext, {'permission': selected, 'reason': reason.text.trim(), 'reference': reference.text.trim(), 'resourceIds': scopeIds.text.trim()});
            }
          }, child: Text(appText(context, 'ثبت مجوز', 'Create grant'))),
        ],
      )),
    );
    reason.dispose();
    reference.dispose();
    scopeIds.dispose();
    if (result == null) return;
    setState(() => _busy = true);
    try {
      await AdminService.createPermissionGrant(
        userId: user['id'].toString(),
        permission: result['permission']!,
        reason: result['reason']!,
        approvalReference: result['reference'],
        resourceIds: result['permission'] == 'reports.manage'
          ? (result['resourceIds'] ?? '').split(',').map((id) => id.trim()).where((id) => id.isNotEmpty).toList()
          : null,
      );
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'مجوز ثبت شد.', 'Permission grant created.'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revokePermission(dynamic grant) async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(appText(context, 'لغو مجوز', 'Revoke permission')),
        content: Text(appText(context, 'مجوز ${grant['permission']} لغو شود؟', 'Revoke ${grant['permission']}?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(appText(context, 'انصراف', 'Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(appText(context, 'لغو مجوز', 'Revoke grant'))),
        ],
      ),
    );
    if (accepted != true) return;
    setState(() => _busy = true);
    try {
      await AdminService.revokePermissionGrant(grant['id'].toString());
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'مجوز لغو شد.', 'Permission revoked.'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _search() async {
    final minBalance = _minBalanceFilter.text.trim().isEmpty ? null : int.tryParse(_minBalanceFilter.text.trim());
    final maxBalance = _maxBalanceFilter.text.trim().isEmpty ? null : int.tryParse(_maxBalanceFilter.text.trim());
    if ((_minBalanceFilter.text.trim().isNotEmpty && minBalance == null) ||
        (_maxBalanceFilter.text.trim().isNotEmpty && maxBalance == null) ||
        (minBalance != null && maxBalance != null && minBalance > maxBalance)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'محدوده اعتبار نامعتبر است.', 'Invalid credit balance range.'))));
      return;
    }
    setState(() => _busy = true);
    try {
      final users = await AdminService.searchUsers(
        username: _usernameSearch.text,
        country: _countryFilter.text,
        subscriptionStatus: _subscriptionFilter,
        hasPhone: _phoneFilter,
        minBalance: minBalance,
        maxBalance: maxBalance,
      );
      if (mounted) setState(() {
        _users = users;
        _selectedUserIds.removeWhere((id) => !users.any((user) => user['id'].toString() == id));
      });
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
    if (userId == null && _notificationAudience == 'selected' && _selectedUserIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appText(context, 'ابتدا کاربران موردنظر را انتخاب کنید.', 'Select at least one user first.'))));
      return;
    }
    setState(() => _busy = true);
    try {
      final minBalance = int.tryParse(_minBalanceFilter.text.trim());
      final maxBalance = int.tryParse(_maxBalanceFilter.text.trim());
      final count = await AdminService.sendNotification(
        userId: userId,
        userIds: userId == null && _notificationAudience == 'selected' ? _selectedUserIds.toList() : null,
        username: userId == null && _notificationAudience == 'filtered' ? _usernameSearch.text : null,
        country: userId == null && _notificationAudience == 'filtered' ? _countryFilter.text : null,
        subscriptionStatus: userId == null && _notificationAudience == 'filtered' ? _subscriptionFilter : 'any',
        hasPhone: userId == null && _notificationAudience == 'filtered' ? _phoneFilter : 'any',
        minBalance: userId == null && _notificationAudience == 'filtered' ? minBalance : null,
        maxBalance: userId == null && _notificationAudience == 'filtered' ? maxBalance : null,
        showOnLogin: _showOnLogin,
        title: title,
        body: body,
      );
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
                Text(appText(context, 'ارسال واقعی ورود با OTP تا یکپارچه‌سازی احراز هویت و تصمیم مدیر قفل است.', 'Real SMS delivery and OTP login remain locked until authentication integration is complete and the owner decides.'), style: TextStyle(color: Colors.orange)),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(appText(context, 'فعال‌سازی OTP پیامکی', 'Enable SMS OTP')), subtitle: Text(appText(context, 'فعلاً غیرفعال و غیرقابل فعال‌سازی', 'Currently disabled and cannot be enabled')), value: false, onChanged: null),
                DropdownButtonFormField<String>(initialValue: ['disabled', 'development_simulator', 'real_provider'].contains(_smsMode) ? _smsMode : 'disabled', decoration: InputDecoration(labelText: appText(context, 'حالت ارسال', 'Delivery mode')), items: [
                  DropdownMenuItem(value: 'disabled', child: Text(appText(context, 'غیرفعال (پیش‌فرض)', 'Disabled (default)'))),
                  DropdownMenuItem(value: 'development_simulator', child: Text(appText(context, 'شبیه‌ساز توسعه، بدون پیامک واقعی', 'Development simulator, no real SMS'))),
                  DropdownMenuItem(value: 'real_provider', child: Text(appText(context, 'ارائه‌دهنده واقعی؛ ورود OTP همچنان خاموش', 'Real provider configured; OTP login remains off'))),
                ], onChanged: _busy ? null : (v) => setState(() => _smsMode = v ?? 'disabled')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(initialValue: 'kavenegar', decoration: InputDecoration(labelText: appText(context, 'ارائه‌دهنده', 'Provider')), items: [
                  const DropdownMenuItem(value: 'kavenegar', child: Text('KaveNegar')),
                ], onChanged: _busy ? null : (v) => setState(() => _smsProvider = v ?? 'kavenegar')),
                Text(appText(context, 'در حال حاضر فقط آداپتور کاوه‌نگار پیاده‌سازی شده است.', 'Only the Kavenegar adapter is implemented currently.'), style: const TextStyle(fontSize: 12)),
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
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _busy || _smsMode != 'real_provider' ? null : _testSmsConnection, icon: const Icon(Icons.link), label: Text(appText(context, 'بررسی اتصال ارائه‌دهنده', 'Test provider connection'))),
                TextField(controller: _smsTestPhone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: appText(context, 'شماره آزمایشی ایران', 'Iranian test phone'), hintText: '09123456789', border: const OutlineInputBorder())),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _busy || _smsMode != 'real_provider' ? null : _testSmsMessage, icon: const Icon(Icons.sms_outlined), label: Text(appText(context, 'ارسال پیامک آزمایشی با تأیید هزینه', 'Send test SMS with cost confirmation'))),
                Text(appText(context, 'ورود OTP همچنان خاموش است. پیامک آزمایشی فقط پس از تأیید جداگانه ارسال می‌شود.', 'OTP login remains off. A test SMS is sent only after separate confirmation.'), style: const TextStyle(fontSize: 12)),
                Text(appText(context, 'کلید ذخیره شده: ${_smsSettings['apiKeyConfigured'] == true ? 'بله (مخفی)' : 'خیر'}', 'Saved key: ${_smsSettings['apiKeyConfigured'] == true ? 'yes (hidden)' : 'no'}'), style: const TextStyle(fontSize: 12)),
              ]))),
              const SizedBox(height: 22),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(appText(context, 'مدیریت لیگ‌ها', 'League management'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Text(
                        appText(context,
                          'هر بازی شماره‌گذاری، تقویم، تنظیمات و فهرست لیگ مستقل دارد. شماره لیگ در سرور و جداگانه برای هر بازی تولید می‌شود؛ لیگ‌ها به‌صورت پیش‌فرض غیرفعال و رایگان هستند.',
                          'Each game has its own league numbering, calendar, settings, and list. The server allocates numbers independently per game; leagues default to disabled and free.'),
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(height: 8),
                      for (final game in const <Map<String, String>>[
                        {'code': 'backgammon', 'name': 'تخته‌نرد', 'english': 'Backgammon'},
                        {'code': 'chess', 'name': 'شطرنج', 'english': 'Chess'},
                        {'code': 'manch', 'name': 'منچ', 'english': 'Manch'},
                        {'code': 'uno', 'name': 'UNO', 'english': 'UNO'},
                        {'code': 'hokm', 'name': 'حکم', 'english': 'Hokm'},
                      ])
                        Card(
                          margin: const EdgeInsets.symmetric(vertical: 4),
                          child: ExpansionTile(
                            leading: const Icon(Icons.emoji_events_outlined),
                            title: Text(appText(context, game['name']!, game['english']!)),
                            subtitle: Text(appText(
                              context,
                              '${_leagues.where((item) => (item['gameCode']?.toString() ?? 'backgammon') == game['code']).length} لیگ ثبت‌شده',
                              '${_leagues.where((item) => (item['gameCode']?.toString() ?? 'backgammon') == game['code']).length} leagues configured',
                            )),
                            children: [
                              Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: Padding(
                                  padding: const EdgeInsetsDirectional.only(end: 12, bottom: 8),
                                  child: FilledButton.icon(
                                    onPressed: _busy ? null : () => _createLeagueForGame(game['code']!),
                                    icon: const Icon(Icons.add_circle_outline),
                                    label: Text(appText(context, 'ایجاد لیگ جدید', 'Create new league')),
                                  ),
                                ),
                              ),
                              for (final league in _leagues.where(
                                (item) => (item['gameCode']?.toString() ?? 'backgammon') == game['code'],
                              ))
                                Card(
                                  child: ListTile(
                                    leading: Icon(league['entryMode'] == 'subscription_days' ? Icons.workspace_premium_outlined : Icons.sports_esports_outlined),
                                    title: Text('${appText(context, 'لیگ', 'League')} #${league['leagueNumber'] ?? league['code']} · ${league['name'] ?? ''}'),
                                    subtitle: Text(
                                      '@${league['code']} · ${league['entryMode'] == 'subscription_days' ? appText(context, '${league['subscriptionDaysCost']} روز اشتراک', '${league['subscriptionDaysCost']} subscription days') : appText(context, 'رایگان', 'Free')} · ${league['enabled'] == true ? appText(context, 'فعال', 'Enabled') : appText(context, 'غیرفعال', 'Disabled')}'
                                      ' · ${appText(context, 'شروع', 'Start')}: ${league['startsAt'] ?? '—'}'
                                      ' · ${appText(context, 'پایان', 'End')}: ${league['endsAt'] ?? '—'}',
                                    ),
                                    trailing: Wrap(
                                      spacing: 2,
                                      children: [
                                        IconButton(
                                          tooltip: appText(context, 'گزارش لیگ', 'League report'),
                                          onPressed: _busy ? null : () => _showLeagueReport(league),
                                          icon: const Icon(Icons.assessment_outlined),
                                        ),
                                        if ((league['rules'] is Map ? (league['rules'] as Map)['format'] : null) == 'round_robin')
                                          IconButton(
                                            tooltip: appText(context, 'ساخت برنامه مسابقات', 'Generate schedule'),
                                            onPressed: _busy ? null : () => _scheduleLeague(league),
                                            icon: const Icon(Icons.calendar_month_outlined),
                                          ),
                                        IconButton(
                                          tooltip: appText(context, 'ویرایش تنظیمات', 'Edit settings'),
                                          onPressed: _busy ? null : () => _editLeague(league),
                                          icon: const Icon(Icons.edit_outlined),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              if (!_leagues.any((item) => (item['gameCode']?.toString() ?? 'backgammon') == game['code']))
                                Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Text(appText(context, 'هنوز لیگی برای این بازی ایجاد نشده است.', 'No leagues have been created for this game yet.')),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(appText(context, 'مجوزهای دستیاران و ایجنت‌ها', 'Assistant and agent permissions'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text(appText(context, 'هیچ حساب یا مجوزی خودکار فعال نمی‌شود. فعلاً فقط دسترسی به گزارش‌ها قابل تفویض است: مشاهده گزارش‌ها یا مدیریت گزارش‌های کاربرانِ مشخص‌شده. سایر بخش‌ها همچنان فقط در اختیار مالک‌اند.', 'No account or permission is activated automatically. Currently, only report access can be delegated: read reports or manage reports for explicitly scoped users. All other admin areas remain owner-only.'), style: const TextStyle(fontSize: 12)),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(appText(context, 'کلید قطع اضطراری مجوزها', 'Delegated-permission kill switch')),
                subtitle: Text(_delegatedPermissionsEnabled
                  ? appText(context, 'فعال — مجوزهای ثبت‌شده قابل استفاده‌اند.', 'Enabled — recorded grants may be used.')
                  : appText(context, 'خاموش — تمام دسترسی‌های تفویض‌شده مسدود است.', 'Off — all delegated access is blocked.')),
                value: _delegatedPermissionsEnabled,
                onChanged: _busy ? null : _setDelegatedPermissionsEnabled,
              ),
              const SizedBox(height: 8),
              if (_permissionGrants.isEmpty) Text(appText(context, 'مجوز فعالی ثبت نشده است.', 'No active permission grants.')),
              for (final grant in _permissionGrants) Card(child: ListTile(
                leading: const Icon(Icons.verified_user_outlined),
                title: Text('@${grant['username'] ?? grant['userId']} · ${grant['permission']}'),
                subtitle: Text('${grant['reason'] ?? ''}'),
                trailing: IconButton(tooltip: appText(context, 'لغو مجوز', 'Revoke grant'), onPressed: _busy ? null : () => _revokePermission(grant), icon: const Icon(Icons.remove_circle_outline)),
              )),
              if (_permissionAudit.isNotEmpty) ExpansionTile(
                title: Text(appText(context, 'گزارش ممیزی مجوزها', 'Permission audit log')),
                children: [
                  for (final entry in _permissionAudit.take(20))
                    ListTile(
                      dense: true,
                      title: Text('${entry['action']} · ${entry['permission']}'),
                      subtitle: Text('${entry['actorUsername'] ?? entry['actorUserId'] ?? appText(context, 'سامانه', 'system')} → ${entry['targetUsername'] ?? entry['targetUserId'] ?? appText(context, 'نامشخص', 'unknown')} · ${entry['createdAt']}'),
                    ),
                ],
              ),
              const SizedBox(height: 22),

              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(appText(context, 'مرکز وظایف ایجنت‌ها', 'Agent task center'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Text(appText(context,
                        'تعریف‌ها فقط پیش‌نویس هستند. هیچ حساب، مجوز، زمان‌بندی یا اجرای خودکاری فعال نمی‌شود.',
                        'Definitions are drafts only. No account, permission, schedule, or automatic execution is enabled.'),
                        style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 10),
                      Text(appText(context, 'قالب‌های نقش تخصصی', 'Specialist role templates'), style: const TextStyle(fontWeight: FontWeight.bold)),
                      if (_agentTemplatesUnavailable)
                        Text(appText(context, 'کاتالوگ نقش‌ها از سرور در دسترس نیست.', 'Role catalogue is unavailable from the server.'))
                      else if (_agentRoleTemplates.isEmpty)
                        Text(appText(context, 'قالبی دریافت نشد.', 'No role templates were returned.'))
                      else
                        for (final template in _agentRoleTemplates)
                          ExpansionTile(
                            tilePadding: EdgeInsets.zero,
                            title: Text(template['title']?.toString() ?? template['code']?.toString() ?? ''),
                            subtitle: Text('${template['code'] ?? ''} · ${template['approvalMode'] ?? ''}'),
                            children: [
                              Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: Padding(
                                  padding: const EdgeInsetsDirectional.only(start: 16, end: 16, bottom: 10),
                                  child: Text(template['responsibility']?.toString() ?? ''),
                                ),
                              ),
                              Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: Padding(
                                  padding: const EdgeInsetsDirectional.only(start: 16, end: 16, bottom: 10),
                                  child: Text('${appText(context, 'قابلیت‌های پیش‌فرض', 'Default capabilities')}: ${(template['defaultCapabilities'] as List<dynamic>? ?? const []).join(', ')}'),
                                ),
                              ),
                              Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: Padding(
                                  padding: const EdgeInsetsDirectional.only(end: 12, bottom: 8),
                                  child: OutlinedButton.icon(
                                    onPressed: _busy ? null : () => _applyAgentTemplate(Map<String, dynamic>.from(template as Map)),
                                    icon: const Icon(Icons.playlist_add),
                                    label: Text(appText(context, 'استفاده در پیش‌نویس', 'Use in draft')),
                                  ),
                                ),
                              ),
                            ],
                          ),
                      const Divider(height: 20),
                      Text(appText(context, 'قالب بازی آینده', 'Future-game specialist template'), style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(appText(context,
                        'برای بازی‌های جدید مانند Uno یا Poker، قالب اختصاصی با کد بازی ساخته می‌شود؛ این کار هیچ Agent فعالی ایجاد نمی‌کند.',
                        'New games such as Uno or Poker can receive a game-scoped template; this does not create an active agent.')),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _agentGameCode,
                        decoration: InputDecoration(labelText: appText(context, 'کد بازی (مثلاً uno)', 'Game code (for example uno)'), border: const OutlineInputBorder()),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: _busy ? null : _loadFutureGameAgentTemplate,
                        icon: const Icon(Icons.extension_outlined),
                        label: Text(appText(context, 'نمایش قالب بازی', 'Preview game template')),
                      ),
                      if (_futureGameAgentTemplate != null)
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.lock_outline),
                          title: Text(_futureGameAgentTemplate!['code']?.toString() ?? ''),
                          subtitle: Text(_futureGameAgentTemplate!['responsibility']?.toString() ?? ''),
                          trailing: IconButton(
                            tooltip: appText(context, 'استفاده در پیش‌نویس', 'Use in draft'),
                            onPressed: _busy ? null : () => _applyAgentTemplate(_futureGameAgentTemplate!),
                            icon: const Icon(Icons.playlist_add),
                          ),
                        ),
                      const Divider(height: 24),
                      Text(appText(context, 'ساخت پیش‌نویس وظیفه', 'Create a task draft'), style: const TextStyle(fontWeight: FontWeight.bold)),
                      TextField(controller: _agentTaskCode, decoration: InputDecoration(labelText: appText(context, 'کد وظیفه (حروف کوچک انگلیسی)', 'Task code (lowercase English)'), border: const OutlineInputBorder())),
                      const SizedBox(height: 8),
                      TextField(controller: _agentTaskTitle, maxLength: 120, decoration: InputDecoration(labelText: appText(context, 'عنوان وظیفه', 'Task title'), border: const OutlineInputBorder())),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<String>(
                        initialValue: _agentTaskDomain,
                        decoration: InputDecoration(labelText: appText(context, 'حوزه', 'Domain')),
                        items: const [
                          DropdownMenuItem(value: 'membership', child: Text('Membership')),
                          DropdownMenuItem(value: 'marketing', child: Text('Marketing')),
                          DropdownMenuItem(value: 'deposits', child: Text('Deposits')),
                          DropdownMenuItem(value: 'leagues', child: Text('Leagues')),
                          DropdownMenuItem(value: 'moderation', child: Text('Moderation')),
                          DropdownMenuItem(value: 'operations', child: Text('Operations')),
                          DropdownMenuItem(value: 'social', child: Text('Social')),
                          DropdownMenuItem(value: 'advertising', child: Text('Advertising')),
                          DropdownMenuItem(value: 'analytics', child: Text('Analytics')),
                        ],
                        onChanged: _busy ? null : (value) => setState(() => _agentTaskDomain = value ?? 'operations'),
                      ),
                      const SizedBox(height: 8),
                      TextField(controller: _agentTaskDescription, maxLength: 2000, maxLines: 3, decoration: InputDecoration(labelText: appText(context, 'شرح وظیفه', 'Task description'), border: const OutlineInputBorder())),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _agentTaskRead,
                        onChanged: _busy ? null : (value) => setState(() => _agentTaskRead = value == true),
                        title: Text(appText(context, 'خواندن اطلاعات', 'Read data')),
                      ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _agentTaskRecommend,
                        onChanged: _busy ? null : (value) => setState(() => _agentTaskRecommend = value == true),
                        title: Text(appText(context, 'ارائه پیشنهاد برای بررسی انسانی', 'Recommend for human review')),
                      ),
                      FilledButton.icon(
                        onPressed: _busy ? null : _createAgentTask,
                        icon: const Icon(Icons.add_task),
                        label: Text(appText(context, 'ثبت پیش‌نویس وظیفه', 'Save task draft')),
                      ),
                      const Divider(height: 24),
                      Row(children: [
                        Expanded(child: Text(appText(context, 'تعریف‌های ثبت‌شده', 'Saved task definitions'), style: const TextStyle(fontWeight: FontWeight.bold))),
                        IconButton(onPressed: _busy ? null : _loadAgentTaskProposals, icon: const Icon(Icons.refresh)),
                      ]),
                      if (_agentTasksUnavailable)
                        Text(appText(context, 'فهرست وظایف از سرور در دسترس نیست.', 'Task definitions are unavailable from the server.'))
                      else if (_agentTasks.isEmpty)
                        Text(appText(context, 'تعریفی ثبت نشده است.', 'No task definitions have been saved.'))
                      else
                        for (final task in _agentTasks)
                          ListTile(
                            dense: true,
                            title: Text(task['title']?.toString() ?? task['code']?.toString() ?? ''),
                            subtitle: Text('${task['domain'] ?? ''} · ${task['status'] ?? 'draft'}'),
                            trailing: const Icon(Icons.lock_outline),
                          ),
                      const Divider(height: 24),
                      Text(appText(context, 'پیشنهادهای در انتظار بررسی', 'Proposals awaiting review'), style: const TextStyle(fontWeight: FontWeight.bold)),
                      if (_agentProposalsUnavailable)
                        Text(appText(context, 'صف پیشنهادها از نسخه فعلی سرور در دسترس نیست.', 'Proposal queue is unavailable on the current server version.'))
                      else if (_agentTaskProposals.where((p) => p is Map && p['status'] == 'awaiting_review').isEmpty)
                        Text(appText(context, 'پیشنهادی در انتظار بررسی نیست.', 'No proposals are awaiting review.'))
                      else
                        for (final proposal in _agentTaskProposals.where((p) => p is Map && p['status'] == 'awaiting_review'))
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${proposal['taskCode'] ?? ''} · ${proposal['taskTitle'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                Text('${appText(context, 'شناسه', 'ID')}: ${proposal['id']}'),
                                Text('${appText(context, 'تاریخ', 'Created')}: ${proposal['createdAt'] ?? ''}'),
                                if (proposal['input'] != null) Text('${appText(context, 'ورودی', 'Input')}: ${proposal['input']}'),
                                Align(
                                  alignment: AlignmentDirectional.centerEnd,
                                  child: OutlinedButton.icon(
                                    onPressed: _busy ? null : () => _rejectAgentProposal(proposal),
                                    icon: const Icon(Icons.block_outlined),
                                    label: Text(appText(context, 'رد با ثبت دلیل', 'Reject with reason')),
                                  ),
                                ),
                              ]),
                            ),
                          ),
                      const Divider(height: 24),
                      ExpansionTile(
                        title: Text(appText(context, 'سوابق ممیزی ایجنت‌ها', 'Agent audit history')),
                        subtitle: Text(appText(context, 'ثبت تعریف‌ها، ایجاد پیشنهادها و تصمیم‌های انسانی', 'Task definitions, proposals, and human review decisions')),
                        children: [
                          if (_agentAuditUnavailable)
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(appText(context, 'سوابق ممیزی از سرور در دسترس نیست.', 'Agent audit history is unavailable from the server.')),
                            )
                          else if (_agentAudit.isEmpty)
                            Padding(
                              padding: const EdgeInsets.all(12),
                              child: Text(appText(context, 'هنوز رویدادی ثبت نشده است.', 'No audit events have been recorded yet.')),
                            )
                          else
                            for (final entry in _agentAudit.take(30))
                              ListTile(
                                dense: true,
                                leading: Icon(
                                  entry['result'] == 'success' ? Icons.check_circle_outline : Icons.info_outline,
                                ),
                                title: Text('${entry['action'] ?? ''} · ${entry['result'] ?? ''}'),
                                subtitle: Text(
                                  '${entry['taskCode'] ?? appText(context, 'وظیفه نامشخص', 'Unknown task')} · '
                                  '${entry['actorUsername'] ?? appText(context, 'سامانه', 'system')} · '
                                  '${entry['createdAt'] ?? ''}'
                                  '${(entry['reason']?.toString().isNotEmpty ?? false) ? '\\n${entry['reason']}' : ''}',
                                ),
                              ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(appText(context, 'اعتباردهی به کاربر', 'Credit a user'), style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              TextField(controller: _usernameSearch, decoration: InputDecoration(labelText: appText(context, 'نام کاربری (جستجوی جزئی یا کامل)', 'Username (partial or exact search)'), prefixText: '@', border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(appText(context, 'فیلترهای پیشرفته جستجو', 'Advanced search filters')),
                children: [
                  TextField(controller: _countryFilter, decoration: InputDecoration(labelText: appText(context, 'کشور', 'Country'), border: const OutlineInputBorder())),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _subscriptionFilter,
                    decoration: InputDecoration(labelText: appText(context, 'وضعیت اشتراک', 'Subscription status')),
                    items: [
                      DropdownMenuItem(value: 'any', child: Text(appText(context, 'همه کاربران', 'All users'))),
                      DropdownMenuItem(value: 'active', child: Text(appText(context, 'دارای اشتراک فعال', 'Active subscription'))),
                      DropdownMenuItem(value: 'inactive', child: Text(appText(context, 'بدون اشتراک فعال', 'No active subscription'))),
                    ],
                    onChanged: (value) => setState(() => _subscriptionFilter = value ?? 'any'),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _phoneFilter,
                    decoration: InputDecoration(labelText: appText(context, 'شماره تلفن', 'Phone number')),
                    items: [
                      DropdownMenuItem(value: 'any', child: Text(appText(context, 'مهم نیست', 'Any'))),
                      DropdownMenuItem(value: 'yes', child: Text(appText(context, 'دارای شماره', 'Has phone'))),
                      DropdownMenuItem(value: 'no', child: Text(appText(context, 'بدون شماره', 'No phone'))),
                    ],
                    onChanged: (value) => setState(() => _phoneFilter = value ?? 'any'),
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(child: TextField(controller: _minBalanceFilter, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'حداقل اعتبار', 'Min balance')))),
                    const SizedBox(width: 8),
                    Expanded(child: TextField(controller: _maxBalanceFilter, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'حداکثر اعتبار', 'Max balance')))),
                  ]),
                ],
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _busy ? null : _search, child: Text(appText(context, 'جستجوی کاربران', 'Search users'))),
              if (_users.isNotEmpty) Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: () => setState(() {
                    if (_selectedUserIds.length == _users.length) { _selectedUserIds.clear(); }
                    else { _selectedUserIds.addAll(_users.map((u) => u['id'].toString())); }
                  }),
                  child: Text(appText(context, 'انتخاب / لغو انتخاب نتایج جستجو', 'Select / deselect search results')),
                ),
              ),
              for (final user in _users) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _selectedUserIds.contains(user['id'].toString()),
                  onChanged: (checked) => setState(() {
                    if (checked == true) { _selectedUserIds.add(user['id'].toString()); }
                    else { _selectedUserIds.remove(user['id'].toString()); }
                  }),
                  title: Text('@${user['username'] ?? appText(context, 'کاربر', 'User')}', style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text('${user['country'] ?? '—'} · ${appText(context, 'اعتبار', 'Credits')}: ${user['walletBalance'] ?? '0'} · ${user['hasActiveSubscription'] == true ? appText(context, 'اشتراک فعال', 'Active subscription') : appText(context, 'بدون اشتراک فعال', 'No active subscription')}'),
                ),
                TextField(controller: _amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'مقدار اعتبار', 'Credit amount'))),
                TextField(controller: _description, decoration: InputDecoration(labelText: appText(context, 'توضیح تراکنش', 'Transaction description'))),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : () => _credit(user), child: Text(appText(context, 'ثبت اعتبار', 'Add credits'))),
                OutlinedButton.icon(onPressed: _busy ? null : () => _grantPermission(user), icon: const Icon(Icons.admin_panel_settings_outlined), label: Text(appText(context, 'اعطای مجوز محدود', 'Grant scoped permission'))),
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
              DropdownButtonFormField<String>(
                initialValue: _notificationAudience,
                decoration: InputDecoration(labelText: appText(context, 'مخاطبان اعلان', 'Notification audience')),
                items: [
                  DropdownMenuItem(value: 'all', child: Text(appText(context, 'تمام کاربران', 'All users'))),
                  DropdownMenuItem(value: 'filtered', child: Text(appText(context, 'کاربران مطابق فیلترهای جستجو', 'Users matching search filters'))),
                  DropdownMenuItem(value: 'selected', child: Text(appText(context, 'کاربران انتخاب‌شده', 'Selected users'))),
                ],
                onChanged: (value) => setState(() => _notificationAudience = value ?? 'all'),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _showOnLogin,
                onChanged: (value) => setState(() => _showOnLogin = value == true),
                title: Text(appText(context, 'نمایش اعلان هنگام ورود به برنامه', 'Show announcement when the user opens the app')),
                subtitle: Text(appText(context, 'این اعلان پس از نمایش در ورود بعدی، خوانده‌شده علامت‌گذاری می‌شود.', 'The announcement is marked as read after it is shown on the next app entry.')),
              ),
              FilledButton.icon(
                onPressed: _busy ? null : () => _notify(),
                icon: const Icon(Icons.campaign_outlined),
                label: Text(appText(context, 'ارسال اعلان', 'Send notification')),
              ),
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
                    Text('@${report['reportedUsername'] ?? report['reportedUserId'] ?? appText(context, 'کاربر', 'User')}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text(appText(context, 'گزارشگر: @${report['reporterUsername'] ?? report['reporterId']}', 'Reporter: @${report['reporterUsername'] ?? report['reporterId']}')),
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
              if (_customizationPricingAvailable) ...[
              const SizedBox(height: 22),
              Text(appText(context, 'قیمت‌گذاری تغییرات حساب', 'Account customization pricing'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(appText(context, 'اولین تصویر پروفایل برای هر حساب رایگان است؛ تغییرات بعدی با قیمت تعیین‌شده مدیر محاسبه می‌شود.', 'The first profile avatar is free per account; later changes use the owner-set price.'), style: const TextStyle(fontSize: 12)),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _avatarChangePrice,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: InputDecoration(labelText: appText(context, 'هزینه تغییر آواتار (اعتبار)', 'Avatar change price (credits)')),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _usernameChangePrice,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: InputDecoration(labelText: appText(context, 'هزینه تغییر نام کاربری (اعتبار)', 'Username change price (credits)')),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _busy ? null : _saveAccountCustomizationPricing,
                        icon: const Icon(Icons.save_outlined),
                        label: Text(appText(context, 'ذخیره قیمت‌ها', 'Save prices')),
                      ),
                    ],
                  ),
                ),
              ),
              ],
            ]),
    ),
  );
}
