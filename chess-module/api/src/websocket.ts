import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { isPositivePostgresBigintId } from "./identifiers.js";

type Options = {
  pool: Pool;
  authenticate: preHandlerHookHandler;
  getUserId: (request: FastifyRequest) => string;
};

export function createPingRateLimiter(limit = 30, windowMs = 10_000, now: () => number = Date.now): () => boolean {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError("Ping rate-limit settings must be positive and finite.");
  }
  const timestamps: number[] = [];
  return () => {
    const current = now();
    // A sliding window prevents clients from doubling the allowance at a fixed-window boundary.
    while (timestamps.length > 0) {
      const oldest = timestamps[0];
      if (oldest === undefined || oldest > current - windowMs) break;
      timestamps.shift();
    }
    if (timestamps.length >= limit) return false;
    timestamps.push(current);
    return true;
  };
}

export async function registerChessWebSocket(app: FastifyInstance, options: Options): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  // One dedicated PostgreSQL LISTEN connection is shared by every chess socket
  // on this API instance. Per-socket LISTEN clients would exhaust a small pool
  // long before the intended concurrent-player capacity.
  const listener = await options.pool.connect();
  const subscriptions = new Map<string, Set<(payload: string) => void>>();
  const channelLocks = new Map<string, Promise<void>>();
  listener.on("notification", (notification) => {
    if (!notification.payload || !notification.channel) return;
    for (const handler of subscriptions.get(notification.channel) ?? []) {
      handler(notification.payload);
    }
  });
  listener.on("error", (error) => {
    app.log.error({ err: error }, "chess shared notification listener failed");
  });
  app.addHook("onClose", async () => {
    subscriptions.clear();
    listener.release();
  });

  const withChannelLock = async <T>(channel: string, action: () => Promise<T>): Promise<T> => {
    const previous = channelLocks.get(channel) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    channelLocks.set(channel, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (channelLocks.get(channel) === current) channelLocks.delete(channel);
    }
  };
  const subscribe = async (channel: string, handler: (payload: string) => void): Promise<void> =>
    withChannelLock(channel, async () => {
      let handlers = subscriptions.get(channel);
      if (!handlers) {
        handlers = new Set();
        subscriptions.set(channel, handlers);
      }
      // Register the callback before LISTEN completes so the first notification
      // after PostgreSQL acknowledges the subscription cannot fall into a gap.
      handlers.add(handler);
      if (handlers.size === 1) {
        try {
          await listener.query("LISTEN " + channel);
        } catch (error) {
          handlers.delete(handler);
          if (Array.from(handlers).length === 0) subscriptions.delete(channel);
          throw error;
        }
      }
    });
  const unsubscribe = async (channel: string, handler: (payload: string) => void): Promise<void> =>
    withChannelLock(channel, async () => {
      const handlers = subscriptions.get(channel);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        subscriptions.delete(channel);
        await listener.query("UNLISTEN " + channel);
      }
    });

  app.get<{ Querystring: { gameId: string } }>("/chess/ws", {
    websocket: true,
    preHandler: options.authenticate
  }, (socket: WebSocket, request) => {
    let userId: string;
    try {
      userId = options.getUserId(request);
    } catch {
      socket.close(1008, "invalid_identity");
      return;
    }
    const gameId = request.query.gameId;
    let connectionClosed = false;
    let presenceRegistered = false;
    let sessionId: string | undefined;
    let cleanupConnection: (() => Promise<void>) | undefined;
    let unsubscribeSubscription: (() => Promise<void>) | undefined;
    socket.on("close", () => {
      connectionClosed = true;
      if (cleanupConnection) void cleanupConnection();
    });
    socket.on("error", () => {
      connectionClosed = true;
      if (cleanupConnection) void cleanupConnection();
    });
    if (!isPositivePostgresBigintId(gameId) || !isPositivePostgresBigintId(userId)) {
      socket.close(1008, "invalid_identity");
      return;
    }
    void (async () => {
      const membership = await options.pool.query(
        "SELECT id,room_id,white_user_id,black_user_id FROM chess_games WHERE id=$1 AND (white_user_id=$2 OR black_user_id=$2)",
        [gameId, userId]
      );
      if (!membership.rowCount) {
        socket.close(1008, "not_a_game_participant");
        return;
      }
      if (connectionClosed) return;
      sessionId = randomUUID();
      const channel = "chess_game_" + gameId;
      let closed = false;
      let cleaned = false;
      const send = (value: unknown) => {
        if (!closed && socket.readyState === 1) socket.send(JSON.stringify(value));
      };
      // Bound cheap client-originated commands per connection so authenticated
      // sockets cannot turn ping/pong into an unbounded CPU and bandwidth amplifier.
      const allowPing = createPingRateLimiter();
      socket.on("message", (raw) => {
        let message: {type?:string; clientTime?:number};
        let parsed: unknown;
        try { parsed = JSON.parse(raw.toString()) as unknown; }
        catch { socket.close(1008, "invalid_json"); return; }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          socket.close(1008, "invalid_json");
          return;
        }
        message = parsed as {type?:string;clientTime?:number};
        if (message.type === "ping") {
          if (!allowPing()) {
            socket.close(1008, "rate_limited");
            return;
          }
          send({
            type:"chess:pong",
            serverTime:Date.now(),
            ...(Number.isSafeInteger(message.clientTime) ? {clientTime:message.clientTime} : {})
          });
          return;
        }
        socket.close(1008, "unsupported_command");
      });
      const publish = async (event: object) => {
        await options.pool.query("SELECT pg_notify($1,$2)", [channel, JSON.stringify(event)]);
      };
      const onNotification = (payload: string) => {
        let event: {type?:string; id?:string; connected?:boolean; fromUserId?:string; signalType?:string; payload?:unknown; offerId?:string; offeredBy?:string; status?:string};
        try { event = JSON.parse(payload) as {type?:string;id?:string;connected?:boolean;offerId?:string;offeredBy?:string;status?:string}; }
        catch { return; }
        void (async () => {
          if (event.type === "state") {
            const state = await options.pool.query(
              "SELECT id,current_fen,pgn,status,revision,clock_snapshot,settings_snapshot FROM chess_games WHERE id=$1",
              [gameId]
            );
            if (state.rowCount) {
              const row = state.rows[0];
              send({type:"chess:state",gameId:String(row.id),fen:row.current_fen,pgn:row.pgn,
                status:row.status,revision:Number(row.revision),clock:row.clock_snapshot,settings:row.settings_snapshot});
            }
          } else if (event.type === "chat" && event.id) {
            const message = await options.pool.query(
              "SELECT c.id,c.message,c.created_at,u.username FROM chess_chat_messages c JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND c.game_id=$2",
              [event.id,gameId]
            );
            if (message.rowCount) {
              const row=message.rows[0];
              send({type:"chess:chat:message",id:String(row.id),username:row.username,message:row.message,createdAt:row.created_at});
            }
          } else if (event.type === "draw_offer" && event.offerId && event.offeredBy !== userId) {
            send({type:"chess:draw:offered",offerId:event.offerId});
          } else if (event.type === "draw_response" && event.offerId) {
            send({type:"chess:draw:response",offerId:event.offerId,status:event.status});
          } else if (event.type === "presence" && event.id && typeof event.connected === "boolean") {
            const user = await options.pool.query("SELECT username FROM users WHERE id=$1",[event.id]);
            send({type:"chess:opponent:presence",username:user.rows[0]?.username??"",connected:event.connected});
          }
        })().catch(() => send({type:"chess:error",code:"event_delivery_failed"}));
      };
      await subscribe(channel, onNotification);
      unsubscribeSubscription = () => unsubscribe(channel, onNotification);
      // Serialize presence transitions per game/player across devices and API instances.
      const presenceClient = await options.pool.connect();
      let wasOffline = false;
      try {
        await presenceClient.query("BEGIN");
        await presenceClient.query("SELECT pg_advisory_xact_lock(hashtext('chess_presence'),hashtext($1))",[`${gameId}:${userId}`]);
        const existing = await presenceClient.query(
          "SELECT 1 FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2 LIMIT 1",
          [gameId,userId]
        );
        wasOffline = !existing.rowCount;
        await presenceClient.query(
          "INSERT INTO chess_presence_sessions(session_id,game_id,user_id) VALUES($1,$2,$3)",
          [sessionId,gameId,userId]
        );
        await presenceClient.query("COMMIT");
        presenceRegistered = true;
      } catch (error) {
        try { await presenceClient.query("ROLLBACK"); } catch {}
        throw error;
      } finally { presenceClient.release(); }
      if (wasOffline) await publish({type:"presence",id:userId,connected:true});
      send({type:"chess:connected",gameId});
      // Every fresh connection receives an authoritative snapshot after LISTEN is active.
      // This closes the reconnect gap without relying on transient NOTIFY delivery.
      const initialState = await options.pool.query(
        "SELECT id,current_fen,pgn,status,revision,clock_snapshot,settings_snapshot FROM chess_games WHERE id=$1",
        [gameId]
      );
      if (initialState.rowCount) {
        const row = initialState.rows[0];
        send({type:"chess:state",gameId:String(row.id),fen:row.current_fen,pgn:row.pgn,
          status:row.status,revision:Number(row.revision),clock:row.clock_snapshot,settings:row.settings_snapshot});
      }
      const opponentId = String(membership.rows[0].white_user_id) === userId
        ? String(membership.rows[0].black_user_id)
        : String(membership.rows[0].white_user_id);
      const opponentPresence = await options.pool.query(
        "SELECT u.username,EXISTS(SELECT 1 FROM chess_presence_sessions s WHERE s.game_id=$1 AND s.user_id=$2) AS connected FROM users u WHERE u.id=$2",
        [gameId,opponentId]
      );
      if (opponentPresence.rowCount) {
        send({type:"chess:opponent:presence",username:opponentPresence.rows[0].username,connected:Boolean(opponentPresence.rows[0].connected)});
      }
      const cleanup = async () => {
        if (cleaned) return;
        cleaned = true;
        closed = true;
        let lastConnection = false;
        const presenceClient = await options.pool.connect();
        try {
          await presenceClient.query("BEGIN");
          await presenceClient.query("SELECT pg_advisory_xact_lock(hashtext('chess_presence'),hashtext($1))",[`${gameId}:${userId}`]);
          await presenceClient.query("DELETE FROM chess_presence_sessions WHERE session_id=$1",[sessionId]);
          const remaining = await presenceClient.query(
            "SELECT 1 FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2 LIMIT 1",
            [gameId,userId]
          );
          lastConnection = !remaining.rowCount;
          await presenceClient.query("COMMIT");
        } catch {
          try { await presenceClient.query("ROLLBACK"); } catch {}
        } finally { presenceClient.release(); }
        if (lastConnection) {
          try { await publish({type:"presence",id:userId,connected:false}); } catch {}
        }
        if (unsubscribeSubscription) {
          try { await unsubscribeSubscription(); }
          catch (error) { app.log.warn({ err: error, channel }, "chess notification subscription cleanup failed"); }
          unsubscribeSubscription = undefined;
        }
      };
      cleanupConnection = cleanup;
      if (connectionClosed) {
        await cleanup();
        return;
      }
    })().catch(async () => {
      try {
        if (cleanupConnection) {
          await cleanupConnection();
        } else if (sessionId) {
          // A failure after inserting presence but before installing the normal
          // close handler must not leave a ghost-online session behind.
          const cleanupClient = await options.pool.connect();
          let shouldPublishOffline = false;
          try {
            await cleanupClient.query("BEGIN");
            await cleanupClient.query(
              "SELECT pg_advisory_xact_lock(hashtext('chess_presence'),hashtext($1))",
              [`${gameId}:${userId}`]
            );
            await cleanupClient.query(
              "DELETE FROM chess_presence_sessions WHERE session_id=$1",
              [sessionId]
            );
            const remaining = await cleanupClient.query(
              "SELECT 1 FROM chess_presence_sessions WHERE game_id=$1 AND user_id=$2 LIMIT 1",
              [gameId,userId]
            );
            shouldPublishOffline = !remaining.rowCount;
            await cleanupClient.query("COMMIT");
          } catch (cleanupError) {
            try { await cleanupClient.query("ROLLBACK"); } catch {}
            throw cleanupError;
          } finally {
            cleanupClient.release();
          }
          if (presenceRegistered && shouldPublishOffline) {
            try {
              await options.pool.query("SELECT pg_notify($1,$2)",[
                "chess_game_" + gameId,
                JSON.stringify({type:"presence",id:userId,connected:false})
              ]);
            } catch {}
          }
        }
        if (unsubscribeSubscription) {
          try { await unsubscribeSubscription(); } catch {}
          unsubscribeSubscription = undefined;
        }
      } catch { /* cleanup must not mask subscription failure */ }
      socket.close(1011, "subscription_failed");
    });
  });
}
