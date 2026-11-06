import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { canonicalGameServiceConfig, signGameServiceConfig } from './game-service-config-signing.js';

const SECRET = 'royal-club-test-jwt-secret-with-32-bytes-minimum';

test('game service config signature verifies and binds version and service origin', () => {
  const services = { uno: 'https://uno.example.com' };
  const signed = signGameServiceConfig(7, services, SECRET);
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(signed.publicKey, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  const signature = Buffer.from(signed.signature, 'base64');
  assert.equal(signed.algorithm, 'Ed25519');
  assert.equal(cryptoVerify(null, canonicalGameServiceConfig(7, services), publicKey, signature), true);
  assert.equal(cryptoVerify(null, canonicalGameServiceConfig(8, services), publicKey, signature), false);
  assert.equal(cryptoVerify(null, canonicalGameServiceConfig(7, { uno: 'https://attacker.example.com' }), publicKey, signature), false);
});

test('game service signing rejects weak secrets and invalid versions', () => {
  assert.throws(() => signGameServiceConfig(1, { uno: null }, 'short'), /32 bytes/);
  assert.throws(() => signGameServiceConfig(0, { uno: null }, SECRET), /positive safe integer/);
});
