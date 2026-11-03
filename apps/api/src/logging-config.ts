import { randomUUID } from 'node:crypto';

export const ROYAL_LOG_REDACTION_PATHS = Object.freeze([
  'req.body',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
  'req.headers.x-api-key',
  'req.headers.x-auth-token',
  'req.headers.proxy-authorization',
  'res.headers.set-cookie',
]);

const ALLOWED_LOG_LEVELS = new Set([
  'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent',
]);

export function normalizeRoyalLogLevel(value: string | undefined): string {
  const candidate = value?.trim().toLowerCase() ?? '';
  return ALLOWED_LOG_LEVELS.has(candidate) ? candidate : 'info';
}

export function createRoyalLoggerOptions() {
  return {
    level: normalizeRoyalLogLevel(process.env.LOG_LEVEL),
    // Never trust a caller-supplied request ID: it could forge or collide with another trace.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    redact: {
      paths: [...ROYAL_LOG_REDACTION_PATHS],
      censor: '[REDACTED]',
    },
    serializers: {
      // Query strings can contain OTPs, reset tokens, and other secrets.
      // Log the route template where available, not the raw URL or client IP.
      req(req: {
        id?: string;
        method?: string;
        url?: string;
        hostname?: string;
        routeOptions?: { url?: string };
      }) {
        const rawPath = req.url?.split('?')[0] ?? '';
        return {
          id: req.id,
          method: req.method,
          url: req.routeOptions?.url ?? rawPath,
          hostname: req.hostname,
        };
      },
      res(res: { statusCode?: number }) {
        return { statusCode: res.statusCode };
      },
    },
  };
}
