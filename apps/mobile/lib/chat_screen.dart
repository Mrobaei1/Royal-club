import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
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

  bool get _isEnglish => Localizations.localeOf(context).languageCode == 'en';

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: (_isEnglish ? TextDirection.ltr : TextDirection.rtl),
    child: Scaffold(
      appBar: AppBar(title: Text(_isEnglish ? 'Private chats' : 'گفت‌وگوهای خصوصی'), actions: [IconButton(tooltip: _isEnglish ? 'Refresh' : 'به‌روزرسانی', onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading ? const Center(child: CircularProgressIndicator())
        : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
        : _conversations.isEmpty ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text(_isEnglish ? 'Add a friend to start a conversation.' : 'برای شروع گفت‌وگو، ابتدا یک دوست اضافه کنید.')))
        : RefreshIndicator(onRefresh: _load, child: ListView.separated(
          itemCount: _conversations.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = _conversations[index] as Map<String, dynamic>;
            final unread = (item['unreadCount'] as num?)?.toInt() ?? 0;
            return ListTile(
              leading: RoyalAvatar(dataUrl: item['avatarDataUrl']?.toString(), radius: 22),
              title: Text(item['username']?.toString().isNotEmpty == true ? '@${item['username']}' : 'دوست'),
              subtitle: Text(item['lastMessage']?.toString() ?? (_isEnglish ? 'Tap to start chatting' : 'برای شروع گفت‌وگو لمس کنید'), maxLines: 1, overflow: TextOverflow.ellipsis),
              trailing: unread > 0 ? CircleAvatar(radius: 12, child: Text('$unread', style: const TextStyle(fontSize: 11))) : const Icon(Icons.chevron_left),
              onTap: () async {
                await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatThreadScreen(
                  userId: item['userId'].toString(),
                  title: item['username']?.toString().isNotEmpty == true ? '@${item['username']}' : (_isEnglish ? 'Friend' : 'دوست'),
                  avatarDataUrl: item['avatarDataUrl']?.toString(),
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
  final String? avatarDataUrl;
  const ChatThreadScreen({super.key, required this.userId, required this.title, this.avatarDataUrl});
  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final _composer = TextEditingController();
  bool _loading = true;
  bool _sending = false;
  bool _showEmojiPicker = false;
  final ImagePicker _imagePicker = ImagePicker();
  String? _error;
  String? _myId;
  List<dynamic> _messages = [];
  final Set<String> _selectedMessageIds = <String>{};

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
          _selectedMessageIds.clear();
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
        title: Text(_isEnglish ? 'Report user' : 'گزارش کاربر'),
        content: TextField(
          controller: reasonController,
          autofocus: true,
          minLines: 2,
          maxLines: 5,
          maxLength: 1000,
          decoration: const InputDecoration(
            hintText: _isEnglish ? 'Describe the reason (at least 3 characters)' : 'دلیل گزارش را توضیح دهید (حداقل ۳ نویسه)',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(_isEnglish ? 'Cancel' : 'انصراف')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, reasonController.text.trim()), child: Text(_isEnglish ? 'Submit report' : 'ارسال گزارش')),
        ],
      ),
    );
    reasonController.dispose();
    if (reason == null || reason.trim().length < 3 || !mounted) return;
    try {
      final result = await ChatService.report(widget.userId, reason.trim());
      if (!mounted) return;
      final review = result['moderationReviewTriggered'] == true
          ? (_isEnglish ? ' The report was queued for moderator review.' : ' گزارش برای بررسی مدیر در صف قرار گرفت.')
          : '';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text((_isEnglish ? 'Report submitted.$review' : 'گزارش ثبت شد.$review'))));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  bool get _isEnglish => Localizations.localeOf(context).languageCode == 'en';

  void _toggleMessageSelection(String id) {
    setState(() {
      if (!_selectedMessageIds.add(id)) _selectedMessageIds.remove(id);
    });
  }

  Future<void> _editMessage(Map<String, dynamic> message) async {
    final id = message['id']?.toString();
    if (id == null || message['senderId']?.toString() != _myId || message['deletedForAll'] == true ||
        (message['body']?.toString().startsWith('data:image/') ?? false)) return;
    final controller = TextEditingController(text: message['body']?.toString() ?? '');
    final body = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_isEnglish ? 'Edit message' : 'ویرایش پیام'),
        content: TextField(controller: controller, autofocus: true, maxLength: 2000, minLines: 1, maxLines: 5),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: Text(_isEnglish ? 'Cancel' : 'انصراف')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text.trim()), child: Text(_isEnglish ? 'Save' : 'ذخیره')),
        ],
      ),
    );
    controller.dispose();
    if (body == null || body.isEmpty || !mounted) { return; }
    try { await ChatService.edit(widget.userId, id, body); await _load(); }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', '')))); }
  }

  Future<void> _deleteSelected({required bool forBoth}) async {
    final isEnglish = _isEnglish;
    final selected = _messages.where((m) => _selectedMessageIds.contains(m['id']?.toString())).toList();
    if (selected.isEmpty) return;
    if (forBoth && selected.any((m) => m['senderId']?.toString() != _myId)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(isEnglish ? 'You can delete for everyone only messages you sent.' : 'حذف برای هر دو طرف فقط برای پیام‌های ارسالی خودتان ممکن است.')));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(forBoth ? (isEnglish ? 'Delete for everyone?' : 'حذف برای هر دو طرف؟') : (isEnglish ? 'Delete for me?' : 'حذف از طرف من؟')),
        content: Text(isEnglish ? 'Delete selected message(s)?' : 'پیام‌های انتخاب‌شده حذف شوند؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: Text(isEnglish ? 'Cancel' : 'انصراف')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: Text(isEnglish ? 'Delete' : 'حذف')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try { await ChatService.deleteMessages(widget.userId, selected.map((m) => m['id'].toString()).toList(), forBoth: forBoth); await _load(); }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', '')))); }
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

  Future<void> _sendImage() async {
    if (_sending) return;
    try {
      final picked = await _imagePicker.pickImage(source: ImageSource.gallery, imageQuality: 65, maxWidth: 1100, maxHeight: 1100);
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      if (!mounted) return;
      final mimeType = picked.mimeType == 'image/png' ? 'image/png' : 'image/jpeg';
      final encoded = 'data:$mimeType;base64,${base64Encode(bytes)}';
      if (encoded.length > 680000) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_isEnglish ? 'The image is too large. Please choose a smaller image.' : 'حجم تصویر زیاد است؛ لطفاً تصویر کوچک‌تری انتخاب کنید.')));
        return;
      }
      setState(() => _sending = true);
      await ChatService.send(widget.userId, encoded);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _messageContent(String body) {
    if (!body.startsWith('data:image/') || !body.contains(';base64,')) return Text(body);
    try {
      final encoded = body.substring(body.indexOf(';base64,') + 8);
      return ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.memory(base64Decode(encoded), width: 230, fit: BoxFit.contain, errorBuilder: (_, __, ___) => Text(_isEnglish ? 'Unable to display image.' : 'نمایش تصویر ممکن نیست.')));
    } catch (_) { return Text(_isEnglish ? 'Invalid image.' : 'تصویر نامعتبر است.'); }
  }

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: (Localizations.localeOf(context).languageCode == 'en' ? TextDirection.ltr : TextDirection.rtl),
    child: Scaffold(
      appBar: AppBar(title: Row(children: [RoyalAvatar(dataUrl: widget.avatarDataUrl, radius: 16), const SizedBox(width: 8), Expanded(child: Text(_selectedMessageIds.isEmpty ? widget.title : (_isEnglish ? '${_selectedMessageIds.length} selected' : '${_selectedMessageIds.length} انتخاب‌شده'), maxLines: 1, overflow: TextOverflow.ellipsis))]), actions: [if (_selectedMessageIds.isNotEmpty) IconButton(tooltip: _isEnglish ? 'Delete for me' : 'حذف برای من', onPressed: () => _deleteSelected(forBoth: false), icon: const Icon(Icons.delete_outline)), if (_selectedMessageIds.isNotEmpty && _messages.where((m) => _selectedMessageIds.contains(m['id']?.toString())).every((m) => m['senderId']?.toString() == _myId)) IconButton(tooltip: _isEnglish ? 'Delete for everyone' : 'حذف برای هر دو طرف', onPressed: () => _deleteSelected(forBoth: true), icon: const Icon(Icons.delete_forever_outlined)), if (_selectedMessageIds.length == 1 && _messages.any((m) => m['id']?.toString() == _selectedMessageIds.first && m['senderId']?.toString() == _myId && m['deletedForAll'] != true && !(m['body']?.toString().startsWith('data:image/') ?? false))) IconButton(tooltip: _isEnglish ? 'Edit message' : 'ویرایش پیام', onPressed: () { final m = _messages.firstWhere((m) => m['id']?.toString() == _selectedMessageIds.first); _editMessage(Map<String, dynamic>.from(m as Map)); }, icon: const Icon(Icons.edit_outlined)), IconButton(tooltip: _isEnglish ? 'Report user' : 'گزارش کاربر', onPressed: _reportUser, icon: const Icon(Icons.flag_outlined)), IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: Column(children: [
        Expanded(child: _loading ? const Center(child: CircularProgressIndicator())
          : _error != null ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!, textAlign: TextAlign.center)))
          : _messages.isEmpty ? Center(child: Text(_isEnglish ? 'No messages yet.' : 'هنوز پیامی ارسال نشده است.'))
          : ListView.builder(
            reverse: false,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (context, index) {
              final message = _messages[index] as Map<String, dynamic>;
              final mine = message['senderId'].toString() == _myId;
              final messageId = message['id']?.toString() ?? '';
              final selected = _selectedMessageIds.contains(messageId);
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: GestureDetector(
                  onLongPress: () => _toggleMessageSelection(messageId),
                  onTap: _selectedMessageIds.isNotEmpty ? () => _toggleMessageSelection(messageId) : null,
                  child: Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .78),
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: selected ? Theme.of(context).colorScheme.secondaryContainer : (mine ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surface),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: mine ? Theme.of(context).colorScheme.primary.withValues(alpha: .5) : Theme.of(context).dividerColor),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    _messageContent(message['body']?.toString() ?? ''),
                    if (message['editedAt'] != null) Text(_isEnglish ? 'edited' : 'ویرایش‌شده', style: const TextStyle(fontSize: 10, color: Colors.white54)),
                  ]),
                ),
                ),
              );
            },
          )),
        SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.all(10), child: Row(children: [
            IconButton(
              tooltip: _isEnglish ? 'Send image' : 'ارسال تصویر',
              onPressed: _sending ? null : _sendImage,
              icon: const Icon(Icons.image_outlined),
            ),
            IconButton(
              tooltip: _showEmojiPicker ? (_isEnglish ? 'Close emoji picker' : 'بستن ایموجی‌ها') : (_isEnglish ? 'Add emoji' : 'افزودن ایموجی'),
              onPressed: () => setState(() => _showEmojiPicker = !_showEmojiPicker),
              icon: Icon(_showEmojiPicker ? Icons.keyboard_alt_outlined : Icons.emoji_emotions_outlined),
            ),
            Expanded(child: TextField(controller: _composer, minLines: 1, maxLines: 4, maxLength: 2000, decoration: InputDecoration(hintText: _isEnglish ? 'Write a message...' : 'پیام بنویسید...', border: const OutlineInputBorder(), counterText: ''))),
            const SizedBox(width: 8),
            IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send)),
          ])),
          if (_showEmojiPicker)
            SizedBox(
              height: 260,
              child: EmojiPicker(
                onEmojiSelected: (category, emoji) {
                  final text = _composer.text;
                  final selection = _composer.selection;
                  final start = selection.isValid ? selection.start : text.length;
                  final end = selection.isValid ? selection.end : text.length;
                  _composer.value = TextEditingValue(
                    text: text.replaceRange(start, end, emoji.emoji),
                    selection: TextSelection.collapsed(offset: start + emoji.emoji.length),
                  );
                },
                config: const Config(
                  height: 260,
                  checkPlatformCompatibility: true,
                  emojiViewConfig: EmojiViewConfig(emojiSizeMax: 28),
                ),
              ),
            ),
        ])),
      ]),
    ),
  );
}
