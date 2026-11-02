import 'package:flutter/material.dart';

class UnoChatPanel extends StatelessWidget {
  const UnoChatPanel({
    super.key,
    required this.controller,
    required this.messages,
    required this.enabled,
    required this.onSend,
  });

  final TextEditingController controller;
  final List<Map<String, dynamic>> messages;
  final bool enabled;
  final VoidCallback onSend;

  bool _isPersian(BuildContext context) => Localizations.localeOf(context).languageCode == 'fa';

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_isPersian(context) ? 'چت میز' : 'Table chat', style: const TextStyle(fontWeight: FontWeight.bold)),
              SizedBox(
                height: 130,
                child: ListView(
                  children: messages
                      .map((message) => Text(
                            '@${message['username']}: ${message['text']}',
                          ))
                      .toList(),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      enabled: enabled,
                      maxLength: 500,
                      decoration: InputDecoration(
                        hintText: _isPersian(context) ? 'پیام بنویس…' : 'Write a message…',
                        counterText: '',
                      ),
                      onSubmitted: enabled ? (_) => onSend() : null,
                    ),
                  ),
                  IconButton(
                    tooltip: _isPersian(context) ? 'ارسال پیام' : 'Send message',
                    onPressed: enabled ? onSend : null,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}
