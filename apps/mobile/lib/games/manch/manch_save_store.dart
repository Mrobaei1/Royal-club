import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'manch_game_state.dart';

abstract interface class ManchSaveStore {
  Future<void> save(ManchGameState state);
  Future<ManchGameState?> load();
}

/// Versioned persistence codec. Storage and game-state schema versions are
/// independent so future storage changes can migrate without changing rules.
abstract final class ManchSaveCodec {
  static const int currentStorageVersion = 2;

  static String encode(ManchGameState state) => jsonEncode({
        'storageVersion': currentStorageVersion,
        'state': state.toJson(),
      });

  /// Reads the current envelope and legacy v1 raw game-state JSON.
  static ManchGameState decode(String value) {
    final decoded = jsonDecode(value);
    if (decoded is! Map) {
      throw const FormatException('Invalid saved Manch game.');
    }
    final map = Map<String, Object?>.from(decoded);
    final storageVersion = map['storageVersion'];
    if (storageVersion == null) {
      return ManchGameState.fromJson(map);
    }
    if (storageVersion != currentStorageVersion) {
      throw FormatException('Unsupported Manch storage version: $storageVersion.');
    }
    final rawState = map['state'];
    if (rawState is! Map) {
      throw const FormatException('Saved Manch state is missing.');
    }
    return ManchGameState.fromJson(Map<String, Object?>.from(rawState));
  }
}

class SecureManchSaveStore implements ManchSaveStore {
  const SecureManchSaveStore({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  static const String storageKey = 'royal_club_manch_offline_save_v2';
  static const String legacyStorageKey = 'royal_club_manch_offline_save_v1';
  final FlutterSecureStorage _storage;

  @override
  Future<void> save(ManchGameState state) => _storage.write(
        key: storageKey,
        value: ManchSaveCodec.encode(state),
      );

  @override
  Future<ManchGameState?> load() async {
    final current = await _storage.read(key: storageKey);
    if (current != null && current.isNotEmpty) {
      return ManchSaveCodec.decode(current);
    }
    final legacy = await _storage.read(key: legacyStorageKey);
    if (legacy == null || legacy.isEmpty) return null;
    final state = ManchSaveCodec.decode(legacy);
    await save(state);
    await _storage.delete(key: legacyStorageKey);
    return state;
  }
}
