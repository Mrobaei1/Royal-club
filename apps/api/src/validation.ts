export function isNumericId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

/** Registration password policy: at least six Unicode characters and at most 128 UTF-8 bytes. */
export function isValidRegistrationPassword(value: unknown): value is string {
  return typeof value === 'string' &&
    Array.from(value).length >= 6 &&
    Buffer.byteLength(value, 'utf8') <= 128;
}
