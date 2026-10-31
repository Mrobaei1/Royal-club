import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import type { WebSocket } from "ws";

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
      const send = (value: unknown) => {
        if (!closed && socket.readyState === 1) socket.send(JSON.stringify(value));
      };
      const publish = async (event: object) => {
        await listener.query("SELECT pg_notify($1,$2)", [channel, JSON.stringify(event)]);
      };
      listener.on("notification", (notification) => {
        if (!notification.payload) return;
        let event: {type?:string; id?:string};
        try { event = JSON.parse(notification.payload) as {type?:string;id?:string}; }
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
          } else if (event.type === "voice") {
            const lease = await options.pool.query(
              "SELECT u.username,l.expires_at FROM chess_voice_leases l JOIN users u ON u.id=l.user_id WHERE l.room_id=$1 AND l.expires_at>NOW()",
              [roomId]
            );
            send(lease.rowCount
              ? {type:"chess:voice:granted",speakingUsername:lease.rows[0].username,expiresAt:lease.rows[0].expires_at}
              : {type:"chess:voice:released"});
          }
        })().catch(() => send({type:"chess:error",code:"event_delivery_failed"}));
      });
      await listener.query("LISTEN " + channel);
      await publish({type:"presence",userId,connected:true});
      send({type:"chess:connected",gameId});
      socket.on("message", (raw) => {
        let message: {type?:string};
        try { message = JSON.parse(raw.toString()) as {type?:string}; }
        catch { send({type:"chess:error",code:"invalid_json"}); return; }
        if (message.type === "ping") send({type:"chess:pong",serverTime:Date.now()});
        else send({type:"chess:error",code:"unsupported_command_use_authenticated_api"});
      });
      socket.on("close", () => {
        closed = true;
        void publish({type:"presence",userId,connected:false}).finally(async () => {
          try { await listener.query("UNLISTEN " + channel); } catch {}
          listener.release();
        });
      });
      socket.on("error", () => {
        closed = true;
        listener.release();
      });
    })().catch(() => socket.close(1011, "subscription_failed"));
  });
}
