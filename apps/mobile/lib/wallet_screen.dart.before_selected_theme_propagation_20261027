import 'package:flutter/material.dart';
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
          const SnackBar(content: Text('اشتراک با موفقیت فعال شد.')),
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
    textDirection: TextDirection.rtl,
    child: Scaffold(
      backgroundColor: _walletNavy,
      appBar: AppBar(
        title: const Text('کیف پول و اشتراک'),
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
                  const Text('موجودی اعتبار', style: TextStyle(color: Colors.white70)),
                  const SizedBox(height: 8),
                  Text('$_balance اعتبار', style: const TextStyle(color: _walletGold, fontSize: 30, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  const Text('اعتبارها قابل انتقال نیستند؛ شارژ فقط توسط مدیر مجاز انجام می‌شود.', style: TextStyle(color: Colors.white70, fontSize: 12)),
                ]),
              ),
              if (_error != null) Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ),
              const SizedBox(height: 22),
              const Text('اشتراک‌های موجود', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              if (_subscription != null)
                Card(color: _walletPanel, child: ListTile(
                  leading: const Icon(Icons.workspace_premium, color: _walletGold),
                  title: Text(_subscription!['planName']?.toString() ?? 'اشتراک فعال', style: const TextStyle(color: Colors.white)),
                  subtitle: Text('پایان: ${_subscription!['endsAt'] ?? '—'}', style: const TextStyle(color: Colors.white70)),
                )),
              if (_plans.isEmpty)
                const Padding(padding: EdgeInsets.all(12), child: Text('فعلاً اشتراکی تعریف نشده است.', style: TextStyle(color: Colors.white70))),
              for (final item in _plans)
                Card(
                  color: _walletPanel,
                  child: ListTile(
                    leading: const Icon(Icons.stars_rounded, color: _walletGold),
                    title: Text(item['name']?.toString() ?? 'اشتراک', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    subtitle: Text('${item['durationDays'] ?? 30} روز • ${item['priceCredits'] ?? 0} اعتبار', style: const TextStyle(color: Colors.white70)),
                    trailing: FilledButton(
                      onPressed: _busy ? null : () => _activate(item['code'].toString()),
                      child: const Text('فعال‌سازی'),
                    ),
                  ),
                ),
              const SizedBox(height: 22),
              const Text('تراکنش‌های اخیر', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
              if (_transactions.isEmpty)
                const Padding(padding: EdgeInsets.all(12), child: Text('هنوز تراکنشی ثبت نشده است.', style: TextStyle(color: Colors.white70))),
              for (final tx in _transactions.take(20))
                Card(
                  color: _walletPanel,
                  child: ListTile(
                    title: Text(tx['description']?.toString() ?? tx['type']?.toString() ?? 'تراکنش', style: const TextStyle(color: Colors.white)),
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
