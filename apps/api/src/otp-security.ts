import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

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

export function digestOtp(code: string, pepper: string, salt = randomBytes(16).toString('hex')): OtpDigest {
  if (!pepper || pepper.length < 32) throw new Error('A server-side OTP pepper is required.');
  return {
    salt,
    digest: createHmac('sha256', pepper).update(`${salt}:${code}`, 'utf8').digest('hex'),
  };
}

export function verifyOtpDigest(code: string, stored: OtpDigest, pepper: string): boolean {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{32}$/.test(stored.salt) ||
      !/^[a-f0-9]{64}$/.test(stored.digest)) return false;
  if (!pepper || pepper.length < 32) return false;
  const candidate = Buffer.from(digestOtp(code, pepper, stored.salt).digest, 'hex');
  const expected = Buffer.from(stored.digest, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
