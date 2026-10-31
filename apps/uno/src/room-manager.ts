import { randomBytes } from 'node:crypto';
import { applyUnoAction, privateHand, publicGameState, startUnoGame } from './engine.js';
import { UnoError, type GameAction, type UnoRoom } from './model.js';

export interface AuthenticatedPlayer { id: string; username: string; }
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(): string {
  const bytes = randomBytes(6);
  return [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export class UnoRoomManager {
  private readonly rooms = new Map<string, UnoRoom>();
  private readonly userRooms = new Map<string, string>();

  createRoom(host: AuthenticatedPlayer): UnoRoom {
    if (this.userRooms.has(host.id)) throw new UnoError('ALREADY_IN_ROOM', 'Leave your current UNO table first.');
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room: UnoRoom = {
      code, hostId: host.id, status: 'waiting',
      players: [{ ...host, ready: false, connected: true, muted: true, selfMuted: true, hostMuted: false }],
      chatEnabled: true, voiceEnabled: true, createdAt: Date.now(), game: null,
    };
    this.rooms.set(code, room);
    this.userRooms.set(host.id, code);
    return structuredClone(room);
  }
  joinRoom(codeInput: string, player: AuthenticatedPlayer): UnoRoom {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new UnoError('ROOM_NOT_FOUND', 'This UNO table does not exist or has expired.');
    if (room.status === 'playing' || room.status === 'finished') throw new UnoError('GAME_ALREADY_STARTED', 'You cannot join after the game starts.');
    if (this.userRooms.has(player.id)) throw new UnoError('ALREADY_IN_ROOM', 'Leave your current UNO table first.');
    if (room.players.some(p => p.id === player.id)) {
      const existing = room.players.find(p => p.id === player.id)!;
      existing.connected = true;
      existing.ready = false;
    } else {
      if (room.players.length >= 6) throw new UnoError('ROOM_FULL', 'UNO tables support at most 6 players.');
      room.players.push({ ...player, ready: false, connected: true, muted: true, selfMuted: true, hostMuted: false });
      this.userRooms.set(player.id, code);
    }
    room.status = 'waiting';
    return structuredClone(room);
  }
  reconnect(codeInput: string, player: AuthenticatedPlayer): UnoRoom {
    const room = this.rooms.get(codeInput.trim().toUpperCase());
    if (!room || !room.players.some(p => p.id === player.id)) throw new UnoError('ROOM_NOT_FOUND', 'Your seat could not be restored.');
    const seat = room.players.find(p => p.id === player.id)!;
    seat.connected = true;
    seat.username = player.username;
    return structuredClone(room);
  }
  setReady(code: string, playerId: string, ready: boolean): UnoRoom {
    const room = this.requireRoom(code);
    if (room.status === 'playing' || room.status === 'finished') throw new UnoError('GAME_ALREADY_STARTED', 'Readiness is locked after the game starts.');
    const player = this.requirePlayer(room, playerId);
    player.ready = ready;
    room.status = room.players.length >= 2 && room.players.every(p => p.ready) ? 'ready' : 'waiting';
    return structuredClone(room);
  }
  start(code: string, playerId: string) {
    const room = this.requireRoom(code);
    if (room.hostId !== playerId) throw new UnoError('HOST_ONLY', 'Only the host can start this game.');
    if (room.status !== 'ready' || room.players.length < 2 || room.players.length > 6 || !room.players.every(p => p.ready && p.connected)) {
      throw new UnoError('PLAYERS_NOT_READY', 'At least 2 and at most 6 connected players must all be ready.');
    }
    room.game = startUnoGame(room.players.map(p => ({ id: p.id, username: p.username })));
    room.status = 'playing';
    return { room: structuredClone(room), game: publicGameState(room.game) };
  }
  act(code: string, playerId: string, action: GameAction) {
    const room = this.requireRoom(code);
    if (room.status !== 'playing' || !room.game) throw new UnoError('GAME_NOT_STARTED', 'The game has not started.');
    room.game = applyUnoAction(room.game, playerId, action);
    if (room.game.winnerId) {
      room.status = 'finished';
      for (const participant of room.players) this.userRooms.delete(participant.id);
    }
    return { game: publicGameState(room.game), hand: privateHand(room.game, playerId), room: structuredClone(room) };
  }
  setMuted(code: string, actorId: string, targetId: string, muted: boolean): UnoRoom {
    const room = this.requireRoom(code);
    this.requirePlayer(room, actorId);
    const target = this.requirePlayer(room, targetId);
    if (actorId !== targetId && room.hostId !== actorId) throw new UnoError('HOST_ONLY', 'Only the player or host can change this microphone state.');
    if (actorId === targetId) {
      if (!muted && target.hostMuted) {
        throw new UnoError('HOST_MUTED', 'The host has muted your microphone.');
      }
      target.selfMuted = muted;
    } else {
      target.hostMuted = muted;
      if (muted) target.selfMuted = true;
    }
    target.muted = target.selfMuted || target.hostMuted;
    return structuredClone(room);
  }
  setCommunication(code: string, actorId: string, setting: 'chatEnabled' | 'voiceEnabled', enabled: boolean): UnoRoom {
    const room = this.requireRoom(code);
    if (room.hostId !== actorId) throw new UnoError('HOST_ONLY', 'Only the host can change table communication settings.');
    room[setting] = enabled;
    if (setting === 'voiceEnabled') {
      for (const player of room.players) {
        player.hostMuted = !enabled;
        if (!enabled) player.selfMuted = true;
        player.muted = player.selfMuted || player.hostMuted;
      }
    }
    return structuredClone(room);
  }
  leave(code: string, playerId: string): UnoRoom | null {
    const room = this.requireRoom(code);
    const index = room.players.findIndex(p => p.id === playerId);
    if (index < 0) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
    if (room.status === 'playing') {
      room.players[index]!.connected = false;
      room.players[index]!.selfMuted = true;
      room.players[index]!.muted = true;
      return structuredClone(room);
    }
    room.players.splice(index, 1);
    this.userRooms.delete(playerId);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return null;
    }
    if (room.hostId === playerId) room.hostId = room.players[0]!.id;
    room.status = room.players.length >= 2 && room.players.every(p => p.ready) ? 'ready' : 'waiting';
    return structuredClone(room);
  }
  getRoom(code: string): UnoRoom { return structuredClone(this.requireRoom(code)); }
  getRoomForUser(userId: string): string | null { return this.userRooms.get(userId) ?? null; }
  private requireRoom(code: string): UnoRoom {
    const room = this.rooms.get(code.trim().toUpperCase());
    if (!room) throw new UnoError('ROOM_NOT_FOUND', 'This UNO table does not exist.');
    return room;
  }
  private requirePlayer(room: UnoRoom, id: string) {
    const player = room.players.find(p => p.id === id);
    if (!player) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
    return player;
  }
}
