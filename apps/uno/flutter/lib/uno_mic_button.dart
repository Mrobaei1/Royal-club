import 'package:flutter/material.dart';

class UnoMicButton extends StatelessWidget {
  const UnoMicButton({
    super.key,
    required this.muted,
    required this.enabled,
    required this.onPressed,
  });

  final bool muted;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: muted ? 'روشن‌کردن میکروفون' : 'خاموش‌کردن میکروفون',
        icon: Icon(muted ? Icons.mic_off : Icons.mic),
        onPressed: enabled ? onPressed : null,
      );
}
