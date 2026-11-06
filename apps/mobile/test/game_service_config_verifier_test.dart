import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:royal_club/uno/game_service_config_verifier.dart';

void main() {
  test('accepts a valid Ed25519 signature for the exact version and service origin', () async {
    final algorithm = Ed25519();
    final keyPair = await algorithm.newKeyPairFromSeed(List<int>.generate(32, (i) => i + 1));
    final publicKey = await keyPair.extractPublicKey();
    final message = utf8.encode(jsonEncode({
      'version': 4,
      'services': {'uno': 'https://uno.example.com'},
    }));
    final signature = await algorithm.sign(message, keyPair: keyPair);
    final valid = await verifyGameServiceConfigSignature(
      version: 4,
      unoOrigin: 'https://uno.example.com',
      signatureBase64: base64Encode(signature.bytes),
      publicKeyBase64: base64Encode(publicKey.bytes),
    );
    expect(valid, isTrue);
  });

  test('rejects tampered version, origin and malformed signatures', () async {
    final algorithm = Ed25519();
    final keyPair = await algorithm.newKeyPairFromSeed(List<int>.generate(32, (i) => i + 1));
    final publicKey = await keyPair.extractPublicKey();
    final message = utf8.encode(jsonEncode({
      'version': 4,
      'services': {'uno': 'https://uno.example.com'},
    }));
    final signature = await algorithm.sign(message, keyPair: keyPair);
    final signatureBase64 = base64Encode(signature.bytes);
    final publicKeyBase64 = base64Encode(publicKey.bytes);
    expect(await verifyGameServiceConfigSignature(
      version: 5, unoOrigin: 'https://uno.example.com',
      signatureBase64: signatureBase64, publicKeyBase64: publicKeyBase64,
    ), isFalse);
    expect(await verifyGameServiceConfigSignature(
      version: 4, unoOrigin: 'https://evil.example.com',
      signatureBase64: signatureBase64, publicKeyBase64: publicKeyBase64,
    ), isFalse);
    expect(await verifyGameServiceConfigSignature(
      version: 4, unoOrigin: 'https://uno.example.com',
      signatureBase64: 'bad', publicKeyBase64: publicKeyBase64,
    ), isFalse);
  });
}
