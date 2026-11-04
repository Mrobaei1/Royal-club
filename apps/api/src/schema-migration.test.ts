import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../migrations/20261104_001_reconcile_production_schema.sql', import.meta.url),
  'utf8',
);

test('production schema reconciliation migration is transaction-scoped and additive', () => {
  assert.match(migration, /^--[\s\S]*?BEGIN;/m);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i);
});

test('schema reconciliation migration contains every audited missing object', () => {
  for (const table of ['account_customization_pricing', 'auth_token_revocations']) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  }

  for (const column of [
    'users.token_version',
    'users.avatar_change_count',
    'backgammon_matches.turn_started_at',
    'account_customization_pricing.avatar_change_price_credits',
    'account_customization_pricing.username_change_price_credits',
    'account_customization_pricing.updated_by',
    'account_customization_pricing.updated_at',
    'auth_token_revocations.jti',
    'auth_token_revocations.user_id',
    'auth_token_revocations.expires_at',
    'auth_token_revocations.created_at',
  ]) {
    const [table, name] = column.split('.');
    assert.match(migration, new RegExp('ALTER TABLE ' + table + '[\\s\\S]{0,180}ADD COLUMN IF NOT EXISTS ' + name + '|CREATE TABLE IF NOT EXISTS ' + table + '[\\s\\S]{0,700}' + name));
  }

  assert.match(migration, /auth_token_revocations_expiry_idx/);
});

test('singleton seed is conflict-safe and legacy avatar counts are preserved', () => {
  assert.match(migration, /INSERT INTO account_customization_pricing \(id\)[\s\S]*?ON CONFLICT \(id\) DO NOTHING/);
  assert.match(migration, /UPDATE users[\s\S]*?avatar_data_url IS NOT NULL[\s\S]*?avatar_change_count = 0/);
  assert.match(migration, /VALIDATE CONSTRAINT users_token_version_nonnegative_check/);
  assert.match(migration, /VALIDATE CONSTRAINT users_avatar_change_count_nonnegative_check/);
});
