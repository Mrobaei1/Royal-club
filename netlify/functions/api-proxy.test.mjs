import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from './api-proxy.mjs';

const originalOrigin = process.env.ROYAL_CLUB_API_ORIGIN;
const originalFetch = globalThis.fetch;

test.after(() => {
  if (originalOrigin === undefined) delete process.env.ROYAL_CLUB_API_ORIGIN;
  else process.env.ROYAL_CLUB_API_ORIGIN = originalOrigin;
  globalThis.fetch = originalFetch;
});

test('proxy fails closed when deployment has no API origin', async () => {
  delete process.env.ROYAL_CLUB_API_ORIGIN;
  const response = await proxy(
    new Request('https://preview.example/.netlify/functions/api-proxy/api/v1/health'),
    { params: {} },
  );
  assert.equal(response.status, 503);
});

test('proxy rejects non-HTTPS and URL paths in configured API origin', async () => {
  for (const origin of ['http://api.example', 'https://user:pass@api.example', 'https://api.example/base']) {
    process.env.ROYAL_CLUB_API_ORIGIN = origin;
    const response = await proxy(
      new Request('https://preview.example/.netlify/functions/api-proxy/api/v1/health'),
      { params: {} },
    );
    assert.equal(response.status, 503, origin);
  }
});

test('proxy forwards only to the explicitly configured HTTPS API origin', async () => {
  process.env.ROYAL_CLUB_API_ORIGIN = 'https://staging-api.example';
  let target;
  let forwardedOrigin;
  globalThis.fetch = async (url, options) => {
    target = String(url);
    forwardedOrigin = new Headers(options.headers).get('origin');
    return Response.json({ status: 'ok' }, { status: 200 });
  };

  const response = await proxy(
    new Request('https://preview.example/.netlify/functions/api-proxy/api/v1/health?probe=1', {
      headers: { origin: 'https://preview.example' },
    }),
    { params: {} },
  );

  assert.equal(response.status, 200);
  assert.equal(target, 'https://staging-api.example/api/v1/health?probe=1');
  assert.equal(forwardedOrigin, 'https://preview.example');
  assert.deepEqual(await response.json(), { status: 'ok' });
});
