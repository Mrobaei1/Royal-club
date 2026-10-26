import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'l10n/app_localizations.dart';
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
  List<dynamic> _reports = [];
  final _email = TextEditingController();
  final _amount = TextEditingController(text: '100');
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _notificationTitle = TextEditingController();
  final _notificationBody = TextEditingController();
  List<dynamic> _users = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _email.dispose();
    _amount.dispose();
    _description.dispose();
    _price.dispose();
    _notificationTitle.dispose();
    _notificationBody.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final owner = await AdminService.isOwner();
      if (!owner) {
        if (mounted) setState(() { _owner = false; _loading = false; _error = null; });
        return;
      }
      final results = await Future.wait([AdminService.plans(), AdminService.reports()]);
      if (!mounted) return;
      setState(() { _owner = true; _plans = results[0]; _reports = results[1]; _loading = false; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.toString().replaceFirst('Exception: ', ''); });
    }
  }

  Future<void> _search() async {
    setState(() => _busy = true);
    try {
      final users = await AdminService.findUser(_email.text);
      if (mounted) setState(() { _users = users; });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _exportUser(dynamic user) async {
    setState(() => _busy = true);
    try {
      final profile = await AdminService.exportUserProfile(user['id'].toString());
      final lines = <String>[
        '${AppLocalizations.of(context)!.userIdLabel}: ${profile['id'] ?? ''}',
        '${AppLocalizations.of(context)!.fullNameLabel}: ${profile['fullName'] ?? ''}',
        '${AppLocalizations.of(context)!.username}: ${profile['username'] ?? ''}',
        '${AppLocalizations.of(context)!.emailLabel}: ${profile['email'] ?? ''}',
        '${AppLocalizations.of(context)!.phoneLabel}: ${profile['phone'] ?? ''}',
        '${AppLocalizations.of(context)!.countryLabel}: ${profile['country'] ?? ''}',
        '${AppLocalizations.of(context)!.walletBalance}: ${profile['walletBalance'] ?? '0'}',
        '${AppLocalizations.of(context)!.registrationDate}: ${profile['createdAt'] ?? ''}',
      ];
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(AppLocalizations.of(context)!.userDetails),
          content: SingleChildScrollView(child: SelectableText(lines.join('\\n'))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(AppLocalizations.of(context)!.close)),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: lines.join('\\n')));
                if (dialogContext.mounted) Navigator.pop(dialogContext);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.copiedClipboard)));
              },
              icon: const Icon(Icons.copy),
              label: Text(AppLocalizations.of(context)!.copyForExport),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _credit(dynamic user) async {
    final amount = int.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.creditPositive)));
      return;
    }
    setState(() => _busy = true);
    try {
      await AdminService.credit(user['id'].toString(), amount, _description.text.trim());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.creditSaved)));
        await _search();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _notify({String? userId}) async {
    final title = _notificationTitle.text.trim();
    final body = _notificationBody.text.trim();
    if (title.isEmpty || title.length > 120 || body.length > 1000) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.notificationValidation)));
      return;
    }
    setState(() => _busy = true);
    try {
      final count = await AdminService.sendNotification(userId: userId, title: title, body: body);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.notificationSentCount(count))));
      if (mounted && userId == null) {
        _notificationTitle.clear();
        _notificationBody.clear();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _updateReport(dynamic report, String status) async {
    setState(() => _busy = true);
    try {
      await AdminService.updateReport(report['id'].toString(), status);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.reportUpdated)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
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
          SnackBar(content: Text(active ? AppLocalizations.of(context)!.subscriptionActivated : AppLocalizations.of(context)!.subscriptionDeactivated)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
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
      title: Text(AppLocalizations.of(context)!.editSubscription),
      content: Form(key: formKey, child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextFormField(controller: name, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.subscriptionName), validator: (v) => v == null || v.trim().isEmpty ? AppLocalizations.of(context)!.requiredName : null),
        TextFormField(controller: days, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.durationDays), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 1 ? AppLocalizations.of(context)!.invalidDuration : null),
        TextFormField(controller: price, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.priceCredits), validator: (v) => int.tryParse(v ?? '') == null || int.parse(v!) < 0 ? AppLocalizations.of(context)!.invalidPrice : null),
      ])),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(AppLocalizations.of(context)!.cancel)),
        FilledButton(onPressed: () { if (formKey.currentState!.validate()) Navigator.pop(context, true); }, child: Text(AppLocalizations.of(context)!.save)),
      ],
    ));
    if (accepted != true) { name.dispose(); days.dispose(); price.dispose(); return; }
    try {
      await AdminService.updatePlan(plan['code'].toString(), name: name.text.trim(), durationDays: int.parse(days.text), priceCredits: int.parse(price.text));
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.subscriptionUpdated)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      name.dispose(); days.dispose(); price.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
    child: Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context)!.adminPanel), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : _error != null
        ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
        : !_owner
          ? Center(child: Padding(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.lock_outline, size: 54), SizedBox(height: 14),
              Text(AppLocalizations.of(context)!.adminAccessDisabled, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              SizedBox(height: 8), Text(AppLocalizations.of(context)!.ownerOnlyDescription, textAlign: TextAlign.center),
            ])))
          : ListView(padding: const EdgeInsets.all(16), children: [
              Text(AppLocalizations.of(context)!.creditUser, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.exactUserEmail, border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton(onPressed: _busy ? null : _search, child: Text(AppLocalizations.of(context)!.searchUser)),
              for (final user in _users) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user['fullName']?.toString() ?? AppLocalizations.of(context)!.userFallback, style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(user['email']?.toString() ?? ''),
                TextField(controller: _amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.creditAmount)),
                TextField(controller: _description, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.transactionDescription)),
                const SizedBox(height: 8),
                FilledButton(onPressed: _busy ? null : () => _credit(user), child: Text(AppLocalizations.of(context)!.submitCredit)),
                OutlinedButton(onPressed: _busy ? null : () => _notify(userId: user['id'].toString()), child: Text(AppLocalizations.of(context)!.sendNotificationToUser)),
                OutlinedButton.icon(onPressed: _busy ? null : () => _exportUser(user), icon: const Icon(Icons.person_search_outlined), label: Text(AppLocalizations.of(context)!.exportUserProfile)),
              ]))),
              const SizedBox(height: 22),
              Text(AppLocalizations.of(context)!.sendNotification, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              TextField(controller: _notificationTitle, maxLength: 120, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.notificationTitle, border: OutlineInputBorder())),
              const SizedBox(height: 8),
              TextField(controller: _notificationBody, maxLines: 3, maxLength: 1000, decoration: InputDecoration(labelText: AppLocalizations.of(context)!.notificationBody, border: OutlineInputBorder())),
              const SizedBox(height: 8),
              FilledButton.icon(onPressed: _busy ? null : () => _notify(), icon: const Icon(Icons.campaign_outlined), label: Text(AppLocalizations.of(context)!.sendNotificationAll)),
              const SizedBox(height: 22),
              Row(children: [
                Expanded(child: Text(AppLocalizations.of(context)!.userReports, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
                IconButton(onPressed: _busy ? null : _load, tooltip: AppLocalizations.of(context)!.refreshReports, icon: const Icon(Icons.refresh)),
              ]),
              Text(AppLocalizations.of(context)!.reportThresholdInfo, style: TextStyle(fontSize: 12)),
              const SizedBox(height: 8),
              if (_reports.isEmpty) Text(AppLocalizations.of(context)!.noReports),
              for (final report in _reports) Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(report['reportedEmail']?.toString() ?? AppLocalizations.of(context)!.userFallback, style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text('${AppLocalizations.of(context)!.reporterLabel}: ${report['reporterEmail'] ?? report['reporterId']}'),
                    Text('${AppLocalizations.of(context)!.recentReportsLabel}: ${report['uniqueReportsLast7Days']} / ${report['reportsLast7Days']}'),
                    if ((report['uniqueReportsLast7Days'] as num?)?.toInt() != null && ((report['uniqueReportsLast7Days'] as num).toInt() >= 2))
                      Chip(label: Text(AppLocalizations.of(context)!.needsAdminReview)),
                    const SizedBox(height: 4),
                    Text(report['reason']?.toString() ?? ''),
                    Text('${AppLocalizations.of(context)!.statusLabel}: ${switch (report['status']) { 'open' => AppLocalizations.of(context)!.statusOpen, 'reviewed' => AppLocalizations.of(context)!.statusReviewed, 'dismissed' => AppLocalizations.of(context)!.statusDismissed, 'actioned' => AppLocalizations.of(context)!.statusActioned, _ => report['status'].toString() }}'),
                    if (report['status'] == 'open') Wrap(spacing: 8, children: [
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'reviewed'), child: Text(AppLocalizations.of(context)!.reviewed)),
                      OutlinedButton(onPressed: _busy ? null : () => _updateReport(report, 'dismissed'), child: Text(AppLocalizations.of(context)!.dismissReport)),
                      FilledButton.tonal(onPressed: _busy ? null : () => _updateReport(report, 'actioned'), child: Text(AppLocalizations.of(context)!.actionTaken)),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 22),
              Text(AppLocalizations.of(context)!.manageSubscriptions, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              for (final plan in _plans) Card(child: ListTile(
                leading: const Icon(Icons.workspace_premium),
                title: Text(plan['name']?.toString() ?? ''),
                subtitle: Text('${plan['durationDays']} ${AppLocalizations.of(context)!.daysUnit} • ${plan['priceCredits']} ${AppLocalizations.of(context)!.creditsUnit}'),
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
