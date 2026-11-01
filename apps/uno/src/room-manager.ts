import { randomBytes } from 'node:crypto';
import { applyUnoAction, privateHand, publicGameState, startUnoGame } from './engine.js';
import { UnoError, type GameAction, type UnoRoom } from './model.js';

export interface AuthenticatedPlayer { id: string; username: string; }
export interface UnoRoomSnapshot { rooms: UnoRoom[]; }
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
      chatEnabled: true, voiceEnabled: true, createdAt: Date.now(), lastActivityAt: Date.now(),
      matchToWin: 1, roundsWon: { [host.id]: 0 }, roundsPlayed: 0, matchWinnerId: null, totalPoints: { [host.id]: 0 }, game: null,
    };
    this.rooms.set(code, room);
    this.userRooms.set(host.id, code);
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  joinRoom(codeInput: string, player: AuthenticatedPlayer): UnoRoom {
    const code = codeInput.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new UnoError('ROOM_NOT_FOUND', 'This UNO table does not exist or has expired.');
    if (room.status === 'playing' || room.status === 'finished') throw new UnoError('GAME_ALREADY_STARTED', 'You cannot join after the game starts.');
    if (this.userRooms.has(player.id)) throw new UnoError('ALREADY_IN_ROOM', 'Leave your current UNO table first.');
    if (room.roundsPlayed > 0 && !room.players.some(p => p.id === player.id)) {
      throw new UnoError('MATCH_IN_PROGRESS', 'New players cannot join after the first round has started.');
    }
    if (room.players.some(p => p.id === player.id)) {
      const existing = room.players.find(p => p.id === player.id)!;
      existing.connected = true;
      existing.ready = false;
    } else {
      if (room.players.length >= 6) throw new UnoError('ROOM_FULL', 'UNO tables support at most 6 players.');
      room.players.push({ ...player, ready: false, connected: true, muted: true, selfMuted: true, hostMuted: false });
      room.roundsWon[player.id] = 0;
      room.totalPoints[player.id] = 0;
      this.userRooms.set(player.id, code);
      // A changed lobby invalidates every previous ready vote.
      for (const seat of room.players) seat.ready = false;
    }
    room.status = 'waiting';
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  reconnect(codeInput: string, player: AuthenticatedPlayer): UnoRoom {
    const room = this.rooms.get(codeInput.trim().toUpperCase());
    if (!room || !room.players.some(p => p.id === player.id)) throw new UnoError('ROOM_NOT_FOUND', 'Your seat could not be restored.');
    const seat = room.players.find(p => p.id === player.id)!;
    seat.connected = true;
    seat.ready = false;
    seat.username = player.username;
    // If the previous host was the last connected player to disappear,
    // the first authenticated player to return inherits table control.
    if (!room.players.some(p => p.id === room.hostId && p.connected)) {
      room.hostId = player.id;
    }
    if (room.status !== 'playing' && room.status !== 'finished') {
      room.status = room.players.length >= 2 && room.players.every(p => p.ready && p.connected) ? 'ready' : 'waiting';
    }
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  setReady(code: string, playerId: string, ready: boolean): UnoRoom {
    const room = this.requireRoom(code);
    if (room.status === 'playing' || room.status === 'finished') throw new UnoError('GAME_ALREADY_STARTED', 'Readiness is locked after the game starts.');
    const player = this.requirePlayer(room, playerId);
    if (!player.connected) throw new UnoError('PLAYER_DISCONNECTED', 'Reconnect before changing your ready state.');
    player.ready = ready;
    room.status = room.players.length >= 2 && room.players.every(p => p.ready) ? 'ready' : 'waiting';
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  setMatchToWin(code: string, playerId: string, rounds: number): UnoRoom {
    const room = this.requireRoom(code);
    if (room.hostId !== playerId) throw new UnoError('HOST_ONLY', 'Only the host can change match settings.');
    if (room.roundsPlayed > 0 || room.status === 'playing' || room.status === 'finished') {
      throw new UnoError('MATCH_ALREADY_STARTED', 'The match length is locked after the first round starts.');
    }
    if (![1, 3, 5].includes(rounds)) {
      throw new UnoError('INVALID_MATCH_LENGTH', 'Choose 1, 3 or 5 wins to take the match.');
    }
    room.matchToWin = rounds as 1 | 3 | 5;
    room.lastActivityAt = Date.now();
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
    room.lastActivityAt = Date.now();
    return { room: structuredClone(room), game: publicGameState(room.game) };
  }
  act(code: string, playerId: string, action: GameAction) {
    const room = this.requireRoom(code);
    if (room.status !== 'playing' || !room.game) throw new UnoError('GAME_NOT_STARTED', 'The game has not started.');
    room.game = applyUnoAction(room.game, playerId, action);
    if (room.game.winnerId) {
      const winnerId = room.game.winnerId;
      room.roundsPlayed += 1;
      room.roundsWon[winnerId] = (room.roundsWon[winnerId] ?? 0) + 1;
      room.totalPoints[winnerId] = (room.totalPoints[winnerId] ?? 0) + room.game.winnerScore;
      if (room.roundsWon[winnerId] >= room.matchToWin) {
        room.status = 'finished';
        room.matchWinnerId = winnerId;
        for (const participant of room.players) this.userRooms.delete(participant.id);
      } else {
        room.status = 'waiting';
        for (const participant of room.players) participant.ready = false;
      }
    }
    room.lastActivityAt = Date.now();
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
    room.lastActivityAt = Date.now();
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
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  disconnect(code: string, playerId: string): UnoRoom | null {
    const room = this.requireRoom(code);
    if (room.status === 'finished' || (room.roundsPlayed === 0 && room.status !== 'playing')) {
      return this.leave(code, playerId);
    }
    const player = this.requirePlayer(room, playerId);
    player.connected = false;
    player.ready = false;
    if (room.hostId === playerId) {
      const hostIndex = room.players.findIndex(seat => seat.id === playerId);
      for (let offset = 1; offset < room.players.length; offset++) {
        const successor = room.players[(hostIndex + offset) % room.players.length]!;
        if (successor.connected) {
          room.hostId = successor.id;
          break;
        }
      }
    }
    player.selfMuted = true;
    player.muted = true;
    if (room.status !== 'playing') room.status = 'waiting';
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  leave(code: string, playerId: string): UnoRoom | null {
    const room = this.requireRoom(code);
    const index = room.players.findIndex(p => p.id === playerId);
    if (index < 0) throw new UnoError('NOT_A_PLAYER', 'You are not seated at this table.');
    if (room.status === 'playing') {
      const departing = room.players[index]!;
      departing.connected = false;
      departing.ready = false;
      departing.selfMuted = true;
      departing.muted = true;
      if (room.hostId === playerId) {
        for (let offset = 1; offset < room.players.length; offset++) {
          const successor = room.players[(index + offset) % room.players.length]!;
          if (successor.connected) {
            room.hostId = successor.id;
            break;
          }
        }
      }
      room.lastActivityAt = Date.now();
      return structuredClone(room);
    }
    room.players.splice(index, 1);
    delete room.roundsWon[playerId];
    delete room.totalPoints[playerId];
    this.userRooms.delete(playerId);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return null;
    }
    if (room.hostId === playerId) {
      const nextSeatIndex = index % room.players.length;
      let successor = room.players[nextSeatIndex]!;
      for (let offset = 0; offset < room.players.length; offset++) {
        const candidate = room.players[(nextSeatIndex + offset) % room.players.length]!;
        if (candidate.connected) {
          successor = candidate;
          break;
        }
      }
      room.hostId = successor.id;
    }
    if (room.status !== 'finished') {
      room.status = room.players.length >= 2 && room.players.every(p => p.ready) ? 'ready' : 'waiting';
    }
    room.lastActivityAt = Date.now();
    return structuredClone(room);
  }
  markAllPlayersDisconnected(): void {
    for (const room of this.rooms.values()) {
      for (const player of room.players) {
        player.connected = false;
        player.ready = false;
        player.selfMuted = true;
        player.muted = true;
      }
      if (room.status !== 'playing' && room.status !== 'finished') room.status = 'waiting';
    }
  }
  getRoom(code: string): UnoRoom { return structuredClone(this.requireRoom(code)); }
  exportSnapshot(): UnoRoomSnapshot {
    return { rooms: [...this.rooms.values()].map(room => structuredClone(room)) };
  }
  restoreSnapshot(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray((snapshot as { rooms?: unknown }).rooms)) {
      throw new UnoError('INVALID_SNAPSHOT', 'The saved UNO room state is invalid.');
    }
    const rooms = (snapshot as { rooms: unknown[] }).rooms;
    this.rooms.clear();
    this.userRooms.clear();
    for (const candidate of rooms) {
      if (!candidate || typeof candidate !== 'object') continue;
      const room = candidate as UnoRoom;
      if (typeof room.code !== 'string' || !Array.isArray(room.players) ||
          !['waiting', 'ready', 'playing', 'finished'].includes(room.status)) continue;
      room.matchToWin = [1, 3, 5].includes(room.matchToWin) ? room.matchToWin : 1;
      room.lastActivityAt = Number.isFinite(room.lastActivityAt) ? room.lastActivityAt : room.createdAt;
      room.roundsPlayed = Number.isInteger(room.roundsPlayed) && room.roundsPlayed >= 0 ? room.roundsPlayed : 0;
      room.matchWinnerId = typeof room.matchWinnerId === 'string' ? room.matchWinnerId : null;
      room.roundsWon = room.roundsWon && typeof room.roundsWon === 'object'
        ? room.roundsWon
        : Object.fromEntries(room.players.map(player => [player.id, 0]));
      room.totalPoints = room.totalPoints && typeof room.totalPoints === 'object'
        ? room.totalPoints
        : Object.fromEntries(room.players.map(player => [player.id, 0]));
      for (const player of room.players) {
        room.roundsWon[player.id] ??= 0;
        room.totalPoints[player.id] ??= 0;
        player.selfMuted = typeof player.selfMuted === 'boolean' ? player.selfMuted : player.muted !== false;
        player.hostMuted = typeof player.hostMuted === 'boolean' ? player.hostMuted : false;
        player.muted = player.selfMuted || player.hostMuted;
      }
      this.rooms.set(room.code, structuredClone(room));
      if (room.status !== 'finished') {
        for (const player of room.players) this.userRooms.set(player.id, room.code);
      }
    }
  }

  cleanupExpiredRooms(now = Date.now(), policy: { lobbyTtlMs?: number; finishedTtlMs?: number; abandonedGameTtlMs?: number } = {}): number {
    const lobbyTtl = policy.lobbyTtlMs ?? 2 * 60 * 60 * 1000;
    const finishedTtl = policy.finishedTtlMs ?? 30 * 60 * 1000;
    const abandonedGameTtl = policy.abandonedGameTtlMs ?? 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const idle = Math.max(0, now - (room.lastActivityAt ?? room.createdAt));
      const expiredLobby = (room.status === 'waiting' || room.status === 'ready') && idle >= lobbyTtl;
      const expiredFinished = room.status === 'finished' && idle >= finishedTtl;
      const abandonedGame = room.status === 'playing' && room.players.every(player => !player.connected) && idle >= abandonedGameTtl;
      if (!expiredLobby && !expiredFinished && !abandonedGame) continue;
      this.rooms.delete(code);
      for (const player of room.players) if (this.userRooms.get(player.id) === code) this.userRooms.delete(player.id);
      removed++;
    }
    return removed;
  }
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
