import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketServer } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { registerUnoSockets } from '../src/socket.js';
import { UnoRoomManager } from '../src/room-manager.js';

type AckResult = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
function emitAck(socket: Socket, event: string, payload: unknown): Promise<AckResult> {
  return new Promise(resolve => socket.emit(event, payload, (result: AckResult) => resolve(result)));
}
function nextEvent(socket: Socket, event: string): Promise<unknown> {
  return new Promise(resolve => socket.once(event, resolve));
}
function connectClient(url: string, token: string): Promise<Socket> {
  const socket = connect(url, { transports: ['websocket'], auth: { token }, forceNew: true });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

test('authenticated sockets enforce host start and keep hands and voice signals private', { timeout: 15_000 }, async () => {
  const http = createServer();
  const io = new SocketServer(http, { cors: { origin: '*' } });
  const identities = new Map([
    ['host-token', { id: 'host-id', username: 'host_handle' }],
    ['guest-token', { id: 'guest-id', username: 'guest_handle' }],
    ['outsider-token', { id: 'outsider-id', username: 'outside_handle' }],
  ]);
  let persistenceWrites = 0;
  const roomManager = registerUnoSockets(io, async token => {
    const player = identities.get(token);
    if (!player) throw new Error('bad token');
    return player;
  }, new UnoRoomManager(), async () => { persistenceWrites++; });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  let clients: Socket[] = [];
  try {
    clients = await Promise.all([
      connectClient(url, 'host-token'),
      connectClient(url, 'guest-token'),
      connectClient(url, 'outsider-token'),
    ]);
    const host = clients[0]!;
    const guest = clients[1]!;
    const created = await emitAck(host, 'uno:room:create', {});
    assert.equal(created.ok, true);
    const roomData = created.data as { code: string; room: Record<string, unknown> };
    const code = roomData.code;
    assert.equal('game' in roomData.room, false);
    assert.equal((await emitAck(host, 'uno:room:match-to-win', { code, rounds: 3 })).ok, true);

    const joined = await emitAck(guest, 'uno:room:join', { code });
    assert.equal(joined.ok, true);
    const deniedMatchSetting = await emitAck(guest, 'uno:room:match-to-win', { code, rounds: 5 });
    assert.equal(deniedMatchSetting.ok, false);
    assert.equal(deniedMatchSetting.error?.code, 'HOST_ONLY');
    assert.equal((await emitAck(host, 'uno:room:ready', { code, ready: true })).ok, true);
    assert.equal((await emitAck(guest, 'uno:room:ready', { code, ready: true })).ok, true);

    const deniedStart = await emitAck(guest, 'uno:room:start', { code });
    assert.equal(deniedStart.ok, false);
    assert.equal(deniedStart.error?.code, 'HOST_ONLY');

    const hostHandEvent = nextEvent(host, 'uno:game:hand');
    const guestHandEvent = nextEvent(guest, 'uno:game:hand');
    const publicGameEvent = nextEvent(host, 'uno:game:state');
    const started = await emitAck(host, 'uno:room:start', { code });
    assert.equal(started.ok, true);
    const [hostHand, guestHand, publicGame] = await Promise.all([hostHandEvent, guestHandEvent, publicGameEvent]);
    assert.equal((hostHand as unknown[]).length, 7);
    assert.equal((guestHand as unknown[]).length, 7);
    const publicState = publicGame as Record<string, unknown>;
    assert.equal('drawnCardId' in publicState, false);
    assert.equal('hand' in (publicState.players as Array<Record<string, unknown>>)[0]!, false);
    const actionRoomEvent = nextEvent(guest, 'uno:room:state');
    const drawAck = await emitAck(host, 'uno:game:action', { code, action: { type: 'draw' } });
    assert.equal(drawAck.ok, true);
    const actionRoom = await actionRoomEvent as Record<string, unknown>;
    assert.equal(actionRoom.status, 'playing');
    assert.equal(actionRoom.matchToWin, 3);

    const chatEvent = nextEvent(guest, 'uno:chat:message');
    assert.equal((await emitAck(host, 'uno:chat:send', { code, text: 'Hello from the table' })).ok, true);
    const chat = await chatEvent as Record<string, unknown>;
    assert.equal(chat.username, 'host_handle');
    assert.equal('fullName' in chat, false);

    const voiceEvent = nextEvent(guest, 'uno:voice:signal');
    const signalAck = await emitAck(host, 'uno:voice:signal', {
      code, targetId: 'guest-id', kind: 'offer', data: { sdp: 'test-offer' },
    });
    assert.equal(signalAck.ok, true);
    const signal = await voiceEvent as Record<string, unknown>;
    assert.equal(signal.fromId, 'host-id');
    assert.equal(signal.targetId, 'guest-id');

    const roomUpdate = nextEvent(guest, 'uno:room:state');
    assert.equal((await emitAck(host, 'uno:voice:mute', { code, targetId: 'guest-id', muted: true })).ok, true);
    const updated = await roomUpdate as Record<string, unknown>;
    const guestSeat = (updated.players as Array<Record<string, unknown>>).find(p => p.id === 'guest-id');
    assert.equal(guestSeat?.muted, true);

    const secondHostDevice = await connectClient(url, 'host-token');
    clients.push(secondHostDevice);
    const restoredHost = await emitAck(secondHostDevice, 'uno:room:reconnect', { code });
    assert.equal(restoredHost.ok, true);
    host.disconnect();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(roomManager.getRoom(code).players[0]!.connected, true);
    assert.ok(persistenceWrites >= 7);

  } finally {
    for (const client of clients) client.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});
