import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { normalizeDatabaseConnectionString } from './database-config.js';

export function extractDeclaredTableNames(source: string): string[] {
  const names = new Set<string>();
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_$]*)"?)/gi;
  for (const match of source.matchAll(pattern)) names.add(match[1].toLowerCase());
  return [...names].sort();
}

export function compareTableNames(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected.map((name) => name.toLowerCase()));
  const actualSet = new Set(actual.map((name) => name.toLowerCase()));
  return {
    missingFromDatabase: [...expectedSet].filter((name) => !actualSet.has(name)).sort(),
    extraInDatabase: [...actualSet].filter((name) => !expectedSet.has(name)).sort(),
  };
}

async function main() {
  const connectionString = normalizeDatabaseConnectionString(process.env.DATABASE_URL);
  if (!connectionString) {
    console.error('DATABASE_URL is required. No database changes are performed.');
    process.exitCode = 2;
    return;
  }

  const source = await readFile(new URL('./server.ts', import.meta.url), 'utf8');
  const expected = extractDeclaredTableNames(source);
  if (expected.length === 0) {
    console.error('No CREATE TABLE declarations found in src/server.ts; refusing to report parity.');
    process.exitCode = 2;
    return;
  }

  const client = new Client({ connectionString, application_name: 'royal-club-schema-parity-readonly' });
  try {
    await client.connect();
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );
    const actual = result.rows.map((row) => row.table_name);
    const diff = compareTableNames(expected, actual);
    console.log(`Schema table-name audit: source=${expected.length}, database=${actual.length}.`);
    if (diff.missingFromDatabase.length || diff.extraInDatabase.length) {
      if (diff.missingFromDatabase.length) {
        console.error(`Missing in database: ${diff.missingFromDatabase.join(', ')}`);
      }
      if (diff.extraInDatabase.length) {
        console.error(`Extra in database: ${diff.extraInDatabase.join(', ')}`);
      }
      console.error('Table-name parity failed. This read-only check does not inspect columns, constraints, indexes, or migration order.');
      process.exitCode = 1;
      return;
    }
    console.log('PASS: source and database public table names match.');
    console.log('Note: this check is read-only and does not prove column/index/constraint or migration parity.');
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('Schema table-name audit failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  });
}
