import 'package:flutter/material.dart';

/// Shared, theme-aware hamburger menu for host/guest room and game controls.
class RoomControlsMenuButton extends StatelessWidget {
  final String tooltip;
  final List<Widget> Function(BuildContext sheetContext) itemsBuilder;

  const RoomControlsMenuButton({
    super.key,
    required this.tooltip,
    required this.itemsBuilder,
  });

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      icon: const Icon(Icons.menu_rounded),
      onPressed: () {
        showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (sheetContext) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(sheetContext).size.height * 0.8,
                ),
                child: ListView(
                  shrinkWrap: true,
                  children: itemsBuilder(sheetContext),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
