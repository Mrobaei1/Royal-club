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
  assert.equal(manager.getRoom(room.code).players.every(player => !player.ready), true);
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

test('host mute and voice shutdown require players to opt in again', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMuted(room.code, guest.id, guest.id, false);
  assert.equal(manager.getRoom(room.code).players[1]!.muted, false);
  manager.setMuted(room.code, host.id, guest.id, true);
  manager.setMuted(room.code, host.id, guest.id, false);
  assert.equal(manager.getRoom(room.code).players[1]!.muted, true);
  manager.setMuted(room.code, guest.id, guest.id, false);
  assert.equal(manager.getRoom(room.code).players[1]!.muted, false);
  manager.setCommunication(room.code, host.id, 'voiceEnabled', false);
  manager.setCommunication(room.code, host.id, 'voiceEnabled', true);
  assert.equal(manager.getRoom(room.code).players[1]!.muted, true);
});

test('room snapshots survive manager recreation and restore user membership', () => {
  const first = new UnoRoomManager();
  const room = first.createRoom(host);
  first.joinRoom(room.code, guest);
  first.setReady(room.code, host.id, true);
  const snapshot = first.exportSnapshot();
  const restarted = new UnoRoomManager();
  restarted.restoreSnapshot(snapshot);
  assert.equal(restarted.getRoom(room.code).players.length, 2);
  assert.equal(restarted.getRoom(room.code).status, 'waiting');
  assert.equal(restarted.getRoomForUser(host.id), room.code);
  assert.equal(restarted.getRoomForUser(guest.id), room.code);
  restarted.setReady(room.code, guest.id, true);
  assert.equal(restarted.getRoom(room.code).status, 'ready');
});

test('active match state and private hands survive snapshot restoration', () => {
  const first = new UnoRoomManager();
  const room = first.createRoom(host);
  first.joinRoom(room.code, guest);
  first.setReady(room.code, host.id, true);
  first.setReady(room.code, guest.id, true);
  first.start(room.code, host.id);
  const original = first.getRoom(room.code);
  const restored = new UnoRoomManager();
  restored.restoreSnapshot(first.exportSnapshot());
  const afterRestart = restored.getRoom(room.code);
  assert.equal(afterRestart.status, 'playing');
  assert.equal(afterRestart.game?.players[0]!.hand.length, 7);
  assert.deepEqual(afterRestart.game?.players[0]!.hand, original.game?.players[0]!.hand);
  assert.equal(restored.getRoomForUser(guest.id), room.code);
});

test('snapshot restoration upgrades older microphone state safely', () => {
  const manager = new UnoRoomManager();
  manager.restoreSnapshot({
    rooms: [{
      code: 'OLD123',
      hostId: 'host',
      status: 'waiting',
      players: [{id:'host',username:'host_name',ready:false,connected:true,muted:false}],
      chatEnabled: true,
      voiceEnabled: true,
      createdAt: 1,
      game: null,
    }],
  });
  const player = manager.getRoom('OLD123').players[0]!;
  assert.equal(player.selfMuted, false);
  assert.equal(player.hostMuted, false);
  assert.equal(player.muted, false);
});

test('a room accepts six seats and rejects a seventh player', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  for (let index = 1; index <= 5; index++) {
    manager.joinRoom(room.code, { id: `player-${index}`, username: `player_${index}` });
  }
  assert.equal(manager.getRoom(room.code).players.length, 6);
  assert.throws(
    () => manager.joinRoom(room.code, { id: 'player-7', username: 'player_7' }),
    (error: unknown) => error instanceof UnoError && error.code === 'ROOM_FULL',
  );
});

test('revoking readiness blocks the host from starting the table', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  assert.equal(manager.getRoom(room.code).status, 'ready');
  manager.setReady(room.code, guest.id, false);
  assert.equal(manager.getRoom(room.code).status, 'waiting');
  assert.throws(
    () => manager.start(room.code, host.id),
    (error: unknown) => error instanceof UnoError && error.code === 'PLAYERS_NOT_READY',
  );
});

test('match length is host-controlled and restricted to one, three or five wins', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  assert.throws(() => manager.setMatchToWin(room.code, guest.id, 3), /Only the host/);
  assert.throws(() => manager.setMatchToWin(room.code, host.id, 2), /Choose 1, 3 or 5/);
  assert.equal(manager.setMatchToWin(room.code, host.id, 3).matchToWin, 3);
});

test('a best-of-three UNO match requires three round wins and readiness between rounds', () => {
  let manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMatchToWin(room.code, host.id, 3);

  for (let round = 1; round <= 3; round++) {
    if (round > 1) {
      manager.setReady(room.code, host.id, true);
      manager.setReady(room.code, guest.id, true);
      manager.start(room.code, host.id);
    } else {
      manager.setReady(room.code, host.id, true);
      manager.setReady(room.code, guest.id, true);
      manager.start(room.code, host.id);
    }
    const snapshot = manager.exportSnapshot();
    const savedRoom = snapshot.rooms[0]!;
    savedRoom.game!.players[0]!.hand = [{id:'round-final',color:'red',face:1}];
    savedRoom.game!.discardPile = [{id:'top',color:'red',face:2}];
    savedRoom.game!.activeColor = 'red';
    const restarted = new UnoRoomManager();
    restarted.restoreSnapshot(snapshot);
    const result = restarted.act(room.code, host.id, {type:'play',cardId:'round-final'});
    manager = restarted;
    assert.equal(result.room.roundsPlayed, round);
    assert.equal(result.room.roundsWon[host.id], round);
    if (round < 3) {
      assert.equal(result.room.status, 'waiting');
      assert.equal(result.room.players.every(player => !player.ready), true);
      assert.equal(result.room.matchWinnerId, null);
      assert.throws(() => manager.setMatchToWin(room.code, host.id, 5), /locked/);
      assert.throws(() => manager.joinRoom(room.code, {id:'late',username:'late'}), /after the first round/);
    } else {
      assert.equal(result.room.status, 'finished');
      assert.equal(result.room.matchWinnerId, host.id);
      assert.equal(manager.getRoomForUser(host.id), null);
      assert.equal(manager.getRoomForUser(guest.id), null);
      manager.leave(room.code, guest.id);
      assert.equal(manager.getRoom(room.code).status, 'finished');
    }
  }
});

test('disconnect between rounds preserves the seat for reconnection', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setMatchToWin(room.code, host.id, 3);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.game!.players[0]!.hand = [{id:'last',color:'red',face:1}];
  snapshot.rooms[0]!.game!.discardPile = [{id:'top',color:'red',face:2}];
  snapshot.rooms[0]!.game!.activeColor = 'red';
  manager.restoreSnapshot(snapshot);
  manager.act(room.code, host.id, {type:'play',cardId:'last'});
  assert.equal(manager.getRoom(room.code).status, 'waiting');
  const disconnected = manager.disconnect(room.code, guest.id)!;
  assert.equal(disconnected.players.some(player => player.id === guest.id), true);
  assert.equal(disconnected.players.find(player => player.id === guest.id)!.connected, false);
  assert.equal(manager.getRoomForUser(guest.id), room.code);
  const restored = manager.reconnect(room.code, guest);
  assert.equal(restored.players.find(player => player.id === guest.id)!.connected, true);
  assert.equal(restored.players.find(player => player.id === guest.id)!.ready, false);
  assert.equal(restored.status, 'waiting');
});

test('a connected player inherits host controls when the host disconnects', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  const afterDisconnect = manager.disconnect(room.code, host.id)!;
  assert.equal(afterDisconnect.hostId, guest.id);
  assert.equal(afterDisconnect.players.find(player => player.id === host.id)!.connected, false);
});


test('host disconnect transfers control to the next connected seat in turn order', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, { id: 'player-1', username: 'player_one' });
  manager.joinRoom(room.code, { id: 'player-2', username: 'player_two' });
  manager.joinRoom(room.code, { id: 'player-3', username: 'player_three' });
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.hostId = 'player-2';
  manager.restoreSnapshot(snapshot);
  for (const player of manager.getRoom(room.code).players) {
    manager.setReady(room.code, player.id, true);
  }
  manager.start(room.code, 'player-2');
  const afterDisconnect = manager.disconnect(room.code, 'player-2')!;
  assert.equal(afterDisconnect.hostId, 'player-3');
});

test('host leaving a lobby transfers control to the next connected seat in turn order', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, { id: 'player-1', username: 'player_one' });
  manager.joinRoom(room.code, { id: 'player-2', username: 'player_two' });
  manager.joinRoom(room.code, { id: 'player-3', username: 'player_three' });
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.hostId = 'player-2';
  manager.restoreSnapshot(snapshot);
  const afterLeave = manager.leave(room.code, 'player-2')!;
  assert.equal(afterLeave.hostId, 'player-3');
});

test('cleanup removes expired lobby rooms and releases memberships', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.lastActivityAt = 1000;
  manager.restoreSnapshot(snapshot);
  assert.equal(manager.cleanupExpiredRooms(1000 + 2 * 60 * 60 * 1000), 1);
  assert.equal(manager.getRoomForUser(host.id), null);
  assert.throws(() => manager.getRoom(room.code), /does not exist/);
});

test('cleanup never removes an active game based on age alone', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.lastActivityAt = 1;
  manager.restoreSnapshot(snapshot);
  assert.equal(manager.cleanupExpiredRooms(10_000_000_000), 0);
  assert.equal(manager.getRoom(room.code).status, 'playing');
});

test('cleanup expires a playing room only when all players are disconnected', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  manager.disconnect(room.code, host.id);
  manager.disconnect(room.code, guest.id);
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.lastActivityAt = 1;
  manager.restoreSnapshot(snapshot);
  assert.equal(manager.cleanupExpiredRooms(1 + 24 * 60 * 60 * 1000 - 1), 0);
  assert.equal(manager.cleanupExpiredRooms(1 + 24 * 60 * 60 * 1000), 1);
  assert.equal(manager.getRoomForUser(host.id), null);
  assert.equal(manager.getRoomForUser(guest.id), null);
});


test('host voluntarily leaving during a live round transfers host to next connected seat', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  const afterLeave = manager.leave(room.code, host.id)!;
  assert.equal(afterLeave.hostId, guest.id);
  assert.equal(afterLeave.players[0]!.connected, false);
  assert.equal(afterLeave.players[0]!.muted, true);
  assert.equal(manager.getRoomForUser(host.id), room.code);
});


test('a disconnected seat between rounds cannot change readiness until it reconnects', () => {
  const manager = new UnoRoomManager();
  const room = manager.createRoom(host);
  manager.joinRoom(room.code, guest);
  manager.setReady(room.code, host.id, true);
  manager.setReady(room.code, guest.id, true);
  manager.start(room.code, host.id);
  const snapshot = manager.exportSnapshot();
  snapshot.rooms[0]!.status = 'waiting';
  snapshot.rooms[0]!.roundsPlayed = 1;
  snapshot.rooms[0]!.game = null;
  manager.restoreSnapshot(snapshot);
  manager.disconnect(room.code, guest.id);
  assert.throws(
    () => manager.setReady(room.code, guest.id, true),
    (error: unknown) => error instanceof UnoError && error.code === 'PLAYER_DISCONNECTED',
  );
  manager.reconnect(room.code, guest);
  assert.equal(manager.setReady(room.code, guest.id, true).players[1]!.ready, true);
});
