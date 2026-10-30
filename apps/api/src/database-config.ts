const legacySslModes = new Set(['prefer', 'require', 'verify-ca']);

/**
 * Keep node-postgres on the TLS verification behavior used by Neon today,
 * while avoiding pg-connection-string's deprecation/security warning for
 * legacy sslmode aliases ahead of its next major release.
 */
export function normalizeDatabaseConnectionString(value: string | undefined): string | undefined {
  if (!value) return value;

  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
    if (sslMode && legacySslModes.has(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    // Preserve the original value so malformed configuration still fails
    // through node-postgres with its normal diagnostic.
    return value;
  }
}
