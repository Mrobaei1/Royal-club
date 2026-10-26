import 'package:flutter/material.dart';
import 'l10n/app_localizations.dart';
import 'services/wallet_service.dart';

const _walletGold = Color(0xFFD8B45A);
const _walletNavy = Color(0xFF10182B);
const _walletPanel = Color(0xFF17243A);

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _error;
  int _balance = 0;
  List<dynamic> _transactions = [];
  List<dynamic> _plans = [];
  Map<String, dynamic>? _subscription;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        WalletService.wallet(),
        WalletService.plans(),
        WalletService.currentSubscription(),
      ]);
      if (!mounted) return;
      setState(() {
        _balance = (results[0]['balance'] as num?)?.toInt() ?? 0;
        _transactions = results[0]['transactions'] as List<dynamic>? ?? [];
        _plans = results[1]['plans'] as List<dynamic>? ?? [];
        _subscription = results[2]['subscription'] as Map<String, dynamic>?;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _activate(String code) async {
    setState(() => _busy = true);
    try {
      await WalletService.activate(code);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.subscriptionActivated)),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: Localizations.localeOf(context).languageCode == 'fa' ? TextDirection.rtl : TextDirection.ltr,
    child: Scaffold(
      backgroundColor: _walletNavy,
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.walletSubscriptionTitle),
        backgroundColor: _walletNavy,
        foregroundColor: _walletGold,
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator(color: _walletGold))
        : RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: _walletGold.withValues(alpha: .45)),
                  gradient: const LinearGradient(colors: [Color(0xFF253650), _walletPanel]),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(AppLocalizations.of(context)!.walletBalance, style: TextStyle(color: Colors.white70)),
                  const SizedBox(height: 8),
                  Text('$_balance ${AppLocalizations.of(context)!.creditsUnit}', style: const TextStyle(color: _walletGold, fontSize: 30, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text(AppLocalizations.of(context)!.creditsNonTransferable, style: TextStyle(color: Colors.white70, fontSize: 12)),
                ]),
              ),
              if (_error != null) Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ),
              const SizedBox(height: 22),
              Text(AppLocalizations.of(context)!.availableSubscriptions, style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              if (_subscription != null)
                Card(color: _walletPanel, child: ListTile(
                  leading: const Icon(Icons.workspace_premium, color: _walletGold),
                  title: Text(_subscription!['planName']?.toString() ?? AppLocalizations.of(context)!.activeSubscription, style: const TextStyle(color: Colors.white)),
                  subtitle: Text('${AppLocalizations.of(context)!.endsAt}: ${_subscription!['endsAt'] ?? '—'}', style: const TextStyle(color: Colors.white70)),
                )),
              if (_plans.isEmpty)
                Padding(padding: const EdgeInsets.all(12), child: Text(AppLocalizations.of(context)!.noPlans, style: TextStyle(color: Colors.white70))),
              for (final item in _plans)
                Card(
                  color: _walletPanel,
                  child: ListTile(
                    leading: const Icon(Icons.stars_rounded, color: _walletGold),
                    title: Text(item['name']?.toString() ?? AppLocalizations.of(context)!.activeSubscription, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    subtitle: Text('${item['durationDays'] ?? 30} ${AppLocalizations.of(context)!.daysUnit} • ${item['priceCredits'] ?? 0} ${AppLocalizations.of(context)!.creditsUnit}', style: const TextStyle(color: Colors.white70)),
                    trailing: FilledButton(
                      onPressed: _busy ? null : () => _activate(item['code'].toString()),
                      child: Text(AppLocalizations.of(context)!.activate),
                    ),
                  ),
                ),
              const SizedBox(height: 22),
              Text(AppLocalizations.of(context)!.recentTransactions, style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              if (_transactions.isEmpty)
                Padding(padding: const EdgeInsets.all(12), child: Text(AppLocalizations.of(context)!.noTransactions, style: TextStyle(color: Colors.white70))),
              for (final tx in _transactions.take(20))
                Card(
                  color: _walletPanel,
                  child: ListTile(
                    title: Text(tx['description']?.toString() ?? tx['type']?.toString() ?? AppLocalizations.of(context)!.transactionFallback, style: const TextStyle(color: Colors.white)),
                    subtitle: Text(tx['createdAt']?.toString() ?? '', style: const TextStyle(color: Colors.white54, fontSize: 11)),
                    trailing: Text('${(tx['amount'] as num?)?.toInt() ?? 0}', style: TextStyle(color: ((tx['amount'] as num?)?.toInt() ?? 0) >= 0 ? _walletGold : Colors.orangeAccent, fontWeight: FontWeight.bold)),
                  ),
                ),
            ],
          ),
        ),
    ),
  );
}
