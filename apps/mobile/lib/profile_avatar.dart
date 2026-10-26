import 'dart:convert';
import 'package:flutter/material.dart';

/// Shared profile-photo renderer for friend, chat, leaderboard, and match UI.
class RoyalAvatar extends StatelessWidget {
  final String? dataUrl;
  final double radius;
  final Color backgroundColor;
  final Color foregroundColor;

  const RoyalAvatar({
    super.key,
    required this.dataUrl,
    this.radius = 22,
    this.backgroundColor = const Color(0xFF283750),
    this.foregroundColor = const Color(0xFFD8B45A),
  });

  @override
  Widget build(BuildContext context) {
    final value = dataUrl?.trim();
    ImageProvider<Object>? image;
    if (value != null && value.startsWith('data:image/')) {
      final comma = value.indexOf(',');
      if (comma > 0 && comma < value.length - 1) {
        try {
          image = MemoryImage(base64Decode(value.substring(comma + 1)));
        } on FormatException {
          image = null;
        }
      }
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor,
      backgroundImage: image,
      child: image == null
          ? Icon(Icons.person_outline, color: foregroundColor, size: radius * 1.05)
          : null,
    );
  }
}
