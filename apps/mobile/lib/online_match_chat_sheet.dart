import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'services/match_service.dart';

class OnlineMatchChatSheet extends StatefulWidget {
  final String matchId;
  final bool isEnglish;

  const OnlineMatchChatSheet({
    super.key,
    required this.matchId,
    required this.isEnglish,
  });

  @override
  State<OnlineMatchChatSheet> createState() => _OnlineMatchChatSheetState();
}

class _OnlineMatchChatSheetState extends State<OnlineMatchChatSheet> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  Timer? _poller;
  bool _loading = true;
  bool _sending = false;
  bool _refreshing = false;
  String? _error;
  String? _afterId;

  @override
  void initState() {
    super.initState();
    _refresh();
    _poller = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      _refresh(silent: true);
    });
  }

  @override
  void dispose() {
    _poller?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _refresh({bool silent = false}) async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final incoming = await MatchService.matchChatMessages(
        widget.matchId,
        afterId: _afterId,
      );
      if (!mounted) return;
      if (incoming.isNotEmpty) {
        setState(() {
          _messages.addAll(incoming);
          _afterId = incoming.last['id']?.toString() ?? _afterId;
          _error = null;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.animateTo(
              _scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
            );
          }
        });
      } else if (!silent) {
        setState(() => _error = null);
      }
    } catch (error) {
      if (mounted && !silent) {
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      _refreshing = false;
      if (mounted && _loading) setState(() => _loading = false);
    }
  }

  Future<void> _sendBody(String body, {bool clearComposer = false}) async {
    if (body.trim().isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await MatchService.sendMatchChatMessage(
        widget.matchId,
        body,
      );
      if (!mounted) return;
      setState(() {
        _messages.add(message);
        _afterId = message['id']?.toString() ?? _afterId;
        if (clearComposer) _controller.clear();
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _send() => _sendBody(_controller.text.trim(), clearComposer: true);

  Future<void> _pickImage() async {
    if (_loading || _sending) return;
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1280,
        maxHeight: 1280,
        imageQuality: 75,
      );
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      final name = picked.name.toLowerCase();
      final mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      final body = 'data:$mime;base64,${base64Encode(bytes)}';
      if (bytes.length > 500 * 1024) {
        if (mounted) {
          setState(() => _error = widget.isEnglish
              ? 'The selected image is too large (maximum 500 KiB).'
              : 'حجم تصویر انتخاب‌شده بیش از حد مجاز است (حداکثر ۵۰۰ کیلوبایت).');
        }
        return;
      }
      await _sendBody(body);
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  Widget _buildMessageBody(String body, Color textColor) {
    if (!body.startsWith('data:image/')) {
      return Text(body, style: TextStyle(color: textColor));
    }
    try {
      final separator = body.indexOf(',');
      if (separator < 0) throw const FormatException('Invalid image data URL');
      final bytes = base64Decode(body.substring(separator + 1));
      return ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: Image.memory(
          bytes,
          width: 230,
          height: 190,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Text(
            widget.isEnglish ? 'Image could not be displayed.' : 'نمایش تصویر ممکن نیست.',
            style: TextStyle(color: textColor),
          ),
        ),
      );
    } catch (_) {
      return Text(
        widget.isEnglish ? 'Invalid image message.' : 'پیام تصویری نامعتبر است.',
        style: TextStyle(color: textColor),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Directionality(
      textDirection: widget.isEnglish ? TextDirection.ltr : TextDirection.rtl,
      child: SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .72,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
                child: Row(
                  children: [
                    Icon(Icons.forum_outlined, color: colors.primary),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        widget.isEnglish ? 'Match chat' : 'گفت‌وگوی مسابقه',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: colors.primary,
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: widget.isEnglish ? 'Close' : 'بستن',
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _messages.isEmpty
                        ? Center(
                            child: Text(
                              widget.isEnglish
                                  ? 'No messages yet. Say hello!'
                                  : 'هنوز پیامی ارسال نشده است؛ شروع کنید!',
                              style: TextStyle(color: colors.onSurfaceVariant),
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            padding: const EdgeInsets.all(12),
                            itemCount: _messages.length,
                            itemBuilder: (context, index) {
                              final message = _messages[index];
                              final sender = message['senderUsername']?.toString() ?? 'player';
                              final body = message['body']?.toString() ?? '';
                              return Align(
                                alignment: AlignmentDirectional.centerStart,
                                child: Container(
                                  constraints: BoxConstraints(
                                    maxWidth: MediaQuery.sizeOf(context).width * .82,
                                  ),
                                  margin: const EdgeInsets.symmetric(vertical: 4),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                                  decoration: BoxDecoration(
                                    color: colors.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(13),
                                    border: Border.all(color: colors.outlineVariant),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('@$sender', style: TextStyle(
                                        color: colors.primary,
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                      )),
                                      const SizedBox(height: 3),
                                      _buildMessageBody(body, colors.onSurface),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ),
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: widget.isEnglish ? 'Attach image' : 'افزودن تصویر',
                      onPressed: _loading || _sending ? null : _pickImage,
                      icon: const Icon(Icons.image_outlined),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        enabled: !_loading && !_sending,
                        minLines: 1,
                        maxLines: 4,
                        maxLength: 2000,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _send(),
                        decoration: InputDecoration(
                          hintText: widget.isEnglish ? 'Write a message…' : 'پیام بنویسید…',
                          counterText: '',
                          isDense: true,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(22),
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: widget.isEnglish ? 'Send' : 'ارسال',
                      onPressed: _loading || _sending ? null : _send,
                      icon: _sending
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
