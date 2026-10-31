export function isNumericId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\\d*$/.test(value);
}

/** Reserved platform identity names cannot be claimed by ordinary accounts. */
export function isReservedUsername(value: unknown): boolean {
  return typeof value === 'string' && value.trim().replace(/^@/, '').toLowerCase() === 'elizarya';
}

/** Registration password policy: at least six Unicode characters and at most 128 UTF-8 bytes. */
export function isValidRegistrationPassword(value: unknown): value is string {
  return typeof value === 'string' &&
    Array.from(value).length >= 6 &&
    Buffer.byteLength(value, 'utf8') <= 128;
}

/** Accept only canonical, correctly typed raster image data within the 650 KiB decoded limit. */
export function isValidAvatarDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^data:image\\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;

  const [, format, encoded] = match;
  if (encoded.length % 4 !== 0) return false;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > 650 * 1024 || bytes.toString('base64') !== encoded) return false;

  if (format === 'png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (format === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
}
