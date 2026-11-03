import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool, PoolClient } from "pg";
import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";

type Options = {
  pool: Pool;
  authenticate: preHandlerHookHandler;
  getUserId: (request: FastifyRequest) => string;
};

export function createPingRateLimiter(limit = 30, windowMs = 10_000, now: () => number = Date.now): () => boolean {
  let windowStartedAt = now();
  let count = 0;
  return () => {
    const current = now();
    if (current - windowStartedAt >= windowMs) {
      windowStartedAt = current;
      count = 0;
    }
    count += 1;
    return count <= limit;
  };
}

export async function registerChessWebSocket(app: FastifyInstance, options: Options): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
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
    let listenerToRelease: PoolClient | undefined;
    let cleanupConnection: (() => Promise<void>) | undefined;
    socket.on("close", () => {
      connectionClosed = true;
      if (cleanupConnection) void cleanupConnection();
    });
    socket.on("error", () => {
      connectionClosed = true;
      if (cleanupConnection) void cleanupConnection();
    });
    if (!/^\d+$/.test(gameId) || !/^\d+$/.test(userId)) {
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
      const listener = await options.pool.connect();
      listenerToRelease = listener;
      if (connectionClosed) {
        listener.release();
        listenerToRelease = undefined;
        return;
      }
      let closed = false;
      let cleaned = false;
      const send = (value: unknown) => {
        if (!closed && socket.readyState === 1) socket.send(JSON.stringify(value));
      };
      const publish = async (event: object) => {
        await listener.query("SELECT pg_notify($1,$2)", [channel, JSON.stringify(event)]);
      };
      listener.on("notification", (notification) => {
        if (!notification.payload) return;
        let event: {type?:string; id?:string; connected?:boolean; fromUserId?:string; signalType?:string; payload?:unknown; offerId?:string; offeredBy?:string; status?:string};
        try { event = JSON.parse(notification.payload) as {type?:string;id?:string;connected?:boolean;offerId?:string;offeredBy?:string;status?:string}; }
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
      });
      await listener.query("LISTEN " + channel);
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
      // Bound cheap client-originated commands per connection so authenticated
      // sockets cannot turn ping/pong into an unbounded CPU and bandwidth amplifier.
      const allowPing = createPingRateLimiter();
      socket.on("message", (raw) => {
        let message: {type?:string; clientTime?:number};
        try { message = JSON.parse(raw.toString()) as {type?:string;clientTime?:number}; }
        catch { send({type:"chess:error",code:"invalid_json"}); return; }
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
        send({type:"chess:error",code:"unsupported_command_use_authenticated_api"});
      });
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
        try { await listener.query("UNLISTEN " + channel); } catch {}
        listener.release();
        listenerToRelease = undefined;
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
          if (presenceRegistered && shouldPublishOffline && listenerToRelease) {
            try {
              await listenerToRelease.query("SELECT pg_notify($1,$2)",[
                "chess_game_" + gameId,
                JSON.stringify({type:"presence",id:userId,connected:false})
              ]);
            } catch {}
          }
          listenerToRelease?.release();
          listenerToRelease = undefined;
        }
      } catch { /* cleanup must not mask subscription failure */ }
      socket.close(1011, "subscription_failed");
    });
  });
}
