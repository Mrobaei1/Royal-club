import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { normalizeDatabaseConnectionString } from './database-config.js';

export type SchemaDiff = {
  missingFromDatabase: string[];
  extraInDatabase: string[];
};

type CreateTableBlock = { table: string; body: string };

function splitTopLevelSqlList(input: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];
    if (quote) {
      if (c === quote) {
        if (next === quote) i++;
        else quote = null;
      } else if (c === '\\') i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = input.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function extractCreateTableBlocks(source: string): CreateTableBlock[] {
  const blocks: CreateTableBlock[] = [];
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_$]*)"?)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const bodyStart = pattern.lastIndex;
    let depth = 1;
    let quote: "'" | '"' | null = null;
    let end = bodyStart;
    for (; end < source.length && depth > 0; end++) {
      const c = source[end];
      const next = source[end + 1];
      if (quote) {
        if (c === quote) {
          if (next === quote) end++;
          else quote = null;
        } else if (c === '\\') end++;
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    if (depth !== 0) continue;
    blocks.push({ table: match[1].toLowerCase(), body: source.slice(bodyStart, end - 1) });
    pattern.lastIndex = end;
  }
  return blocks;
}

export function extractDeclaredTableNames(source: string): string[] {
  return [...new Set(extractCreateTableBlocks(source).map((block) => block.table))].sort();
}

export function extractDeclaredColumnNames(source: string): string[] {
  const columns = new Set<string>();
  for (const block of extractCreateTableBlocks(source)) {
    for (const part of splitTopLevelSqlList(block.body)) {
      const declaration = part.match(/^"?([a-z_][a-z0-9_$]*)"?\s+([a-z][a-z0-9_]*)/i);
      if (!declaration) continue;
      const first = declaration[1].toLowerCase();
      if (['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude'].includes(first)) continue;
      columns.add(`${block.table}.${first}`);
    }
  }

  const alterColumn = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_$]*)"?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_$]*)"?)/gi;
  for (const match of source.matchAll(alterColumn)) {
    columns.add(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`);
  }
  return [...columns].sort();
}

export function extractDeclaredIndexNames(source: string): string[] {
  const names = new Set<string>();
  const pattern = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_$]*)"?)/gi;
  for (const match of source.matchAll(pattern)) names.add(match[1].toLowerCase());
  return [...names].sort();
}

export function compareNames(expected: string[], actual: string[]): SchemaDiff {
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
  const expectedTables = extractDeclaredTableNames(source);
  const expectedColumns = extractDeclaredColumnNames(source);
  const expectedIndexes = extractDeclaredIndexNames(source);
  if (!expectedTables.length || !expectedColumns.length) {
    console.error('No usable CREATE TABLE/column declarations found in src/server.ts; refusing to report parity.');
    process.exitCode = 2;
    return;
  }

  const client = new Client({ connectionString, application_name: 'royal-club-schema-parity-readonly' });
  try {
    await client.connect();
    const [tableResult, columnResult, indexResult] = await Promise.all([
      client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name`,
      ),
      client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
      ),
      client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
      ),
    ]);

    const actualTables = tableResult.rows.map((row) => row.table_name);
    const actualColumns = columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`);
    const actualIndexes = indexResult.rows.map((row) => row.indexname);
    const diffs = {
      tables: compareNames(expectedTables, actualTables),
      columns: compareNames(expectedColumns, actualColumns),
      explicitIndexes: compareNames(expectedIndexes, actualIndexes),
    };

    console.log(
      `Schema catalog audit: tables source/db=${expectedTables.length}/${actualTables.length}; ` +
      `columns source/db=${expectedColumns.length}/${actualColumns.length}; ` +
      `explicit indexes source/db=${expectedIndexes.length}/${actualIndexes.length} total DB indexes.`,
    );

    let failed = false;
    for (const [category, diff] of Object.entries(diffs)) {
      if (!diff.missingFromDatabase.length && !diff.extraInDatabase.length) {
        console.log(`PASS: ${category} names match.`);
        continue;
      }
      failed = true;
      if (diff.missingFromDatabase.length) console.error(`${category} missing in database: ${diff.missingFromDatabase.join(', ')}`);
      if (diff.extraInDatabase.length) console.error(`${category} extra in database: ${diff.extraInDatabase.join(', ')}`);
    }
    if (failed) {
      console.error('Schema parity failed. This read-only check does not prove data-type/default/constraint-definition parity or migration order.');
      process.exitCode = 1;
      return;
    }
    console.log('PASS: declared table, column, and explicit index names match the public database catalog.');
    console.log('Scope limit: data types, nullability/defaults, constraint definitions, and migration order require separate semantic review.');
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('Schema catalog audit failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  });
}
