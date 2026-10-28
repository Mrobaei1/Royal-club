import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export type OtpDigest = { salt: string; digest: string };

export function normalizeIranianMobile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  let digits = compact.replace(/^\+/, '');
  if (digits.startsWith('0098')) digits = digits.slice(2);
  if (digits.startsWith('98')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^9\d{9}$/.test(digits)) return null;
  return `+98${digits}`;
}

export function createOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function digestOtp(code: string, salt = randomBytes(16).toString('hex')): OtpDigest {
  return {
    salt,
    digest: createHash('sha256').update(`${salt}:${code}`, 'utf8').digest('hex'),
  };
}

export function verifyOtpDigest(code: string, stored: OtpDigest): boolean {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{32}$/.test(stored.salt) ||
      !/^[a-f0-9]{64}$/.test(stored.digest)) return false;
  const candidate = Buffer.from(digestOtp(code, stored.salt).digest, 'hex');
  const expected = Buffer.from(stored.digest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
