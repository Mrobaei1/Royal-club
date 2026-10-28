import test from 'node:test';
import assert from 'node:assert/strict';
import { createKavenegarProvider } from './sms-provider.js';

test('Kavenegar connection check calls account info without exposing provider response', async () => {
  let requestedUrl = '';
  const provider = createKavenegarProvider(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ return: { status: 200 } }), { status: 200 });
  });
  assert.deepEqual(await provider.checkConnection('api-key'), { ok: true });
  assert.match(requestedUrl, /account\/info\.json$/);
});

test('Kavenegar OTP request uses normalized Iranian receptor and template', async () => {
  let requestedUrl = '';
  const provider = createKavenegarProvider(async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ return: { status: 200 } }), { status: 200 });
  });
  assert.deepEqual(await provider.sendOtp({
    apiKey: 'secret',
    phoneE164: '+989123456789',
    code: '123456',
    template: 'royalclub',
  }), { ok: true });
  const parsed = new URL(requestedUrl);
  assert.match(parsed.pathname, /verify\/lookup\.json$/);
  assert.equal(parsed.searchParams.get('receptor'), '09123456789');
  assert.equal(parsed.searchParams.get('token'), '123456');
  assert.equal(parsed.searchParams.get('template'), 'royalclub');
});

test('provider failures and invalid OTP inputs fail closed', async () => {
  const failing = createKavenegarProvider(async () =>
    new Response(JSON.stringify({ return: { status: 401, message: 'secret provider detail' } }), { status: 200 }));
  assert.deepEqual(await failing.checkConnection('secret'), { ok: false });
  assert.deepEqual(await failing.sendOtp({
    apiKey: 'secret', phoneE164: '+12025550123', code: '123456', template: 'template',
  }), { ok: false });
  const httpError = createKavenegarProvider(async () => new Response('provider error', { status: 500 }));
  assert.deepEqual(await httpError.checkConnection('secret'), { ok: false });
});
