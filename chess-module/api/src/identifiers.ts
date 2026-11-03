/** Validate decimal identifiers before passing them to PostgreSQL BIGINT columns. */
export function isPositivePostgresBigintId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[1-9]\\d{0,18}$/.test(value) &&
    BigInt(value) <= 9_223_372_036_854_775_807n;
}
