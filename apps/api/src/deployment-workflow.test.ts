import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../../.github/workflows/deploy-neon-function.yml', import.meta.url),
  'utf8',
);

test('production deployment requires an explicit numeric owner identity', () => {
  assert.match(workflow, /if \[ -z "\$OWNER_USER_ID" \]/);
  assert.match(workflow, /ROYAL_CLUB_OWNER_USER_ID is required/);
  assert.match(workflow, /!\/\^\[1-9\]\[0-9\]\*\$\//);
  assert.match(workflow, /env\.OWNER_USER_ID=owner/);
});

test('production deployment pins the exact source SHA and gates schema parity before deployment', () => {
  assert.match(workflow, /ROYAL_CLUB_GIT_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /npm run schema:check/);
  assert.match(workflow, /x\.buildSha !== process\.env\.GITHUB_SHA/);
  assert.match(workflow, /refs\/heads\/main/);
});
