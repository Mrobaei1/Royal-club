import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool, PoolClient } from "pg";
import { ChessGame } from "./engine.js";
import { defaultTimeControls, snapshotClock, startClock, settleClock, type ClockSnapshot, type TimeControl } from "./clock.js";
import { canJoinRoom, validateRoomSettings, type ChessRoomSettings } from "./room-policy.js";
import { awardChessResult } from "./progression-store.js";

type RouteOptions = {
  pool: Pool;
  authenticate: preHandlerHookHandler;
  getUserId: (request: FastifyRequest) => string;
  canManageSettings: (userId: string) => Promise<boolean>;
};
type CreateRoomBody = { minOpponentLevel?: number; timeControlId?: string; chatEnabled?: boolean; voiceEnabled?: boolean };
type MoveBody = { from: string; to: string; promotion?: "q"|"r"|"b"|"n" };
type ChatBody = { message: string };

const initialFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const userId=(request:FastifyRequest,options:RouteOptions):string=>{
  const id=options.getUserId(request);
  if(!id||!/^\d+$/.test(id)) throw new Error("unauthorized");
  return id;
};
const fail=(reply:{code:(status:number)=>{send:(body:unknown)=>unknown}},status:number,error:string)=>reply.code(status).send({error});
async function rollback(client:PoolClient){try{await client.query("ROLLBACK");}catch{/* preserve original failure */}}

export async function registerChessRoutes(app:FastifyInstance,options:RouteOptions):Promise<void>{
  const {pool}=options;
  app.get("/chess/time-controls",{preHandler:options.authenticate},async()=>{
    const result=await pool.query("SELECT id,display_name AS name,base_ms,increment_ms,enabled FROM chess_time_controls ORDER BY base_ms");
    return {timeControls:result.rows};
  });

  app.post<{Body:CreateRoomBody}>("/chess/rooms",{preHandler:options.authenticate},async(request,reply)=>{
    let hostId:string;
    try{hostId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const body=request.body??{};
    const settings:ChessRoomSettings={
      minOpponentLevel:body.minOpponentLevel??1,
      timeControlId:body.timeControlId??"rapid",
      chatEnabled:body.chatEnabled??true,
      voiceEnabled:body.voiceEnabled??false
    };
    try{validateRoomSettings(settings);}catch{return fail(reply,400,"invalid_room_settings");}
    const tc=await pool.query("SELECT id FROM chess_time_controls WHERE id=$1 AND enabled=true",[settings.timeControlId]);
    if(!tc.rowCount)return fail(reply,400,"time_control_unavailable");
    const roomCode=randomBytes(5).toString("hex").toUpperCase();
    const inserted=await pool.query(
      `INSERT INTO chess_rooms(room_code,host_user_id,min_opponent_level,time_control_id,settings_snapshot)
       VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,room_code`,
      [roomCode,hostId,settings.minOpponentLevel,settings.timeControlId,JSON.stringify(settings)]
    );
    return reply.code(201).send({roomId:String(inserted.rows[0].id),roomCode:inserted.rows[0].room_code,settings});
  });

  app.post<{Params:{roomCode:string}}>("/chess/rooms/:roomCode/join",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const roomResult=await client.query("SELECT * FROM chess_rooms WHERE room_code=$1 FOR UPDATE",[request.params.roomCode]);
      const room=roomResult.rows[0];
      if(!room||room.status!=="waiting"){await client.query("ROLLBACK");return fail(reply,404,"room_unavailable");}
      if(String(room.host_user_id)===playerId){await client.query("ROLLBACK");return fail(reply,400,"cannot_play_self");}
      const progression=await client.query("SELECT level FROM chess_player_progression WHERE user_id=$1",[playerId]);
      const level=Number(progression.rows[0]?.level??1);
      const settings=(room.settings_snapshot??{}) as ChessRoomSettings;
      if(!canJoinRoom(settings,{userId:playerId,chessLevel:level})){await client.query("ROLLBACK");return fail(reply,403,"minimum_chess_level_required");}
      const timeResult=await client.query("SELECT id,display_name AS name,base_ms,increment_ms,enabled FROM chess_time_controls WHERE id=$1 AND enabled=true",[room.time_control_id]);
      const time=timeResult.rows[0] as {id:string;name:string;base_ms:number;increment_ms:number;enabled:boolean}|undefined;
      if(!time){await client.query("ROLLBACK");return fail(reply,409,"time_control_unavailable");}
      const control:TimeControl={id:time.id,name:time.id,baseMs:Number(time.base_ms),incrementMs:Number(time.increment_ms),enabled:time.enabled};
      const now=Date.now();
      const clock=startClock(snapshotClock(control,now),"white",now);
      const game=await client.query(
        `INSERT INTO chess_games(room_id,white_user_id,black_user_id,initial_fen,current_fen,pgn,clock_snapshot,settings_snapshot)
         VALUES($1,$2,$3,$4,$4,'',$5::jsonb,$6::jsonb) RETURNING id`,
        [room.id,room.host_user_id,playerId,initialFen,JSON.stringify(clock),JSON.stringify({...settings,timeControl:control})]
      );
      await client.query("UPDATE chess_rooms SET status='active',settings_snapshot=$2::jsonb WHERE id=$1",[room.id,JSON.stringify({...settings,timeControl:control})]);
      await client.query("COMMIT");
      return reply.code(201).send({gameId:String(game.rows[0].id),fen:initialFen,clock,settings:{...settings,timeControl:control}});
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"chess_room_join_failed");}
    finally{client.release();}
  });

  app.get<{Params:{gameId:string}}>("/chess/games/:gameId",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const result=await pool.query(
      `SELECT g.*, wu.username AS white_username, bu.username AS black_username
       FROM chess_games g JOIN users wu ON wu.id=g.white_user_id JOIN users bu ON bu.id=g.black_user_id
       WHERE g.id=$1 AND (g.white_user_id=$2 OR g.black_user_id=$2)`,
      [request.params.gameId,playerId]
    );
    if(!result.rowCount)return fail(reply,404,"game_not_found");
    const row=result.rows[0];
    return {gameId:String(row.id),fen:row.current_fen,pgn:row.pgn,status:row.status,revision:Number(row.revision),
      clock:row.clock_snapshot,settings:row.settings_snapshot,
      players:{white:{username:row.white_username},black:{username:row.black_username}}};
  });

  app.post<{Params:{gameId:string};Body:MoveBody}>("/chess/games/:gameId/moves",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query("SELECT * FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=result.rows[0];
      if(!row||row.status!=="active"){await client.query("ROLLBACK");return fail(reply,404,"active_game_not_found");}
      const white=String(row.white_user_id),black=String(row.black_user_id);
      const game=new ChessGame(row.current_fen);
      const before=game.snapshot();
      const expected=before.turn==="w"?white:black;
      if(playerId!==expected){await client.query("ROLLBACK");return fail(reply,403,"not_your_turn");}
      const settings=row.settings_snapshot as {timeControl:TimeControl};
      const control=settings.timeControl;
      const clock=row.clock_snapshot as ClockSnapshot;
      const now=Date.now();
      const elapsed=settleClock(clock,control,now,false);
      if(elapsed.finished){
        const winner=clock.active==="white"?black:white;
        const terminal=winner===white?"white_win":"black_win";
        await client.query("UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",
          [row.id,terminal,JSON.stringify(elapsed)]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});
        await client.query("COMMIT");
        return fail(reply,409,"clock_expired");
      }
      const played=game.play(request.body);
      const after=game.snapshot();
      const nextClock=settleClock({...elapsed,active:clock.active,lastStartedAt:clock.lastStartedAt},control,now,true);
      const ply=Number(row.revision)+1;
      await client.query(
        `INSERT INTO chess_moves(game_id,ply,user_id,from_square,to_square,promotion,san,fen_after)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [row.id,ply,playerId,request.body.from,request.body.to,request.body.promotion??null,played.san,played.fen]
      );
      let status="active";
      if(after.checkmate)status=after.turn==="w"?"black_win":"white_win";
      else if(after.draw)status="draw";
      await client.query(
        `UPDATE chess_games SET current_fen=$2,pgn=$3,clock_snapshot=$4::jsonb,status=$5,
          finished_at=CASE WHEN $5='active' THEN NULL ELSE NOW() END,revision=revision+1 WHERE id=$1`,
        [row.id,played.fen,played.pgn,JSON.stringify({...nextClock,finished:status!=="active"}),status]
      );
      if(status!=="active"){
        if(status==="draw")await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"draw",winnerId:null,loserId:null});
        else {const winner=status==="white_win"?white:black;await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});}
      }
      await client.query("COMMIT");
      return {fen:played.fen,pgn:played.pgn,revision:ply,status,clock:nextClock,move:played.san};
    }catch(error){
      await rollback(client);
      request.log.error(error);
      const message=error instanceof Error?error.message:"";
      return fail(reply,message==="illegal_move"?400:500,message==="illegal_move"?"illegal_move":"chess_move_failed");
    }finally{client.release();}
  });

  app.post<{Params:{gameId:string};Body:ChatBody}>("/chess/games/:gameId/chat",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const message=(request.body?.message??"").trim();
    if(!message||message.length>2000)return fail(reply,400,"invalid_message");
    const inserted=await pool.query(
      `INSERT INTO chess_chat_messages(game_id,user_id,message)
       SELECT g.id,$2,$3 FROM chess_games g
       WHERE g.id=$1 AND g.status='active' AND (g.white_user_id=$2 OR g.black_user_id=$2)
         AND COALESCE((g.settings_snapshot->>'chatEnabled')::boolean,true)=true
       RETURNING id,created_at`,
      [request.params.gameId,playerId,message]
    );
    if(!inserted.rowCount)return fail(reply,403,"chat_not_allowed");
    const profile=await pool.query("SELECT username FROM users WHERE id=$1",[playerId]);
    return reply.code(201).send({id:String(inserted.rows[0].id),username:profile.rows[0]?.username??"",message,createdAt:inserted.rows[0].created_at});
  });

  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/resign",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query("SELECT * FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=result.rows[0];
      if(!row||row.status!=="active"){await client.query("ROLLBACK");return fail(reply,404,"active_game_not_found");}
      const white=String(row.white_user_id),black=String(row.black_user_id);
      if(playerId!==white&&playerId!==black){await client.query("ROLLBACK");return fail(reply,403,"not_a_player");}
      const winner=playerId===white?black:white;
      const status=winner===white?"white_win":"black_win";
      await client.query("UPDATE chess_games SET status=$2,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,status]);
      await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"resignation",winnerId:winner,loserId:playerId});
      await client.query("COMMIT");
      return {status,winnerId:winner};
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"chess_resign_failed");}
    finally{client.release();}
  });

  app.put<{Body:{id:string;displayName:string;baseMs:number;incrementMs:number;enabled:boolean}}>("/chess/admin/time-controls",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    if(!await options.canManageSettings(actor))return fail(reply,403,"forbidden");
    const {id,displayName,baseMs,incrementMs,enabled}=request.body;
    if(!id?.trim()||!displayName?.trim()||!Number.isSafeInteger(baseMs)||baseMs<1000||!Number.isSafeInteger(incrementMs)||incrementMs<0||typeof enabled!=="boolean")return fail(reply,400,"invalid_time_control");
    const saved=await pool.query(
      `INSERT INTO chess_time_controls(id,display_name,base_ms,increment_ms,enabled)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,
       base_ms=EXCLUDED.base_ms,increment_ms=EXCLUDED.increment_ms,enabled=EXCLUDED.enabled,updated_at=NOW()
       RETURNING id,display_name AS name,base_ms,increment_ms,enabled`,
      [id,displayName,baseMs,incrementMs,enabled]
    );
    return {timeControl:saved.rows[0],activeGamesUnchanged:true};
  });
}
