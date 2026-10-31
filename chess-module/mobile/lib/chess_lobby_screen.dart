import 'package:flutter/material.dart';
import 'chess_admin_settings_screen.dart';

typedef ChessCreateRoom = Future<void> Function(
  String timeControlId, int minOpponentLevel, bool chatEnabled, bool voiceEnabled,
);
typedef ChessJoinRoom = Future<void> Function(String roomCode);
typedef ChessMatchmakingAction = Future<void> Function(String timeControlId, int minOpponentLevel);

class ChessLobbyScreen extends StatefulWidget {
  const ChessLobbyScreen({
    super.key,
    required this.timeControls,
    required this.onCreateRoom,
    required this.onJoinRoom,
    required this.onJoinMatchmaking,
    required this.onCancelMatchmaking,
    this.isSearching = false,
    this.errorMessage,
  });

  final List<ChessTimeControl> timeControls;
  final ChessCreateRoom onCreateRoom;
  final ChessJoinRoom onJoinRoom;
  final ChessMatchmakingAction onJoinMatchmaking;
  final VoidCallback onCancelMatchmaking;
  final bool isSearching;
  final String? errorMessage;

  @override
  State<ChessLobbyScreen> createState() => _ChessLobbyScreenState();
}

class _ChessLobbyScreenState extends State<ChessLobbyScreen> {
  final _roomCode = TextEditingController();
  final _level = TextEditingController(text: '1');
  String? _timeControlId;
  bool _chatEnabled = true;
  bool _voiceEnabled = false;
  bool _busy = false;

  bool _fa(BuildContext context) => Localizations.localeOf(context).languageCode == 'fa';

  @override
  void didUpdateWidget(covariant ChessLobbyScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_timeControlId == null && widget.timeControls.isNotEmpty) {
      _timeControlId = widget.timeControls.first.id;
    }
  }

  @override
  void dispose() {
    _roomCode.dispose();
    _level.dispose();
    super.dispose();
  }

  int? get _minimumLevel {
    final value = int.tryParse(_level.text);
    return value != null && value >= 1 && value <= 10000 ? value : null;
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fa = _fa(context);
    final enabledControls = widget.timeControls.where((item) => item.enabled).toList();
    final selected = enabledControls.any((item) => item.id == _timeControlId)
        ? _timeControlId : (enabledControls.isEmpty ? null : enabledControls.first.id);
    final valid = selected != null && _minimumLevel != null;
    return Scaffold(
      appBar: AppBar(title: Text(fa ? 'بازی شطرنج آنلاین' : 'Online chess')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(fa ? 'تنظیمات بازی' : 'Game settings', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: selected,
            decoration: InputDecoration(labelText: fa ? 'زمان بازی' : 'Time control'),
            items: [
              for (final item in enabledControls)
                DropdownMenuItem(value: item.id, child: Text(item.displayName)),
            ],
            onChanged: _busy ? null : (value) => setState(() => _timeControlId = value),
          ),
          TextField(
            controller: _level,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: fa ? 'حداقل سطح حریف' : 'Minimum opponent level',
              helperText: fa ? 'از ۱ تا ۱۰۰۰۰' : 'Between 1 and 10000',
            ),
            onChanged: (_) => setState(() {}),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(fa ? 'چت متنی' : 'Text chat'),
            value: _chatEnabled,
            onChanged: _busy ? null : (value) => setState(() => _chatEnabled = value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(fa ? 'میکروفون در بازی' : 'In-game voice'),
            subtitle: Text(fa ? 'میزبان می‌تواند بعداً آن را خاموش کند' : 'The host can disable it during the game'),
            value: _voiceEnabled,
            onChanged: _busy ? null : (value) => setState(() => _voiceEnabled = value),
          ),
          FilledButton.icon(
            onPressed: !valid || _busy ? null : () => _run(() =>
              widget.onCreateRoom(selected, _minimumLevel!, _chatEnabled, _voiceEnabled)),
            icon: const Icon(Icons.add_circle_outline),
            label: Text(fa ? 'ساخت اتاق خصوصی' : 'Create private room'),
          ),
          const Divider(height: 32),
          Text(fa ? 'ورود به اتاق' : 'Join a room', style: Theme.of(context).textTheme.titleMedium),
          TextField(
            controller: _roomCode,
            textCapitalization: TextCapitalization.characters,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: fa ? 'کد اتاق' : 'Room code'),
          ),
          OutlinedButton(
            onPressed: _busy || _roomCode.text.trim().isEmpty
                ? null : () => _run(() => widget.onJoinRoom(_roomCode.text.trim().toUpperCase())),
            child: Text(fa ? 'ورود به اتاق' : 'Join room'),
          ),
          const Divider(height: 32),
          Text(fa ? 'حریف تصادفی' : 'Random opponent', style: Theme.of(context).textTheme.titleMedium),
          if (widget.isSearching)
            OutlinedButton.icon(
              onPressed: _busy ? null : widget.onCancelMatchmaking,
              icon: const Icon(Icons.close),
              label: Text(fa ? 'لغو جستجوی حریف' : 'Cancel matchmaking'),
            )
          else
            FilledButton.icon(
              onPressed: !valid || _busy ? null : () => _run(() =>
                widget.onJoinMatchmaking(selected, _minimumLevel!)),
              icon: const Icon(Icons.shuffle),
              label: Text(fa ? 'پیدا کردن حریف' : 'Find opponent'),
            ),
          if (widget.isSearching)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(fa ? 'در حال جستجوی بازیکن مناسب…' : 'Searching for a compatible player…'),
            ),
          if (widget.errorMessage != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(widget.errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
        ],
      ),
    );
  }
}
