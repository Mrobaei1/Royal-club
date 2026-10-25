export function isNumericId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}
