import 'package:flutter/material.dart';
import 'l10n/app_text.dart';
import 'services/wallet_service.dart';

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
          SnackBar(content: Text(appText(context, 'اشتراک با موفقیت فعال شد.', 'Subscription activated successfully.'))),
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
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(appText(context, 'کیف پول و اشتراک', 'Wallet and subscription')),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        foregroundColor: Theme.of(context).colorScheme.primary,
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
        ? Center(child: CircularProgressIndicator(color: colors.primary))
        : RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: colors.primary.withValues(alpha: .45)), 
                  gradient: LinearGradient(colors: [colors.surfaceContainerHighest, colors.surface]),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(appText(context, 'موجودی اعتبار', 'Credit balance'), style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7))),
                  const SizedBox(height: 8),
                  Text(appText(context, '$_balance اعتبار', '$_balance credits'), style: TextStyle(color: colors.primary, fontSize: 30, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text(appText(context, 'اعتبارها قابل انتقال نیستند؛ شارژ فقط توسط مدیر مجاز انجام می‌شود.', 'Credits are non-transferable; only an authorized administrator can add credits.'), style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7), fontSize: 12)),
                ]),
              ),
              if (_error != null) Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ),
              const SizedBox(height: 22),
              Text(appText(context, 'اشتراک‌های موجود', 'Available subscriptions'), style: TextStyle(color: colors.onSurface, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              if (_subscription != null)
                Card(color: Theme.of(context).colorScheme.surface, child: ListTile(
                  leading: Icon(Icons.workspace_premium, color: colors.primary),
                  title: Text(_subscription!['planName']?.toString() ?? appText(context, 'اشتراک فعال', 'Active subscription'), style: TextStyle(color: colors.onSurface)),
                  subtitle: Text('پایان: ${_subscription!['endsAt'] ?? '—'}', style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7))),
                )),
              if (_plans.isEmpty)
                Padding(padding: const EdgeInsets.all(12), child: Text(appText(context, 'فعلاً اشتراکی تعریف نشده است.', 'No subscriptions are available yet.'), style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7)))),
              for (final item in _plans)
                Card(
                  color: Theme.of(context).colorScheme.surface,
                  child: ListTile(
                    leading: Icon(Icons.stars_rounded, color: colors.primary),
                    title: Text(item['name']?.toString() ?? appText(context, 'اشتراک', 'Subscription'), style: TextStyle(color: colors.onSurface, fontWeight: FontWeight.bold)),
                    subtitle: Text('${item['durationDays'] ?? 30} روز • ${item['priceCredits'] ?? 0} اعتبار', style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7))),
                    trailing: FilledButton(
                      onPressed: _busy ? null : () => _activate(item['code'].toString()),
                      child: Text(appText(context, 'فعال‌سازی', 'Activate')),
                    ),
                  ),
                ),
              const SizedBox(height: 22),
              Text(appText(context, 'تراکنش‌های اخیر', 'Recent transactions'), style: TextStyle(color: colors.onSurface, fontSize: 20, fontWeight: FontWeight.bold)),
              if (_transactions.isEmpty)
                Padding(padding: const EdgeInsets.all(12), child: Text(appText(context, 'هنوز تراکنشی ثبت نشده است.', 'No transactions yet.'), style: TextStyle(color: colors.onSurface.withValues(alpha: 0.7)))),
              for (final tx in _transactions.take(20))
                Card(
                  color: Theme.of(context).colorScheme.surface,
                  child: ListTile(
                    title: Text(tx['description']?.toString() ?? tx['type']?.toString() ?? appText(context, 'تراکنش', 'Transaction'), style: TextStyle(color: colors.onSurface)),
                    subtitle: Text(tx['createdAt']?.toString() ?? '', style: TextStyle(color: colors.onSurface.withValues(alpha: 0.54), fontSize: 11)),
                    trailing: Text('${(tx['amount'] as num?)?.toInt() ?? 0}', style: TextStyle(color: ((tx['amount'] as num?)?.toInt() ?? 0) >= 0 ? colors.primary : colors.error, fontWeight: FontWeight.bold)),
                  ),
                ),
            ],
          ),
        ),
    ),
  );
  }
}
