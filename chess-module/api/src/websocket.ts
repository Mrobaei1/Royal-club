import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import type { WebSocket } from "ws";
import { Buffer } from "node:buffer";

type Options = {
  pool: Pool;
  authenticate: preHandlerHookHandler;
  getUserId: (request: FastifyRequest) => string;
};

export async function registerChessWebSocket(app: FastifyInstance, options: Options): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
  app.get<{ Querystring: { gameId: string } }>("/chess/ws", {
    websocket: true,
    preHandler: options.authenticate
  }, (socket: WebSocket, request) => {
    const userId = options.getUserId(request);
    const gameId = request.query.gameId;
    if (!/^\d+$/.test(gameId) || !/^\d+$/.test(userId)) {
      socket.close(1008, "invalid_identity");
      return;
    }
    void (async () => {
      const membership = await options.pool.query(
        "SELECT id,room_id FROM chess_games WHERE id=$1 AND (white_user_id=$2 OR black_user_id=$2)",
        [gameId, userId]
      );
      if (!membership.rowCount) {
        socket.close(1008, "not_a_game_participant");
        return;
      }
      const roomId = String(membership.rows[0].room_id);
      const channel = "chess_game_" + gameId;
      const listener = await options.pool.connect();
      let closed = false;
      let cleaned = false;
      let voiceWasActive = false;
      let signalWindowStarted = Date.now();
      let signalCount = 0;
      let expiryTimer: ReturnType<typeof setInterval> | undefined;
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
          } else if (event.type === "voice:signal" && event.fromUserId !== userId &&
                     typeof event.signalType === "string" && event.payload !== undefined) {
            send({type:"chess:voice:signal",signalType:event.signalType,payload:event.payload});
          } else if (event.type === "voice_settings") {
            const settings = await options.pool.query(
              "SELECT COALESCE((settings_snapshot->>'voiceEnabled')::boolean,false) AS enabled FROM chess_rooms WHERE id=$1",
              [roomId]
            );
            send({type:"chess:voice:settings",enabled:Boolean(settings.rows[0]?.enabled)});
          } else if (event.type === "voice") {
            const lease = await options.pool.query(
              "SELECT u.username,l.expires_at FROM chess_voice_leases l JOIN users u ON u.id=l.user_id WHERE l.room_id=$1 AND l.expires_at>NOW()",
              [roomId]
            );
            voiceWasActive = Boolean(lease.rowCount);
            send(lease.rowCount
              ? {type:"chess:voice:granted",speakingUsername:lease.rows[0].username,expiresAt:lease.rows[0].expires_at}
              : {type:"chess:voice:released"});
          }
        })().catch(() => send({type:"chess:error",code:"event_delivery_failed"}));
      });
      await listener.query("LISTEN " + channel);
      await publish({type:"presence",id:userId,connected:true});
      send({type:"chess:connected",gameId});
      const currentLease = await options.pool.query(
        "SELECT u.username,l.expires_at FROM chess_voice_leases l JOIN users u ON u.id=l.user_id WHERE l.room_id=$1 AND l.expires_at>NOW()",
        [roomId]
      );
      voiceWasActive = Boolean(currentLease.rowCount);
      if (currentLease.rowCount) send({type:"chess:voice:granted",speakingUsername:currentLease.rows[0].username,expiresAt:currentLease.rows[0].expires_at});
      expiryTimer = setInterval(() => {
        void options.pool.query("SELECT 1 FROM chess_voice_leases WHERE room_id=$1 AND expires_at>NOW()",[roomId])
          .then(result => {
            if (voiceWasActive && !result.rowCount) {
              voiceWasActive = false;
              send({type:"chess:voice:released"});
            }
          }).catch(() => send({type:"chess:error",code:"voice_status_unavailable"}));
      },1000);
      socket.on("message", (raw) => {
        let message: {type?:string; signalType?:string; payload?:unknown};
        try { message = JSON.parse(raw.toString()) as {type?:string;signalType?:string;payload?:unknown}; }
        catch { send({type:"chess:error",code:"invalid_json"}); return; }
        if (message.type === "ping") {
          send({type:"chess:pong",serverTime:Date.now()});
          return;
        }
        if (message.type !== "chess:voice:signal" ||
            !["offer","answer","candidate"].includes(message.signalType ?? "") ||
            message.payload === undefined || typeof message.payload !== "object" ||
            message.payload === null || Array.isArray(message.payload)) {
          send({type:"chess:error",code:"unsupported_command_use_authenticated_api"});
          return;
        }
        const signalPayload = message.payload as Record<string, unknown>;
        if ((message.signalType === "offer" || message.signalType === "answer") &&
            (typeof signalPayload.sdp !== "string" || signalPayload.sdp.length > 6000 ||
             signalPayload.type !== message.signalType)) {
          send({type:"chess:error",code:"invalid_sdp_signal"});
          return;
        }
        if (message.signalType === "candidate" &&
            (typeof signalPayload.candidate !== "string" || signalPayload.candidate.length > 4096)) {
          send({type:"chess:error",code:"invalid_ice_candidate"});
          return;
        }
        const signalNow = Date.now();
        if (signalNow - signalWindowStarted >= 10_000) {
          signalWindowStarted = signalNow;
          signalCount = 0;
        }
        signalCount += 1;
        if (signalCount > 30) {
          send({type:"chess:error",code:"voice_signaling_rate_limited"});
          return;
        }
        void (async () => {
          const allowed = await options.pool.query(
            "SELECT 1 FROM chess_games g JOIN chess_rooms r ON r.id=g.room_id JOIN chess_voice_leases l ON l.room_id=r.id WHERE g.id=$1 AND g.status='active' AND (g.white_user_id=$2 OR g.black_user_id=$2) AND COALESCE((r.settings_snapshot->>'voiceEnabled')::boolean,false)=true AND l.expires_at>NOW() AND (($3='offer' AND l.user_id=$2) OR ($3='answer' AND l.user_id<>$2) OR $3='candidate')",
            [gameId,userId,message.signalType]
          );
          if (!allowed.rowCount) {
            send({type:"chess:error",code:"voice_signaling_not_allowed"});
            return;
          }
          const payload = JSON.stringify({
            type:"voice:signal",fromUserId:userId,signalType:message.signalType,payload:message.payload
          });
          if (Buffer.byteLength(payload,"utf8") > 7000) {
            send({type:"chess:error",code:"voice_signal_too_large"});
            return;
          }
          await publish(JSON.parse(payload) as object);
        })().catch(() => send({type:"chess:error",code:"voice_signal_delivery_failed"}));
      });
      const cleanup = async () => {
        if (cleaned) return;
        cleaned = true;
        closed = true;
        if (expiryTimer) clearInterval(expiryTimer);
        try { await publish({type:"presence",id:userId,connected:false}); } catch {}
        // A disconnected participant must not keep the room microphone lease.
        try { await options.pool.query("DELETE FROM chess_voice_leases WHERE room_id=$1 AND user_id=$2",[roomId,userId]); } catch {}
        try { await listener.query("UNLISTEN " + channel); } catch {}
        listener.release();
      };
      socket.on("close", () => { void cleanup(); });
      socket.on("error", () => { void cleanup(); });
    })().catch(() => socket.close(1011, "subscription_failed"));
  });
}
