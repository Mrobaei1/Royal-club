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

  if (origins.some((origin) => origin === '*' || !/^https:\/\//i.test(origin))) {
    throw new Error('CORS_ORIGINS must contain only explicit HTTPS origins.');
  }
  return [...new Set(origins)];
}
