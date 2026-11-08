import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const renderBlueprint = await readFile(
  new URL('../../../render.yaml', import.meta.url),
  'utf8',
);
const compose = await readFile(
  new URL('../../../infra/docker-compose.yml', import.meta.url),
  'utf8',
);
const server = await readFile(new URL('./server.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
)) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

test('Render blueprint declares a provider-neutral Node API and managed PostgreSQL service', () => {
  assert.match(renderBlueprint, /type:\s*web/);
  assert.match(renderBlueprint, /runtime:\s*node/);
  assert.match(renderBlueprint, /rootDir:\s*apps\/api/);
  assert.match(renderBlueprint, /buildCommand:\s*npm ci && npm run build/);
  assert.match(renderBlueprint, /startCommand:\s*npm start/);
  assert.match(renderBlueprint, /healthCheckPath:\s*\/api\/v1\/health/);
  assert.match(renderBlueprint, /key:\s*DATABASE_URL[\s\S]*?fromDatabase:[\s\S]*?name:\s*royal-club-db/);
  assert.match(renderBlueprint, /key:\s*JWT_SECRET[\s\S]*?generateValue:\s*true/);
  assert.match(renderBlueprint, /key:\s*CORS_ORIGINS/);
  assert.match(renderBlueprint, /databases:[\s\S]*?name:\s*royal-club-db[\s\S]*?databaseName:\s*royalclub/);
  assert.match(renderBlueprint, /region:\s*frankfurt/);
});

test('API package contract supports a standard Node host and PostgreSQL connection string', () => {
  assert.ok(packageJson.scripts?.build, 'API package must define a build script');
  assert.ok(packageJson.scripts?.start, 'API package must define a start script');
  assert.ok(
    packageJson.dependencies?.pg || packageJson.devDependencies?.pg,
    'API package must use the standard PostgreSQL driver',
  );
  assert.match(server, /process\.env\.DATABASE_URL/);
  assert.match(server, /\/api\/v1\/health/);
});

test('local portable database contract uses PostgreSQL with a readiness probe', () => {
  assert.match(compose, /image:\s*postgres:16-alpine/);
  assert.match(compose, /POSTGRES_DB:\s*royalclub/);
  assert.match(compose, /pg_isready\s+-U\s+royalclub\s+-d\s+royalclub/);
});
