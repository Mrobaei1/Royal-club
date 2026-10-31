import { createHmac, timingSafeEqual } from 'node:crypto';

export type RoyalTokenClaims = Record<string, unknown> & {
  sub: string;
  exp: number;
  ver: number;
};

function decodePart(value: string): Record<string, unknown> {
  const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Invalid token segment.');
  }
  return decoded as Record<string, unknown>;
}

export function verifyRoyalHs256Token(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): RoyalTokenClaims {
  if (!secret || secret.length < 32) throw new Error('JWT secret is not configured.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token.');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (header.alg !== 'HS256') throw new Error('Unsupported token algorithm.');
  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = Buffer.from(signaturePart, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid token signature.');
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
    throw new Error('Token expired.');
  }
  if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || payload.nbf > nowSeconds)) {
    throw new Error('Token is not active.');
  }
  const subject = payload.sub ?? payload.id;
  if ((typeof subject !== 'string' && typeof subject !== 'number') || String(subject).length === 0) {
    throw new Error('Token is missing the subject.');
  }
  if (!Number.isSafeInteger(payload.ver) || Number(payload.ver) < 0) {
    throw new Error('Token is missing a valid version.');
  }
  return { ...payload, sub: String(subject), exp: payload.exp, ver: Number(payload.ver) };
}
