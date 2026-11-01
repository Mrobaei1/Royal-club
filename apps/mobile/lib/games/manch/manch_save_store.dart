import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'manch_game_state.dart';

abstract interface class ManchSaveStore {
  Future<void> save(ManchGameState state);
  Future<ManchGameState?> load();
}

class SecureManchSaveStore implements ManchSaveStore {
  const SecureManchSaveStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  static const String storageKey = 'royal_club_manch_offline_save_v1';
  final FlutterSecureStorage _storage;

  @override
  Future<void> save(ManchGameState state) => _storage.write(
        key: storageKey,
        value: jsonEncode(state.toJson()),
      );

  @override
  Future<ManchGameState?> load() async {
    final value = await _storage.read(key: storageKey);
    if (value == null || value.isEmpty) return null;
    final decoded = jsonDecode(value);
    if (decoded is! Map) {
      throw const FormatException('Invalid saved Manch game.');
    }
    return ManchGameState.fromJson(Map<String, Object?>.from(decoded));
  }
}
