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

test('authenticated sockets enforce host start, private hands and text-chat membership', { timeout: 15_000 }, async () => {
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
    const publicState = publicGame as Record<string, unknown>;
    const openingTop = publicState.discardTop as Record<string, unknown>;
    assert.equal((guestHand as unknown[]).length, openingTop.face === 'draw2' ? 9 : 7);
    const currentPlayerId = publicState.currentPlayerId;
    const activeSocket = currentPlayerId === 'host-id' ? host : guest;
    const activeHandLength = currentPlayerId === 'host-id' ? (hostHand as unknown[]).length : (guestHand as unknown[]).length;
    assert.equal('drawnCardId' in publicState, false);
    assert.equal('hand' in (publicState.players as Array<Record<string, unknown>>)[0]!, false);
    const passiveSocket = currentPlayerId === 'host-id' ? guest : host;
    const actionRoomEvent = nextEvent(passiveSocket, 'uno:room:state');
    const updatedActiveHandEvent = nextEvent(activeSocket, 'uno:game:hand');
    const drawAck = await emitAck(activeSocket, 'uno:game:action', { code, action: { type: 'draw' } });
    assert.equal(drawAck.ok, true);
    const actionRoom = await actionRoomEvent as Record<string, unknown>;
    const updatedActiveHand = await updatedActiveHandEvent as unknown[];
    assert.equal(updatedActiveHand.length, activeHandLength + 1);
    assert.equal(actionRoom.status, 'playing');
    assert.equal(actionRoom.matchToWin, 3);

    const outsiderChat = await emitAck(clients[2]!, 'uno:chat:send', { code, text: 'I am not seated' });
    assert.equal(outsiderChat.ok, false);
    assert.equal(outsiderChat.error?.code, 'NOT_A_PLAYER');
    assert.equal((await emitAck(host, 'uno:chat:send', { code, text: '   ' })).ok, false);
    assert.equal((await emitAck(host, 'uno:room:communication', { code, setting: 'chatEnabled', enabled: false })).ok, true);
    const disabledChat = await emitAck(host, 'uno:chat:send', { code, text: 'Chat should be disabled' });
    assert.equal(disabledChat.ok, false);
    assert.equal(disabledChat.error?.code, 'CHAT_DISABLED');
    assert.equal((await emitAck(host, 'uno:room:communication', { code, setting: 'chatEnabled', enabled: true })).ok, true);

    const chatEvent = nextEvent(guest, 'uno:chat:message');
    assert.equal((await emitAck(host, 'uno:chat:send', { code, text: 'Hello from the table' })).ok, true);
    const chat = await chatEvent as Record<string, unknown>;
    assert.equal(chat.username, 'host_handle');
    assert.equal('fullName' in chat, false);

    const hostServerSocket = [...io.sockets.sockets.values()].find(serverSocket =>
      (serverSocket.data as { player?: { id?: string } }).player?.id === 'host-id');
    assert.ok(hostServerSocket);
    assert.equal(hostServerSocket.listeners('uno:voice:signal').length, 0);
    assert.equal(hostServerSocket.listeners('uno:voice:mute').length, 0);

    const secondHostDevice = await connectClient(url, 'host-token');
    clients.push(secondHostDevice);
    const restoredHost = await emitAck(secondHostDevice, 'uno:room:reconnect', { code });
    assert.equal(restoredHost.ok, true);
    const restoredData = restoredHost.data as Record<string, unknown>;
    assert.equal((restoredData.hand as unknown[]).length, (hostHand as unknown[]).length + (currentPlayerId === 'host-id' ? 1 : 0));

    const roomAfterLeaveEvent = nextEvent(guest, 'uno:room:state');
    assert.equal((await emitAck(secondHostDevice, 'uno:room:leave', { code })).ok, true);
    const roomAfterLeave = await roomAfterLeaveEvent as Record<string, unknown>;
    const hostSeatAfterLeave = (roomAfterLeave.players as Array<Record<string, unknown>>).find(p => p.id === 'host-id');
    assert.equal(hostSeatAfterLeave?.connected, false);
    host.disconnect();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(roomManager.getRoom(code).players[0]!.connected, false);
    assert.ok(persistenceWrites >= 7);

  } finally {
    for (const client of clients) client.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});


test('six-player tables enforce capacity, all-ready start and private hands', { timeout: 15_000 }, async () => {
  const http = createServer();
  const io = new SocketServer(http, { cors: { origin: '*' } });
  const identities = new Map(
    Array.from({ length: 7 }, (_, index) => [
      `player-token-${index}`,
      { id: `player-${index}`, username: `player_${index}` },
    ]),
  );
  const manager = registerUnoSockets(io, async token => {
    const player = identities.get(token);
    if (!player) throw new Error('bad token');
    return player;
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const clients: Socket[] = [];
  try {
    clients.push(...await Promise.all(
      Array.from({ length: 7 }, (_, index) => connectClient(url, `player-token-${index}`)),
    ));
    const host = clients[0]!;
    const created = await emitAck(host, 'uno:room:create', {});
    assert.equal(created.ok, true);
    const code = String((created.data as Record<string, unknown>).code);

    for (let index = 1; index < 6; index++) {
      const joined = await emitAck(clients[index]!, 'uno:room:join', { code });
      assert.equal(joined.ok, true);
    }
    const fullRoomJoin = await emitAck(clients[6]!, 'uno:room:join', { code });
    assert.equal(fullRoomJoin.ok, false);
    assert.equal(fullRoomJoin.error?.code, 'ROOM_FULL');

    const prematureStart = await emitAck(host, 'uno:room:start', { code });
    assert.equal(prematureStart.ok, false);
    assert.equal(prematureStart.error?.code, 'PLAYERS_NOT_READY');

    for (let index = 0; index < 6; index++) {
      const ready = await emitAck(clients[index]!, 'uno:room:ready', { code, ready: true });
      assert.equal(ready.ok, true);
    }
    const deniedNonHostStart = await emitAck(clients[1]!, 'uno:room:start', { code });
    assert.equal(deniedNonHostStart.ok, false);
    assert.equal(deniedNonHostStart.error?.code, 'HOST_ONLY');

    const privateHands = clients.slice(0, 6).map(client => nextEvent(client, 'uno:game:hand'));
    const publicStateEvent = nextEvent(host, 'uno:game:state');
    const started = await emitAck(host, 'uno:room:start', { code });
    assert.equal(started.ok, true);
    const [hands, publicState] = await Promise.all([
      Promise.all(privateHands),
      publicStateEvent,
    ]);
    assert.equal(hands.length, 6);
    assert.ok(hands.every(hand => (hand as unknown[]).length >= 7));
    const publicGame = publicState as Record<string, unknown>;
    assert.equal((publicGame.players as Array<Record<string, unknown>>).length, 6);
    assert.equal((publicGame.players as Array<Record<string, unknown>>).every(player => typeof player.cardCount === 'number' && !('hand' in player)), true);
    assert.equal('hands' in publicGame, false);

    const lateJoin = await emitAck(clients[6]!, 'uno:room:join', { code });
    assert.equal(lateJoin.ok, false);
    assert.equal(lateJoin.error?.code, 'GAME_ALREADY_STARTED');
    assert.equal(manager.getRoom(code).players.length, 6);
  } finally {
    for (const client of clients) client.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
});
