import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoyalLoggerOptions, ROYAL_LOG_REDACTION_PATHS } from './logging-config.js';

test('API logger redacts request bodies, authentication headers, API keys, and response cookies', () => {
  const options = createRoyalLoggerOptions();
  assert.equal(options.redact.censor, '[REDACTED]');
  assert.ok(options.redact.paths.includes('req.body'));
  assert.ok(options.redact.paths.includes('req.headers.authorization'));
  assert.ok(options.redact.paths.includes('req.headers.cookie'));
  assert.ok(options.redact.paths.includes('req.headers.x-api-key'));
  assert.ok(options.redact.paths.includes('res.headers.set-cookie'));
  assert.deepEqual(options.redact.paths, [...ROYAL_LOG_REDACTION_PATHS]);
});
