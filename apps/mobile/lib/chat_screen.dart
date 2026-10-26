import 'package:flutter/material.dart';
import 'profile_avatar.dart';
import 'services/auth_service.dart';
import 'services/chat_service.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _conversations = [];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final items = await ChatService.conversations();
      if (mounted) setState(() { _conversations = items; _loading = false; _error = null; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(title: const Text('گفت‌وگوهای خصوصی'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
        : _conversations.isEmpty ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('برای شروع گفت‌وگو، ابتدا یک دوست اضافه کنید.')))
        : RefreshIndicator(onRefresh: _load, child: ListView.separated(
          itemCount: _conversations.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = _conversations[index] as Map<String, dynamic>;
            final unread = (item['unreadCount'] as num?)?.toInt() ?? 0;
            return ListTile(
              leading: RoyalAvatar(dataUrl: item['avatarDataUrl']?.toString(), radius: 22),
              title: Text(item['fullName']?.toString().isNotEmpty == true ? item['fullName'].toString() : item['email']?.toString() ?? 'دوست'),
              subtitle: Text(item['lastMessage']?.toString() ?? 'برای شروع گفت‌وگو لمس کنید', maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: unread > 0 ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11))) : const Icon(Icons.chevron_left),
              onTap: () async {
                await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatThreadScreen(
                  userId: item['userId'].toString(),
                  title: item['fullName']?.toString().isNotEmpty == true ? item['fullName'].toString() : item['email'].toString(),
                )));
                _load();
              },
            );
          },
        )),
    ),
  );
}

class ChatThreadScreen extends StatefulWidget {
  final String userId;
  final String title;
  const ChatThreadScreen({super.key, required this.userId, required this.title});
  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _composer = TextEditingController();
  bool _loading = true;
  bool _sending = false;
  String? _error;
  String? _myId;
  List<dynamic> _messages = [];

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() { _composer.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final results = await Future.wait([ChatService.messages(widget.userId), AuthService.me()]);
      final profile = results[1] as Map<String, dynamic>;
      final user = profile['user'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          _messages = results[0] as List<dynamic>;
          _myId = user?['id']?.toString();
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  Future<void> _reportUser() async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('گزارش کاربر'),
        content: TextField(
          controller: reasonController,
          autofocus: true,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          decoration: const InputDecoration(
            hintText: 'دلیل گزارش را توضیح دهید (حداقل ۳ نویسه)',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('انصراف')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, reasonController.text.trim()), child: const Text('ارسال گزارش')),
        ],
      ),
    );
    reasonController.dispose();
    if (reason == null || reason.trim().length < 3 || !mounted) return;
    try {
      final result = await ChatService.report(widget.userId, reason.trim());
      if (!mounted) return;
      final review = result['moderationReviewTriggered'] == true
          ? ' گزارش برای بررسی مدیر در صف قرار گرفت.'
          : '';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('گزارش ثبت شد.$review')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Future<void> _send() async {
    final body = _composer.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ChatService.send(widget.userId, body);
      _composer.clear();
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(
      appBar: AppBar(title: Text(widget.title), actions: [IconButton(tooltip: 'گزارش کاربر', onPressed: _reportUser, icon: const Icon(Icons.flag_outlined)), IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: Column(children: [
        Expanded(child: _loading ? const Center(child: CircularProgressIndicator())
          : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!, textAlign: TextAlign.center)))
          : _messages.isEmpty ? const Center(child: Text('هنوز پیامی ارسال نشده است.'))
          : ListView.builder(
            reverse: false,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (context, index) {
              final message = _messages[index] as Map<String, dynamic>;
              final mine = message['senderId'].toString() == _myId;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .78),
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: mine ? const Color(0xFF253650) : const Color(0xFF17243A),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: mine ? const Color(0xFFD8B45A).withValues(alpha: .5) : Colors.white12),
                  ),
                  child: Text(message['body']?.toString() ?? ''),
                ),
              );
            },
          )),
        SafeArea(child: Padding(padding: const EdgeInsets.all(10), child: Row(children: [
          Expanded(child: TextField(controller: _composer, minLines: 1, maxLines: 4, maxLength: 2000, decoration: const InputDecoration(hintText: 'پیام بنویسید...', border: OutlineInputBorder(), counterText: ''))),
          const SizedBox(width: 8),
          IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send)),
        ]))),
      ]),
    ),
  );
}
