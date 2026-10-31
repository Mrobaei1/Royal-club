import assert from 'node:assert/strict';
import test from 'node:test';
import { compareTableNames, extractDeclaredTableNames } from './schema-parity.js';

test('extractDeclaredTableNames reads idempotent and plain CREATE TABLE declarations once', () => {
  const source = `
    CREATE TABLE IF NOT EXISTS users (id BIGINT);
    create table public_messages (id BIGINT);
    CREATE TABLE IF NOT EXISTS users (id BIGINT);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
  `;
  assert.deepEqual(extractDeclaredTableNames(source), ['public_messages', 'users']);
});

test('compareTableNames is case-insensitive and reports missing and extra tables', () => {
  assert.deepEqual(compareTableNames(['users', 'leagues'], ['USERS', 'notifications']), {
    missingFromDatabase: ['leagues'],
    extraInDatabase: ['notifications'],
  });
});

test('compareTableNames returns no differences for matching table names', () => {
  assert.deepEqual(compareTableNames(['users', 'leagues'], ['LEAGUES', 'users']), {
    missingFromDatabase: [],
    extraInDatabase: [],
  });
});
