export type CorsConfig = {
  nodeEnv?: string;
  corsOrigins?: string;
};

const developmentOrigins = [
  'https://super-duper-palm-tree-4r9v56pv6gcj7rw-8080.app.github.dev',
  'https://mrobaei1.github.io',
];

export function getAllowedCorsOrigins(config: CorsConfig): string[] {
  const configured = config.corsOrigins;
  if (
    config.nodeEnv === 'production' &&
    (!configured?.trim() ||
      configured.split(',').some((origin) => origin.trim() === '*'))
  ) {
    throw new Error(
      'Production requires explicit CORS_ORIGINS; wildcard origins are not allowed.',
    );
  }

  const origins = (configured ?? developmentOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.some((origin) => origin === '*')) {
    throw new Error('CORS_ORIGINS must contain explicit origins; wildcard origins are not allowed.');
  }
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain valid origin-only URLs.');
    }
    // The CORS header is an origin, not a URL path. Reject credentials,
    // path/query/fragment suffixes and unsupported schemes instead of silently
    // normalizing potentially surprising operator configuration.
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.origin !== origin ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      throw new Error('CORS_ORIGINS must contain valid origin-only URLs.');
    }
    if (config.nodeEnv === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Production CORS_ORIGINS must contain only HTTPS origins.');
    }
  }
  return [...new Set(origins)];
}
