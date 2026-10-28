import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedCorsOrigins } from './cors-config.js';

test('uses the known development origins when no override is provided', () => {
  assert.deepEqual(
    getAllowedCorsOrigins({ nodeEnv: 'development' }),
    [
      'https://super-duper-palm-tree-4r9v56pv6gcj7rw-8080.app.github.dev',
      'https://mrobaei1.github.io',
    ],
  );
});

test('trims configured origins and removes duplicates', () => {
  assert.deepEqual(
    getAllowedCorsOrigins({
      nodeEnv: 'production',
      corsOrigins: ' https://royal.example ,https://royal.example, https://admin.example ',
    }),
    ['https://royal.example', 'https://admin.example'],
  );
});

test('rejects production without an explicit allowlist', () => {
  assert.throws(
    () => getAllowedCorsOrigins({ nodeEnv: 'production' }),
    /explicit CORS_ORIGINS/,
  );
  assert.throws(
    () => getAllowedCorsOrigins({ nodeEnv: 'production', corsOrigins: '  ' }),
    /explicit CORS_ORIGINS/,
  );
});

test('rejects wildcard and non-HTTPS origins', () => {
  assert.throws(
    () => getAllowedCorsOrigins({ nodeEnv: 'production', corsOrigins: '*' }),
    /explicit CORS_ORIGINS/,
  );
  assert.throws(
    () => getAllowedCorsOrigins({ nodeEnv: 'development', corsOrigins: '*' }),
    /explicit origins/,
  );
  assert.deepEqual(
    getAllowedCorsOrigins({ nodeEnv: 'development', corsOrigins: 'http://localhost:3000' }),
    ['http://localhost:3000'],
  );
  assert.throws(
    () => getAllowedCorsOrigins({ nodeEnv: 'production', corsOrigins: 'http://royal.example' }),
    /only HTTPS origins/,
  );
});


test('rejects CORS entries containing paths, credentials, queries, fragments, or unsupported schemes', () => {
  for (const corsOrigins of [
    'https://royal.example/path',
    'https://royal.example/?x=1',
    'https://royal.example/#fragment',
    'https://user:pass@royal.example',
    'ftp://royal.example',
    'not a url',
  ]) {
    assert.throws(
      () => getAllowedCorsOrigins({ nodeEnv: 'production', corsOrigins }),
      /valid origin-only URLs|only HTTPS origins/,
      corsOrigins,
    );
  }
});
