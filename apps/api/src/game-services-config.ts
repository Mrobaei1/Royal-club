/**
 * Resolve public game-service origins from the central API configuration.
 * Clients receive origins only; credentials and non-origin URL components are rejected.
 */
export function normalizePublicServiceOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || !parsed.hostname ||
        parsed.username || parsed.password || parsed.pathname !== '/' ||
        parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function publicGameServices(env: NodeJS.ProcessEnv = process.env) {
  return Object.freeze({
    uno: normalizePublicServiceOrigin(env.UNO_SERVER_URL),
  });
}
