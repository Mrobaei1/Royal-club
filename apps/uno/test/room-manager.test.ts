import test from 'node:test';
import assert from 'node:assert/strict';
import { UnoRoomManager } from '../src/room-manager.js';
import { UnoError } from '../src/model.js';

const host = {id:'host',username:'host_name'};
const guest = {id:'guest',username:'guest_name'};
test('room capacity, readiness and host-only manual start are enforced', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  assert.equal(room.players.length, 1);
  assert.throws(() => manager.start(room.code, host.id), (e: unknown) => e instanceof UnoError && e.code === 'PLAYERS_NOT_READY');
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  assert.equal(manager.getRoom(room.code).status, 'waiting');
  manager.setReady(room.code, guest.id, true);
  assert.equal(manager.getRoom(room.code).status, 'ready');
  assert.throws(() => manager.start(room.code, guest.id), (e: unknown) => e instanceof UnoError && e.code === 'HOST_ONLY');
  const started = manager.start(room.code, host.id);
  assert.equal(started.room.status, 'playing');
  assert.equal(started.game.players.length, 2);
});
test('a new player resets readiness and cannot join after start', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.joinRoom(room.code, {id:'third',username:'third'});
  assert.equal(manager.getRoom(room.code).status, 'waiting');
  assert.equal(manager.getRoom(room.code).players[2]!.ready, false);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.setReady(room.code, 'third', true);
  manager.start(room.code, host.id);
  assert.throws(() => manager.joinRoom(room.code, {id:'late',username:'late'}), /after the game starts/);
});
test('room displays usernames only and host can manage communication switches', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  const updated = manager.setCommunication(room.code, host.id, 'voiceEnabled', false);
  assert.equal(updated.voiceEnabled, false);
  assert.equal(updated.players[0]!.username, 'host_name');
  assert.equal('fullName' in (updated.players[0] as object), false);
  assert.throws(() => manager.setCommunication(room.code, guest.id, 'chatEnabled', false), /Only the host/);
});
test('leave promotes a new host and clears membership', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  const after = manager.leave(room.code, host.id)!;
  assert.equal(after.hostId, guest.id);
  assert.equal(manager.getRoomForUser(host.id), null);
});

test('a disconnected player can restore their seat during an active game', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  manager.leave(room.code, guest.id);
  assert.equal(manager.getRoom(room.code).players[1]!.connected, false);
  const restored = manager.reconnect(room.code, guest);
  assert.equal(restored.players[1]!.connected, true);
});
test('host disabling voice forces every seat into muted state', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMuted(room.code, host.id, host.id, false);
  manager.setMuted(room.code, guest.id, guest.id, false);
  const updated = manager.setCommunication(room.code, host.id, 'voiceEnabled', false);
  assert.equal(updated.players.every(p => p.muted), true);
});

test('host mute cannot be overridden by a player and respects self-mute', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMuted(room.code, host.id, guest.id, true);
  assert.throws(
    () => manager.setMuted(room.code, guest.id, guest.id, false),
    (error: unknown) => error instanceof UnoError && error.code === 'HOST_MUTED',
  );
  const hostUnmuted = manager.setMuted(room.code, host.id, guest.id, false);
  assert.equal(hostUnmuted.players[1]!.muted, true);
  manager.setMuted(room.code, guest.id, guest.id, false);
  assert.equal(manager.getRoom(room.code).players[1]!.muted, false);
});

test('re-enabling voice preserves each player self-mute preference', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMuted(room.code, guest.id, guest.id, true);
  manager.setCommunication(room.code, host.id, 'voiceEnabled', false);
  const enabled = manager.setCommunication(room.code, host.id, 'voiceEnabled', true);
  assert.equal(enabled.players[0]!.muted, true);
  assert.equal(enabled.players[1]!.muted, true);
});
