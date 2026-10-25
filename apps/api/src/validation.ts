export function isNumericId(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}
