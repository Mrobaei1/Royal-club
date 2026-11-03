import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoyalLoggerOptions,
  normalizeRoyalLogLevel,
  ROYAL_LOG_REDACTION_PATHS,
} from './logging-config.js';

test('API logger redacts request bodies, credentials, API keys, and response cookies', () => {
  const options = createRoyalLoggerOptions();
  assert.equal(options.redact.censor, '[REDACTED]');
  for (const path of [
    'req.body',
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers.x-api-key',
    'req.headers.x-auth-token',
    'req.headers.proxy-authorization',
    'res.headers.set-cookie',
  ]) {
    assert.ok(options.redact.paths.includes(path), `missing redaction path: ${path}`);
  }
  assert.deepEqual(options.redact.paths, [...ROYAL_LOG_REDACTION_PATHS]);
});

test('logger level accepts supported values and safely falls back to info', () => {
  assert.equal(normalizeRoyalLogLevel(' DEBUG '), 'debug');
  assert.equal(normalizeRoyalLogLevel('silent'), 'silent');
  assert.equal(normalizeRoyalLogLevel('verbose'), 'info');
  assert.equal(normalizeRoyalLogLevel(undefined), 'info');
});

test('request serializer omits query strings and client IP addresses', () => {
  const options = createRoyalLoggerOptions();
  const serialized = options.serializers.req({
    id: 'req-1',
    method: 'GET',
    url: '/auth/verify?otp=123456&token=secret',
    hostname: 'api.example.test',
  });
  assert.deepEqual(serialized, {
    id: 'req-1',
    method: 'GET',
    url: '/auth/verify',
    hostname: 'api.example.test',
  });
  assert.equal(JSON.stringify(serialized).includes('123456'), false);
  assert.equal(JSON.stringify(serialized).includes('secret'), false);
  assert.equal('remoteAddress' in serialized, false);
});

test('each request receives a unique server-generated correlation ID', () => {
  const options = createRoyalLoggerOptions();
  const first = options.genReqId();
  const second = options.genReqId();
  assert.notEqual(first, second);
  assert.equal(options.requestIdHeader, false);
});
