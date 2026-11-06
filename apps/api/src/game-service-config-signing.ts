import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign as cryptoSign, timingSafeEqual } from 'node:crypto';

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
export type PublicGameServices = { uno?: string | null };

export function canonicalGameServiceConfig(version: number, services: PublicGameServices): Buffer {
  return Buffer.from(JSON.stringify({ version, services: { uno: services.uno ?? null } }), 'utf8');
}

/** Derive a domain-separated Ed25519 key from JWT_SECRET; private material never enters the database. */
export function signGameServiceConfig(
  version: number,
  services: PublicGameServices,
  jwtSecret: string = process.env.JWT_SECRET ?? '',
) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Game service configuration version must be a positive safe integer.');
  if (Buffer.byteLength(jwtSecret, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes to sign game service configuration.');
  const seed = Buffer.from(hkdfSync(
    'sha256',
    Buffer.from(jwtSecret, 'utf8'),
    Buffer.from('royal-club-game-service-config-v1', 'utf8'),
    Buffer.from('ed25519', 'utf8'),
    32,
  ));
  const privateKey = createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicDer = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const publicBytes = Buffer.from(publicDer).subarray(-32);
  const signature = cryptoSign(null, canonicalGameServiceConfig(version, services), privateKey);
  const keyId = createHash('sha256').update(publicBytes).digest('hex').slice(0, 16);
  return {
    algorithm: 'Ed25519' as const,
    keyId,
    publicKey: publicBytes.toString('base64'),
    signature: signature.toString('base64'),
  };
}

export function verifyGameServiceConfigSignature(
  version: number,
  services: PublicGameServices,
  provided: { algorithm?: string; keyId?: string; publicKey?: string; signature?: string },
  jwtSecret: string = process.env.JWT_SECRET ?? '',
): boolean {
  try {
    const expected = signGameServiceConfig(version, services, jwtSecret);
    if (provided.algorithm !== expected.algorithm ||
        provided.keyId !== expected.keyId ||
        provided.publicKey !== expected.publicKey ||
        typeof provided.signature !== 'string') return false;
    const actualBytes = Buffer.from(provided.signature, 'base64');
    const expectedBytes = Buffer.from(expected.signature, 'base64');
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}
