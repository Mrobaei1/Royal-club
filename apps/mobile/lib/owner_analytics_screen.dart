import 'package:flutter/material.dart';
import 'services/admin_service.dart';
import 'l10n/app_text.dart';

class OwnerAnalyticsScreen extends StatefulWidget {
  const OwnerAnalyticsScreen({super.key});

  @override
  State<OwnerAnalyticsScreen> createState() => _OwnerAnalyticsScreenState();
}

class _OwnerAnalyticsScreenState extends State<OwnerAnalyticsScreen> {
  late Future<Map<String, dynamic>> _overview;

  @override
  void initState() {
    super.initState();
    _overview = AdminService.executiveAnalyticsOverview();
  }

  void _refresh() {
    setState(() => _overview = AdminService.executiveAnalyticsOverview());
  }

  String _number(dynamic value) {
    if (value == null) return '—';
    final parsed = int.tryParse(value.toString());
    if (parsed == null) return value.toString();
    return parsed.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (match) => ',',
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEnglish = Localizations.localeOf(context).languageCode == 'en';
    String t(String fa, String en) => appText(context, fa, en);
    return Directionality(
      textDirection: isEnglish ? TextDirection.ltr : TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: Text(t('آمار و تحلیل مدیر کل', 'Owner analytics')),
          actions: [IconButton(onPressed: _refresh, tooltip: t('به‌روزرسانی', 'Refresh'), icon: const Icon(Icons.refresh))],
        ),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _overview,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Center(child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.cloud_off_outlined, size: 44),
                  const SizedBox(height: 12),
                  Text(t('اطلاعات آماری اکنون در دسترس نیست. هیچ مقدار جایگزینی نمایش داده نشده است.', 'Analytics are unavailable. No substitute values are being displayed.'), textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton.icon(onPressed: _refresh, icon: const Icon(Icons.refresh), label: Text(t('تلاش دوباره', 'Retry'))),
                ]),
              ));
            }
            final data = snapshot.data!;
            final metrics = Map<String, dynamic>.from(data['metrics'] as Map? ?? {});
            final games = Map<String, dynamic>.from(metrics['backgammonMatches'] as Map? ?? {});
            final wallet = Map<String, dynamic>.from(metrics['walletCreditsLast30Days'] as Map? ?? {});
            final subscriptions = Map<String, dynamic>.from(metrics['subscriptions'] as Map? ?? {});
            final activeUsers = Map<String, dynamic>.from(metrics['activeUsers'] as Map? ?? {});
            final gameEvents = (metrics['gameActivityLast30Days'] as List? ?? const [])
                .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
            final trends = (data['trends']?['backgammonMatchesLast30Days'] as List? ?? const [])
                .whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
            final coverage = Map<String, dynamic>.from(data['coverage'] as Map? ?? {});
            final partial = (coverage['partial'] as List? ?? const []).map((e) => e.toString()).toList();
            final unavailable = (coverage['notInstrumented'] as List? ?? const []).map((e) => e.toString()).toList();
            final stamp = data['generatedAt']?.toString() ?? '';
            return RefreshIndicator(
              onRefresh: () async => _refresh(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.verified_outlined, color: Colors.green),
                      const SizedBox(width: 10),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t('نمای زنده بر اساس پرس‌وجوی مستقیم پایگاه داده', 'Live view from direct database queries'), style: const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text('${t('آخرین دریافت', 'Last fetched')}: $stamp', style: Theme.of(context).textTheme.bodySmall),
                        Text(t('این زمان، زمان دریافت داده است؛ نه تضمین تازگی رویدادهای منبع.', 'This is the query time, not a guarantee that source events are current.'), style: Theme.of(context).textTheme.bodySmall),
                      ])),
                    ]),
                  )),
                  const SizedBox(height: 12),
                  Text(t('شاخص‌های اصلی', 'Executive KPIs'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Wrap(spacing: 10, runSpacing: 10, children: [
                    _KpiCard(title: t('کل کاربران ثبت‌نام‌شده', 'Registered users'), value: _number(metrics['registeredUsers']), icon: Icons.people_outline),
                    _KpiCard(title: t('ثبت‌نام در ۳۰ روز', 'Registrations · 30d'), value: _number(metrics['registrationsLast30Days']), icon: Icons.person_add_alt),
                    _KpiCard(title: 'DAU', value: _number(activeUsers['dau']), icon: Icons.today_outlined),
                    _KpiCard(title: 'WAU', value: _number(activeUsers['wau']), icon: Icons.date_range_outlined),
                    _KpiCard(title: 'MAU', value: _number(activeUsers['mau']), icon: Icons.calendar_month_outlined),
                    _KpiCard(title: t('کاربران فعال تکراری · ۳۰ روز', 'Repeat active users · 30d'), value: _number(activeUsers['returningUsers30Days']), icon: Icons.replay_outlined),
                    _KpiCard(title: t('اشتراک‌های فعال', 'Active subscriptions'), value: _number(subscriptions['active']), icon: Icons.workspace_premium_outlined),
                    _KpiCard(title: t('کل سوابق اشتراک', 'Subscription records'), value: _number(subscriptions['totalRecords']), icon: Icons.receipt_long_outlined),
                  ]),
                  const SizedBox(height: 18),
                  Text(t('فعالیت بازی‌ها در ۳۰ روز اخیر', 'Game events · last 30 days'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Card(child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: gameEvents.isEmpty
                      ? Text(t('هنوز رویداد بازی ثبت نشده است.', 'No game events have been recorded yet.'))
                      : Column(children: gameEvents.map((event) => _MetricRow(
                          label: '${event['game']} · ${event['event']}',
                          value: _number(event['count']),
                        )).toList()),
                  )),
                  const SizedBox(height: 6),
                  Text(t('منبع: analytics_game_events · فقط رویدادهای ثبت‌شده؛ بازی‌های بدون اتصال رویداد در این آمار ظاهر نمی‌شوند.', 'Source: analytics_game_events · recorded events only; games without event integration are not represented.'), style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 18),
                  Text(t('وضعیت بازی تخته‌نرد', 'Backgammon status'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    _StatusChip(label: t('در انتظار', 'Waiting'), value: games['waiting']),
                    _StatusChip(label: t('در حال بازی', 'Active'), value: games['active']),
                    _StatusChip(label: t('پایان‌یافته', 'Finished'), value: games['finished']),
                    _StatusChip(label: t('لغوشده', 'Cancelled'), value: games['cancelled']),
                    _StatusChip(label: t('مجموع', 'Total'), value: games['total']),
                  ]),
                  const SizedBox(height: 18),
                  Text(t('روند روزانه بازی‌ها در ۳۰ روز اخیر', 'Daily matches · last 30 days'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Card(child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: trends.isEmpty
                      ? Text(t('داده روند موجود نیست.', 'Trend data is unavailable.'))
                      : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          SizedBox(height: 170, width: double.infinity, child: CustomPaint(
                            painter: _TrendPainter(trends.map((e) => (e['count'] as num?)?.toDouble() ?? 0).toList(), Theme.of(context).colorScheme.primary, Theme.of(context).colorScheme.outlineVariant),
                          )),
                          const SizedBox(height: 8),
                          Text('${trends.first['date']} — ${trends.last['date']}', style: Theme.of(context).textTheme.bodySmall),
                          Text(t('منبع: backgammon_matches · تعداد اتاق‌های ایجادشده بر اساس زمان ثبت', 'Source: backgammon_matches · rooms created by creation time'), style: Theme.of(context).textTheme.bodySmall),
                        ]),
                  )),
                  const SizedBox(height: 18),
                  Text(t('گردش اعتبار داخلی در ۳۰ روز اخیر', 'Internal credit movement · last 30 days'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Card(child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      _MetricRow(label: t('تعداد تراکنش‌ها', 'Transactions'), value: _number(wallet['transactions'])),
                      _MetricRow(label: t('اعتبار ورودی', 'Credits in'), value: _number(wallet['creditsIn'])),
                      _MetricRow(label: t('اعتبار خروجی', 'Credits out'), value: _number(wallet['creditsOut'])),
                      const SizedBox(height: 6),
                      Text(t('این ارقام گردش اعتبار داخلی و غیرقابل‌انتقال هستند؛ درآمد نقدی یا سود محسوب نمی‌شوند.', 'These are internal non-transferable credits, not cash revenue or profit.'), style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
                    ]),
                  )),
                  const SizedBox(height: 18),
                  Text(t('شاخص‌های دارای پوشش ناقص', 'Metrics with partial coverage'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Card(child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: partial.isEmpty
                      ? Text(t('موردی ثبت نشده است.', 'None reported.'))
                      : Column(crossAxisAlignment: CrossAxisAlignment.start, children: partial.map((item) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.warning_amber_outlined, size: 17), const SizedBox(width: 8), Expanded(child: Text(item))]),
                        )).toList()),
                  )),
                  const SizedBox(height: 12),
                  Text(t('شاخص‌هایی که هنوز ابزارگذاری نشده‌اند', 'Metrics not yet instrumented'), style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Card(child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: unavailable.isEmpty
                      ? Text(t('همه شاخص‌های فهرست‌شده ابزارگذاری شده‌اند.', 'All listed metrics are instrumented.'))
                      : Column(crossAxisAlignment: CrossAxisAlignment.start, children: unavailable.map((item) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.info_outline, size: 17), const SizedBox(width: 8), Expanded(child: Text(item))]),
                        )).toList(),
                      ),
                  )),
                  const SizedBox(height: 12),
                  Text(t('این نسخه فقط داده‌های موجود و تأییدشده در پایگاه داده را نشان می‌دهد. آمار DAU/WAU/MAU، فعالیت شطرنج و بازی‌های کارتی، سلامت زیرساخت و هزینه Agentها تا زمان ثبت منابع معتبر نمایش داده نمی‌شوند.', 'This version displays only verified existing database data. DAU/WAU/MAU, chess and card activity, infrastructure health, and agent costs remain unavailable until reliable sources are instrumented.'), style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.title, required this.value, required this.icon});
  final String title;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 164,
    child: Card(child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 21),
        const SizedBox(height: 8),
        Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(title, style: Theme.of(context).textTheme.bodySmall),
      ]),
    )),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.value});
  final String label;
  final dynamic value;
  @override
  Widget build(BuildContext context) => Chip(label: Text('$label: ${value ?? '—'}'));
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(children: [Expanded(child: Text(label)), Text(value, style: const TextStyle(fontWeight: FontWeight.bold))]),
  );
}

class _TrendPainter extends CustomPainter {
  _TrendPainter(this.values, this.lineColor, this.gridColor);
  final List<double> values;
  final Color lineColor;
  final Color gridColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final grid = Paint()..color = gridColor..strokeWidth = 1;
    for (var i = 0; i < 4; i++) {
      final y = size.height * i / 3;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final maxValue = values.fold<double>(0, (a, b) => a > b ? a : b);
    final scale = maxValue <= 0 ? 1 : maxValue;
    final points = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final x = values.length == 1 ? size.width / 2 : size.width * i / (values.length - 1);
      final y = size.height - (values[i] / scale) * (size.height - 12) - 6;
      points.add(Offset(x, y));
    }
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 1; i < points.length; i++) {
      path.lineTo(points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, Paint()..color = lineColor..strokeWidth = 2.5..style = PaintingStyle.stroke..strokeCap = StrokeCap.round);
    for (final point in points) {
      canvas.drawCircle(point, 2.5, Paint()..color = lineColor);
    }
  }

  @override
  bool shouldRepaint(covariant _TrendPainter oldDelegate) =>
      oldDelegate.values != values || oldDelegate.lineColor != lineColor || oldDelegate.gridColor != gridColor;
}
