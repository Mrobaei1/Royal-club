import { randomUUID } from 'node:crypto';
import { privateHand, privateTurnState, publicGameState } from './engine.js';
import { Server, type Socket } from 'socket.io';
import { UnoError, type GameAction } from './model.js';
import { UnoRoomManager, type AuthenticatedPlayer } from './room-manager.js';

type Ack = (result: { ok: boolean; data?: unknown; error?: { code: string; message: string } }) => void;
type TokenVerifier = (token: string) => Promise<AuthenticatedPlayer>;
type ClientSocket = Socket & { data: { player: AuthenticatedPlayer } };
const MAX_CHAT_LENGTH = 500;
const MAX_SIGNAL_BYTES = 48_000;
const chatWindows = new Map<string, number[]>();

function fail(error: unknown, ack?: Ack) {
  const e = error instanceof UnoError ? error : new UnoError('INTERNAL_ERROR', 'The request could not be completed.');
  ack?.({ ok: false, error: { code: e.code, message: e.message } });
}
function validText(value: unknown): string {
  if (typeof value !== 'string') throw new UnoError('INVALID_MESSAGE', 'Message must be text.');
  const text = value.trim();
  if (!text || text.length > MAX_CHAT_LENGTH) throw new UnoError('INVALID_MESSAGE', 'Message must contain 1 to 500 characters.');
  return text;
}
function allowChat(userId: string): void {
  const now = Date.now();
  const times = (chatWindows.get(userId) ?? []).filter(t => now - t < 10_000);
  if (times.length >= 8) throw new UnoError('CHAT_RATE_LIMIT', 'Please slow down before sending another message.');
  times.push(now);
  chatWindows.set(userId, times);
}
function payloadSize(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value)); } catch { return Number.MAX_SAFE_INTEGER; }
}
export function registerUnoSockets(io: Server, verifyToken: TokenVerifier, rooms = new UnoRoomManager()) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'));
    void verifyToken(token).then(player => {
      if (!player?.id || !player.username) return next(new Error('UNAUTHORIZED'));
      socket.data.player = player;
      next();
    }).catch(() => next(new Error('UNAUTHORIZED')));
  });
  io.on('connection', raw => {
    const socket = raw as ClientSocket;
    const user = socket.data.player;
    const joinSocketRoom = async (code: string) => socket.join(`uno:${code}`);
    const publicRoom = (room: ReturnType<typeof rooms.getRoom>) => ({
      code: room.code, hostId: room.hostId, status: room.status,
      players: room.players.map(p => ({ id: p.id, username: p.username, ready: p.ready, connected: p.connected, muted: p.muted })),
      chatEnabled: room.chatEnabled, voiceEnabled: room.voiceEnabled,
    });
    const publishRoom = (room: ReturnType<typeof rooms.getRoom>) => io.to(`uno:${room.code}`).emit('uno:room:state', publicRoom(room));
    const publishPrivateHands = async (code: string) => {
      const room = rooms.getRoom(code);
      if (!room.game) return;
      const clients = await io.in(`uno:${code}`).fetchSockets();
      for (const client of clients) {
        const player = (client.data as { player?: AuthenticatedPlayer }).player;
        if (player && room.players.some(p => p.id === player.id)) {
          client.emit('uno:game:hand', privateHand(room.game, player.id));
          client.emit('uno:game:private', privateTurnState(room.game, player.id));
        }
      }
    };
    socket.on('uno:room:create', async (_payload: unknown, ack?: Ack) => {
      try {
        const room = rooms.createRoom(user);
        await joinSocketRoom(room.code);
        publishRoom(room);
        ack?.({ ok: true, data: { code: room.code, room: publicRoom(rooms.getRoom(room.code)) } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:join', async (payload: { code?: unknown }, ack?: Ack) => {
      try {
        if (typeof payload?.code !== 'string') throw new UnoError('INVALID_CODE', 'A table code is required.');
        const room = rooms.joinRoom(payload.code, user);
        await joinSocketRoom(room.code);
        publishRoom(room);
        ack?.({ ok: true, data: { room: publicRoom(room) } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:reconnect', async (payload: { code?: string }, ack?: Ack) => {
      try {
        const room = rooms.reconnect(payload?.code ?? '', user);
        await joinSocketRoom(room.code);
        publishRoom(room);
        if (room.game) {
          socket.emit('uno:game:state', publicGameState(room.game));
          socket.emit('uno:game:hand', privateHand(room.game, user.id));
          socket.emit('uno:game:private', privateTurnState(room.game, user.id));
        }
        ack?.({ ok: true, data: { room: publicRoom(room), game: room.game ? publicGameState(room.game) : null, hand: room.game ? privateHand(room.game, user.id) : [] } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:ready', (payload: { code?: string; ready?: boolean }, ack?: Ack) => {
      try {
        if (typeof payload?.ready !== 'boolean') throw new UnoError('INVALID_READY', 'Ready state must be true or false.');
        const room = rooms.setReady(payload.code ?? '', user.id, payload.ready);
        publishRoom(room);
        ack?.({ ok: true, data: { status: room.status } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:start', async (payload: { code?: string }, ack?: Ack) => {
      try {
        const started = rooms.start(payload.code ?? '', user.id);
        publishRoom(started.room);
        io.to(`uno:${started.room.code}`).emit('uno:game:state', started.game);
        await publishPrivateHands(started.room.code);
        ack?.({ ok: true, data: { game: started.game } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:game:action', async (payload: { code?: string; action?: GameAction }, ack?: Ack) => {
      try {
        if (!payload?.action || !['play', 'draw', 'pass', 'callUno', 'catchUno'].includes(payload.action.type)) {
          throw new UnoError('INVALID_ACTION', 'This UNO action is not supported.');
        }
        const result = rooms.act(payload.code ?? '', user.id, payload.action);
        io.to(`uno:${payload.code}`).emit('uno:game:state', result.game);
        await publishPrivateHands(payload.code ?? '');
        ack?.({ ok: true, data: { game: result.game } });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:chat:send', (payload: { code?: string; text?: unknown }, ack?: Ack) => {
      try {
        const room = rooms.getRoom(payload?.code ?? '');
        if (!room.chatEnabled) throw new UnoError('CHAT_DISABLED', 'Chat is disabled by the host.');
        if (!room.players.some(p => p.id === user.id)) throw new UnoError('NOT_A_PLAYER', 'Only seated players can use this chat.');
        allowChat(user.id);
        const text = validText(payload.text);
        io.to(`uno:${room.code}`).emit('uno:chat:message', {
          id: randomUUID(), userId: user.id, username: user.username, text, sentAt: new Date().toISOString(),
        });
        ack?.({ ok: true });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:voice:mute', (payload: { code?: string; targetId?: string; muted?: boolean }, ack?: Ack) => {
      try {
        if (typeof payload?.targetId !== 'string' || typeof payload.muted !== 'boolean') throw new UnoError('INVALID_MUTE', 'A target and mute state are required.');
        const room = rooms.setMuted(payload.code ?? '', user.id, payload.targetId, payload.muted);
        publishRoom(room);
        ack?.({ ok: true });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:communication', (payload: { code?: string; setting?: 'chatEnabled' | 'voiceEnabled'; enabled?: boolean }, ack?: Ack) => {
      try {
        if (!['chatEnabled', 'voiceEnabled'].includes(payload?.setting ?? '') || typeof payload.enabled !== 'boolean') {
          throw new UnoError('INVALID_SETTING', 'A supported communication setting is required.');
        }
        const room = rooms.setCommunication(payload.code ?? '', user.id, payload.setting!, payload.enabled);
        publishRoom(room);
        ack?.({ ok: true });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:voice:signal', async (payload: { code?: string; targetId?: string; kind?: string; data?: unknown }, ack?: Ack) => {
      try {
        const room = rooms.getRoom(payload?.code ?? '');
        if (!room.voiceEnabled) throw new UnoError('VOICE_DISABLED', 'Voice chat is disabled by the host.');
        if (!room.players.some(p => p.id === user.id) || !room.players.some(p => p.id === payload?.targetId)) throw new UnoError('NOT_A_PLAYER', 'Voice signalling is only available to seated players.');
        if (payloadSize(payload.data) > MAX_SIGNAL_BYTES) throw new UnoError('SIGNAL_TOO_LARGE', 'Voice signalling payload is too large.');
        if (!['offer', 'answer', 'ice'].includes(payload?.kind ?? '')) throw new UnoError('INVALID_SIGNAL', 'Unsupported voice signalling message.');
        const targets = await io.in(`uno:${room.code}`).fetchSockets();
        for (const target of targets) {
          const targetPlayer = (target.data as { player?: AuthenticatedPlayer }).player;
          if (targetPlayer?.id === payload.targetId) target.emit('uno:voice:signal', {
            fromId: user.id, targetId: payload.targetId, kind: payload.kind, data: payload.data,
          });
        }
        ack?.({ ok: true });
      } catch (e) { fail(e, ack); }
    });
    socket.on('uno:room:leave', (payload: { code?: string }, ack?: Ack) => {
      try {
        const room = rooms.leave(payload?.code ?? '', user.id);
        if (room) publishRoom(room);
        socket.leave(`uno:${payload?.code}`);
        ack?.({ ok: true });
      } catch (e) { fail(e, ack); }
    });
    socket.on('disconnect', () => {
      const code = rooms.getRoomForUser(user.id);
      if (!code) return;
      try {
        const room = rooms.leave(code, user.id);
        if (room) publishRoom(room);
      } catch { /* A room may have expired between disconnect and cleanup. */ }
    });
  });
  return rooms;
}
