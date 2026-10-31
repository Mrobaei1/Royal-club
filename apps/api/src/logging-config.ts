export const ROYAL_LOG_REDACTION_PATHS = Object.freeze([
  'req.body',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-api-key',
  'res.headers.set-cookie',
]);

export function createRoyalLoggerOptions() {
  return {
    level: process.env.LOG_LEVEL?.trim() || 'info',
    redact: {
      paths: [...ROYAL_LOG_REDACTION_PATHS],
      censor: '[REDACTED]',
    },
  };
}
