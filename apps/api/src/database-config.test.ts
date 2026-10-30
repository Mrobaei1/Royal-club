import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDatabaseConnectionString } from './database-config.js';

test('normalizes legacy TLS aliases to verify-full', () => {
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const normalized = normalizeDatabaseConnectionString(
      `postgresql://user:pass@example.test/app?sslmode=${mode}`,
    );
    assert.equal(new URL(normalized!).searchParams.get('sslmode'), 'verify-full');
  }
});

test('preserves explicit verify-full and non-legacy modes', () => {
  for (const mode of ['verify-full', 'disable', 'allow']) {
    const normalized = normalizeDatabaseConnectionString(
      `postgresql://user:pass@example.test/app?sslmode=${mode}`,
    );
    assert.equal(new URL(normalized!).searchParams.get('sslmode'), mode);
  }
});

test('preserves URLs without sslmode and undefined configuration', () => {
  const value = 'postgresql://user:pass@example.test/app?application_name=royal-club';
  assert.equal(normalizeDatabaseConnectionString(value), value);
  assert.equal(normalizeDatabaseConnectionString(undefined), undefined);
});

test('returns malformed input unchanged for the driver to diagnose', () => {
  const value = 'not-a-database-url';
  assert.equal(normalizeDatabaseConnectionString(value), value);
});
