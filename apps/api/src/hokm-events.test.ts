// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HokmEventHub } from './hokm/events.js';

class FakeListenerClient extends EventEmitter {
  queries = [];
  released = false;
  destroyed = false;
  async query(sql) { this.queries.push(sql); return { rows: [] }; }
  release(destroy = false) { this.released = true; this.destroyed = destroy; }
}

test('Hokm event hub listens once and fans out only room notifications', async () => {
  const client = new FakeListenerClient();
  const pool = { async connect() { return client; } };
  const errors = [];
  const hub = new HokmEventHub(pool, { onError: error => errors.push(error.message) });
  assert.equal(await hub.start(), true);
  assert.equal(await hub.start(), false);
  assert.equal(hub.isRunning, true);
  assert.ok(client.queries.includes('LISTEN hokm_room_updates'));

  const received = [];
  const unsubscribe = hub.subscribe('room-1', payload => received.push(payload));
  client.emit('notification', { channel: 'other_channel', payload: 'room-1' });
  client.emit('notification', { channel: 'hokm_room_updates', payload: 'room-2' });
  client.emit('notification', { channel: 'hokm_room_updates', payload: 'room-1' });
  assert.deepEqual(received, ['room-1']);
  unsubscribe();
  client.emit('notification', { channel: 'hokm_room_updates', payload: 'room-1' });
  assert.deepEqual(received, ['room-1']);

  client.emit('error', new Error('listener disconnected'));
  assert.equal(hub.isRunning, false, 'A broken LISTEN connection must be visible to SSE clients.');
  assert.equal(await hub.close(), true);
  assert.equal(await hub.close(), false);
  assert.equal(hub.isRunning, false);
  assert.equal(client.released, true);
  assert.equal(client.destroyed, true,
    'The dedicated LISTEN connection must be destroyed rather than returned to the pool on shutdown.');
  assert.equal(client.queries.includes('UNLISTEN hokm_room_updates'), false,
    'Shutdown must not wait for an extra database round trip.');
  assert.deepEqual(errors, ['listener disconnected']);
});

test('Hokm event hub rejects invalid subscriptions and use before startup', async () => {
  const client = new FakeListenerClient();
  const hub = new HokmEventHub({ async connect() { return client; } });
  assert.throws(() => hub.subscribe('room-1', () => {}), /not running/);
  await hub.start();
  assert.throws(() => hub.subscribe('', () => {}), /valid room ID/);
  assert.throws(() => hub.subscribe('room-1', null), /listener is required/);
  await hub.close();
});
