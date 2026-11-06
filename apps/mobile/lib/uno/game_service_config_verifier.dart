import 'dart:convert';
import 'package:cryptography/cryptography.dart';

Future<bool> verifyGameServiceConfigSignature({
  required int version,
  required String? unoOrigin,
  required String signatureBase64,
  required String publicKeyBase64,
}) async {
  try {
    final payload = utf8.encode(jsonEncode({
      'version': version,
      'services': {'uno': unoOrigin},
    }));
    final algorithm = Ed25519();
    final publicKey = SimplePublicKey(
      base64Decode(publicKeyBase64),
      type: KeyPairType.ed25519,
    );
    final signature = Signature(
      base64Decode(signatureBase64),
      publicKey: publicKey,
    );
    return await algorithm.verify(payload, signature: signature);
  } catch (_) {
    return false;
  }
}
