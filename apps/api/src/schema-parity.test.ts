import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareNames,
  extractDeclaredColumnNames,
  extractDeclaredIndexNames,
  extractDeclaredTableNames,
} from './schema-parity.js';

const ddl = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT users_username_check CHECK (length(username) > 0)
  );
  CREATE TABLE public_messages (id BIGINT, body TEXT);
  CREATE TABLE IF NOT EXISTS users (id BIGINT);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url TEXT;
  ALTER TABLE users ADD CONSTRAINT users_phone_check CHECK (phone <> '');
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (username);
  CREATE INDEX notifications_inbox_idx ON notifications (user_id, created_at DESC);
`;

test('extractDeclaredTableNames deduplicates plain and idempotent declarations', () => {
  assert.deepEqual(extractDeclaredTableNames(ddl), ['public_messages', 'users']);
});

test('extractDeclaredColumnNames includes CREATE TABLE and ADD COLUMN declarations only', () => {
  assert.deepEqual(extractDeclaredColumnNames(ddl), [
    'public_messages.body',
    'public_messages.id',
    'users.avatar_data_url',
    'users.created_at',
    'users.id',
    'users.metadata',
    'users.username',
  ]);
});

test('extractDeclaredIndexNames reads explicit indexes and ignores unrelated DDL', () => {
  assert.deepEqual(extractDeclaredIndexNames(ddl), [
    'notifications_inbox_idx',
    'users_username_unique_idx',
  ]);
});

test('compareNames is case-insensitive and reports missing and extra catalog objects', () => {
  assert.deepEqual(compareNames(['users', 'leagues'], ['USERS', 'notifications']), {
    missingFromDatabase: ['leagues'],
    extraInDatabase: ['notifications'],
  });
});

test('compareNames returns no differences for matching names', () => {
  assert.deepEqual(compareNames(['users', 'leagues'], ['LEAGUES', 'users']), {
    missingFromDatabase: [],
    extraInDatabase: [],
  });
});
