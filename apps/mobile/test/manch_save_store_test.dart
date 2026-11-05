import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/games/manch/manch_game_state.dart';
import 'package:royal_club/games/manch/manch_rule_profile.dart';
import 'package:royal_club/games/manch/manch_save_store.dart';

void main() {
  final state = ManchGameState(
    players: [
      ManchPlayerState(colour: ManchColour.red),
      ManchPlayerState(colour: ManchColour.yellow),
    ],
    activePlayerIndex: 1,
    profile: const ManchRuleProfile(),
    turnNumber: 4,
  );

  test('v2 save envelope round-trips the complete offline game state', () {
    final encoded = ManchSaveCodec.encode(state);
    final envelope = jsonDecode(encoded) as Map<String, dynamic>;
    expect(envelope['storageVersion'], 2);
    expect(ManchSaveCodec.decode(encoded).toJson(), state.toJson());
  });

  test('legacy raw v1 game state remains readable for migration', () {
    final legacy = jsonEncode(state.toJson());
    expect(ManchSaveCodec.decode(legacy).toJson(), state.toJson());
  });

  test('unsupported storage envelope versions are rejected explicitly', () {
    expect(
      () => ManchSaveCodec.decode(
        jsonEncode({'storageVersion': 99, 'state': state.toJson()}),
      ),
      throwsFormatException,
    );
  });

  test('truncated or malformed save envelopes are rejected', () {
    expect(
      () => ManchSaveCodec.decode(
        jsonEncode({'storageVersion': 2, 'state': null}),
      ),
      throwsFormatException,
    );
    expect(() => ManchSaveCodec.decode('{broken'), throwsFormatException);
  });
}
