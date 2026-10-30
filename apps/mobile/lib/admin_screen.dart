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
  final _leagueCode = TextEditingController();
  final _leagueName = TextEditingController();
  final _leagueDays = TextEditingController(text: '1');
  final _leagueMinParticipants = TextEditingController(text: '8');
  String _leagueFormat = 'round_robin';
  String _leagueEntryMode = 'free';
  bool _leagueEnabled = false;
  List<dynamic> _reports = [];
  List<dynamic> _permissionGrants = [];
  List<dynamic> _permissionAudit = [];
  List<dynamic> _agentTaskProposals = [];
  bool _agentProposalsUnavailable = false;
  bool _delegatedPermissionsEnabled = false;
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
    _email.dispose();
    _leagueCode.dispose();
    _leagueName.dispose();
    _leagueDays.dispose();
    _leagueMinParticipants.dispose();
    _amount.dispose();
    _description.dispose();
    _price.dispose();
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
      await _loadAgentTaskProposals();
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = appError(context, e); });
    }
  }


  Future<void> _loadAgentTaskProposals() async {
    try {
      final proposals = await AdminService.agentTaskProposals();
      if (mounted) setState(() { _agentTaskProposals = proposals; _agentProposalsUnavailable = false; });
    } catch (_) {
      // The API may not yet be deployed with the proposal-review endpoint.
      // Keep the rest of the owner console usable and fail closed.
      if (mounted) setState(() { _agentTaskProposals = []; _agentProposalsUnavailable = true; });
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(appText(context, 'پیشنهاد رد و در گزارش ممیزی ثبت شد؛ اجرای ایجنت همچنان غیرفعال است.', 'Proposal rejected and audited; agent execution remains disabled.'))),
        );
      }
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, error))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createLeague() async {
    final code = _leagueCode.text.trim().toLowerCase();
    final name = _leagueName.text.trim();
    final days = int.tryParse(_leagueDays.text) ?? 1;
    final minimumParticipants = int.tryParse(_leagueMinParticipants.text);
    if (code.length < 2 || name.isEmpty || minimumParticipants == null || minimumParticipants < 2 || minimumParticipants > 512 ||
        (_leagueEntryMode == 'subscription_days' && (days < 1 || days > 30))) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appText(context, 'کد، نام و تعداد روز معتبر وارد کنید.', 'Enter a valid code, name, and day count.')),
      ));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.createLeague(
        code: code,
        name: name,
        enabled: _leagueEnabled,
        entryMode: _leagueEntryMode,
        subscriptionDaysCost: _leagueEntryMode == 'free' ? 0 : days,
        format: _leagueFormat,
        minimumParticipants: minimumParticipants,
      );
      _leagueCode.clear();
      _leagueName.clear();
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(appText(context, 'لیگ ثبت شد. هیچ لیگ اشتراکی خودکار فعال نمی‌شود.', 'League saved. No subscription league is enabled automatically.')),
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

  Future<void> _editLeague(dynamic league) async {
    final nameController = TextEditingController(text: league['name']?.toString() ?? '');
    final daysController = TextEditingController(text: (league['subscriptionDaysCost'] ?? 1).toString());
    final currentRules = league['rules'] is Map ? Map<String, dynamic>.from(league['rules'] as Map) : <String, dynamic>{};
    final minParticipantsController = TextEditingController(text: (currentRules['minimumParticipants'] ?? 8).toString());
    var format = currentRules['format']?.toString() ?? 'round_robin';
    var mode = league['entryMode']?.toString() == 'subscription_days' ? 'subscription_days' : 'free';
    var enabled = league['enabled'] == true;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(appText(context, 'تنظیم قوانین لیگ', 'Edit league rules')),
          content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nameController, decoration: InputDecoration(labelText: appText(context, 'نام لیگ', 'League name'))),
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
              if (name.isEmpty || minimum == null || minimum < 2 || minimum > 512 || (mode == 'subscription_days' && (days < 1 || days > 30))) return;
              Navigator.pop(dialogContext, {
                'name': name, 'enabled': enabled, 'entryMode': mode,
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(appError(context, e))));
    } finally {
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
          actions: [TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(appText(context, 'بستن', 'Close')))],
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
          Text(appText(context, 'این کار فقط مجوز را ثبت می‌کند؛ تا زمان اتصال به مسیرهای مجازشده، دسترسی عملیاتی ایجاد نمی‌شود. هیچ مجوزی خودکار ایجاد نمی‌شود.', 'This only records the grant; it does not enable operational access until protected routes are wired to it. No grants are created automatically.'), style: const TextStyle(fontSize: 12)),
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
              Text(appText(context, 'مدیریت لیگ‌ها', 'League management'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text(appText(context, 'لیگ جدید به‌طور پیش‌فرض غیرفعال و رایگان است. مصرف روز اشتراک فقط با تنظیم صریح مالک فعال می‌شود؛ اعتبار کیف پول کسر نمی‌شود.', 'New leagues default to disabled and free. Subscription-day entry requires explicit owner configuration; wallet credits are never charged.'), style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              TextField(controller: _leagueCode, decoration: InputDecoration(labelText: appText(context, 'کد یکتای لیگ (حروف انگلیسی)', 'Unique league code (English letters)'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _leagueName, decoration: InputDecoration(labelText: appText(context, 'نام لیگ', 'League name'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _leagueFormat,
                decoration: InputDecoration(labelText: appText(context, 'فرمت لیگ', 'League format')),
                items: [
                  DropdownMenuItem(value: 'round_robin', child: Text(appText(context, 'دوره‌ای', 'Round robin'))),
                  DropdownMenuItem(value: 'swiss', child: Text(appText(context, 'سوئیسی', 'Swiss'))),
                  DropdownMenuItem(value: 'knockout', child: Text(appText(context, 'حذفی', 'Knockout'))),
                  DropdownMenuItem(value: 'groups_then_knockout', child: Text(appText(context, 'گروهی سپس حذفی', 'Groups then knockout'))),
                ],
                onChanged: _busy ? null : (value) => setState(() => _leagueFormat = value ?? 'round_robin'),
              ),
              const SizedBox(height: 8),
              TextField(controller: _leagueMinParticipants, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: appText(context, 'حداقل شرکت‌کنندگان (۲ تا ۵۱۲)', 'Minimum participants (2–512)'), helperText: appText(context, 'این مقدار را مدیر برای هر لیگ تعیین می‌کند.', 'The manager sets this for each league.'), border: const OutlineInputBorder())),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _leagueEntryMode,
                decoration: InputDecoration(labelText: appText(context, 'قانون ورود', 'Entry rule')),
                items: [
                  DropdownMenuItem(value: 'free', child: Text(appText(context, 'رایگان', 'Free'))),
                  DropdownMenuItem(value: 'subscription_days', child: Text(appText(context, 'مصرف روز اشتراک', 'Consume subscription days'))),
                ],
                onChanged: _busy ? null : (value) => setState(() => _leagueEntryMode = value ?? 'free'),
              ),
              if (_leagueEntryMode == 'subscription_days') TextField(
                controller: _leagueDays,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: appText(context, 'روزهای مصرفی (۱ تا ۳۰)', 'Days consumed (1–30)'), border: const OutlineInputBorder()),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(appText(context, 'فعال‌سازی لیگ هنگام ایجاد', 'Enable league on creation')),
                subtitle: Text(appText(context, 'خاموش بودن پیش‌فرض امن‌تر است.', 'Disabled by default is safer.')),
                value: _leagueEnabled,
                onChanged: _busy ? null : (value) => setState(() => _leagueEnabled = value),
              ),
              FilledButton.icon(
                onPressed: _busy ? null : _createLeague,
                icon: const Icon(Icons.add_circle_outline),
                label: Text(appText(context, 'ایجاد لیگ', 'Create league')),
              ),
              if (_leagues.isEmpty) Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(appText(context, 'لیگی ثبت نشده است.', 'No leagues configured.')),
              ),
              for (final league in _leagues) Card(
                child: ListTile(
                  leading: Icon(league['entryMode'] == 'subscription_days' ? Icons.workspace_premium_outlined : Icons.sports_esports_outlined),
                  title: Text(league['name']?.toString() ?? ''),
                  subtitle: Text('@${league['code']} · ${league['entryMode'] == 'subscription_days' ? appText(context, '${league['subscriptionDaysCost']} روز اشتراک', '${league['subscriptionDaysCost']} subscription days') : appText(context, 'رایگان', 'Free')} · ${league['enabled'] == true ? appText(context, 'فعال', 'Enabled') : appText(context, 'غیرفعال', 'Disabled')}'),
                  trailing: Wrap(
                    spacing: 2,
                    children: [
                      IconButton(
                        tooltip: appText(context, 'گزارش لیگ', 'League report'),
                        onPressed: _busy ? null : () => _showLeagueReport(league),
                        icon: const Icon(Icons.assessment_outlined),
                      ),
                      if (['round_robin', 'swiss', 'knockout'].contains(league['rules'] is Map ? (league['rules'] as Map)['format'] : null))
                        IconButton(
                          tooltip: appText(context, 'ساخت برنامه مسابقات', 'Generate schedule'),
                          onPressed: _busy ? null : () => _scheduleLeague(league),
                          icon: const Icon(Icons.calendar_month_outlined),
                        ),
                      IconButton(
                        tooltip: appText(context, 'ویرایش قوانین', 'Edit rules'),
                        onPressed: _busy ? null : () => _editLeague(league),
                        icon: const Icon(Icons.edit_outlined),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text(appText(context, 'مجوزهای دستیاران و ایجنت‌ها', 'Assistant and agent permissions'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text(appText(context, 'هیچ حساب یا مجوزی خودکار فعال نمی‌شود. این مجوزها فعلاً ثبت و ممیزی می‌شوند؛ تا اتصال کامل مسیرها، دسترسی عملیاتی اعطا نمی‌کنند.', 'No account or permission is activated automatically. Grants are currently recorded and audited; they do not yet enable operational access.'), style: const TextStyle(fontSize: 12)),
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
              Row(
                children: [
                  Expanded(child: Text(appText(context, 'پیشنهادهای ایجنت برای بررسی', 'Agent proposals for review'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
                  IconButton(
                    tooltip: appText(context, 'تازه‌سازی پیشنهادها', 'Refresh proposals'),
                    onPressed: _busy ? null : _loadAgentTaskProposals,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              Text(
                appText(context, 'پیشنهادها فقط برای بررسی انسانی هستند. این صفحه اجرای خودکار یا تأیید اجرای ایجنت را فعال نمی‌کند.', 'Proposals are for human review only. This screen does not enable automatic execution or approve agent execution.'),
                style: const TextStyle(fontSize: 12),
              ),
              if (_agentProposalsUnavailable)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(appText(context, 'این قابلیت هنوز روی نسخه سرور مستقر نشده است؛ سایر بخش‌های مدیریت در دسترس می‌مانند.', 'This endpoint is not available on the deployed server yet; the rest of the admin console remains available.')),
                )
              else if (_agentTaskProposals.where((p) => p is Map && p['status'] == 'awaiting_review').isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(appText(context, 'پیشنهاد در انتظار بررسی وجود ندارد.', 'No proposals are awaiting review.')),
                ),
              for (final proposal in _agentTaskProposals.where((p) => p is Map && p['status'] == 'awaiting_review'))
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${proposal['taskCode'] ?? ''} · ${proposal['taskTitle'] ?? ''}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        Text(appText(context, 'وضعیت: در انتظار بررسی', 'Status: awaiting review')),
                        Text('${appText(context, 'شناسه پیشنهاد', 'Proposal ID')}: ${proposal['id']}'),
                        Text('${appText(context, 'ثبت شده', 'Created')}: ${proposal['createdAt'] ?? ''}'),
                        if (proposal['input'] != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: SelectableText('${appText(context, 'ورودی درخواست', 'Requested input')}: ${proposal['input']}'),
                          ),
                        const SizedBox(height: 8),
                        Align(
                          alignment: AlignmentDirectional.centerEnd,
                          child: OutlinedButton.icon(
                            onPressed: _busy ? null : () => _rejectAgentProposal(proposal),
                            icon: const Icon(Icons.block_outlined),
                            label: Text(appText(context, 'رد با ثبت دلیل', 'Reject with reason')),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
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
            ]),
    ),
  );
}
