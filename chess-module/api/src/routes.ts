import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { Pool, PoolClient } from "pg";
import { ChessGame } from "./engine.js";
import { defaultTimeControls, snapshotClock, startClock, settleClock, type ClockSnapshot, type TimeControl } from "./clock.js";
import { canJoinRoom, validateRoomSettings, type ChessRoomSettings } from "./room-policy.js";
import { awardChessResult } from "./progression-store.js";
import { startChessClockScheduler } from "./clock-scheduler.js";

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
async function publishGameEvent(pool:Pool,gameId:string|number,event:object):Promise<void>{
  await pool.query("SELECT pg_notify($1,$2)",["chess_game_"+String(gameId),JSON.stringify(event)]);
}

export async function registerChessRoutes(app:FastifyInstance,options:RouteOptions):Promise<void>{
  const {pool}=options;
  startChessClockScheduler(app,pool);
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
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_matchmaking'))");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_player'),hashtext($1))",[hostId]);
      const active=await client.query(
        "SELECT id FROM chess_games WHERE status='active' AND (white_user_id=$1 OR black_user_id=$1) LIMIT 1",
        [hostId]
      );
      if(active.rowCount){await client.query("ROLLBACK");return fail(reply,409,"active_chess_game_exists");}
      const queued=await client.query("SELECT 1 FROM chess_matchmaking_queue WHERE user_id=$1",[hostId]);
      if(queued.rowCount){await client.query("ROLLBACK");return fail(reply,409,"matchmaking_in_progress");}
      const waiting=await client.query(
        "SELECT 1 FROM chess_rooms WHERE host_user_id=$1 AND status='waiting' AND expires_at>NOW() LIMIT 1",
        [hostId]
      );
      if(waiting.rowCount){await client.query("ROLLBACK");return fail(reply,409,"waiting_room_already_exists");}
      const tc=await client.query("SELECT id FROM chess_time_controls WHERE id=$1 AND enabled=true",[settings.timeControlId]);
      if(!tc.rowCount){await client.query("ROLLBACK");return fail(reply,400,"time_control_unavailable");}
      const roomCode=randomBytes(5).toString("hex").toUpperCase();
      const inserted=await client.query(
        `INSERT INTO chess_rooms(room_code,host_user_id,min_opponent_level,time_control_id,settings_snapshot,expires_at)
         VALUES($1,$2,$3,$4,$5::jsonb,NOW()+INTERVAL '10 minutes') RETURNING id,room_code`,
        [roomCode,hostId,settings.minOpponentLevel,settings.timeControlId,JSON.stringify(settings)]
      );
      await client.query("COMMIT");
      return reply.code(201).send({roomId:String(inserted.rows[0].id),roomCode:inserted.rows[0].room_code,settings});
    }catch(error){
      await rollback(client);
      request.log.error(error);
      return fail(reply,500,"chess_room_create_failed");
    }finally{client.release();}
  });

  app.delete<{Params:{roomCode:string}}>("/chess/rooms/:roomCode",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const cancelled=await pool.query(
      "UPDATE chess_rooms SET status='cancelled' WHERE room_code=$1 AND host_user_id=$2 AND status='waiting' RETURNING id",
      [request.params.roomCode,actor]
    );
    if(!cancelled.rowCount)return fail(reply,404,"waiting_room_not_found");
    return {cancelled:true};
  });

  app.post<{Params:{roomCode:string}}>("/chess/rooms/:roomCode/join",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_matchmaking'))");
      const roomResult=await client.query("SELECT * FROM chess_rooms WHERE room_code=$1 FOR UPDATE",[request.params.roomCode]);
      const room=roomResult.rows[0];
      if(!room||room.status!=="waiting"){await client.query("ROLLBACK");return fail(reply,404,"room_unavailable");}
      const hostId=String(room.host_user_id);
      for(const id of [hostId,playerId].sort()){
        await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_player'),hashtext($1))",[id]);
      }
      if(room.expires_at&&new Date(room.expires_at).getTime()<=Date.now()){
        await client.query("UPDATE chess_rooms SET status='cancelled' WHERE id=$1",[room.id]);
        await client.query("COMMIT");
        return fail(reply,410,"room_expired");
      }
      if(String(room.host_user_id)===playerId){await client.query("ROLLBACK");return fail(reply,400,"cannot_play_self");}
      const activeGame=await client.query(
        "SELECT id FROM chess_games WHERE status='active' AND (white_user_id IN ($1,$2) OR black_user_id IN ($1,$2)) LIMIT 1",
        [hostId,playerId]
      );
      if(activeGame.rowCount){await client.query("ROLLBACK");return fail(reply,409,"participant_active_chess_game_exists");}
      const progression=await client.query("SELECT level FROM chess_player_progression WHERE user_id=$1",[playerId]);
      const level=Number(progression.rows[0]?.level??1);
      const settings=(room.settings_snapshot??{}) as ChessRoomSettings;
      if(!canJoinRoom(settings,{userId:playerId,chessLevel:level})){await client.query("ROLLBACK");return fail(reply,403,"minimum_chess_level_required");}
      const timeResult=await client.query("SELECT id,display_name AS name,base_ms,increment_ms,enabled FROM chess_time_controls WHERE id=$1 AND enabled=true",[room.time_control_id]);
      const time=timeResult.rows[0] as {id:string;name:string;base_ms:number;increment_ms:number;enabled:boolean}|undefined;
      if(!time){await client.query("ROLLBACK");return fail(reply,409,"time_control_unavailable");}
      const control:TimeControl={id:time.id,name:time.name,baseMs:Number(time.base_ms),incrementMs:Number(time.increment_ms),enabled:time.enabled};
      const now=Date.now();
      const clock=startClock(snapshotClock(control,now),"white",now);
      const game=await client.query(
        `INSERT INTO chess_games(room_id,white_user_id,black_user_id,initial_fen,current_fen,pgn,clock_snapshot,settings_snapshot)
         VALUES($1,$2,$3,$4,$4,'',$5::jsonb,$6::jsonb) RETURNING id`,
        [room.id,room.host_user_id,playerId,initialFen,JSON.stringify(clock),JSON.stringify({...settings,timeControl:control})]
      );
      await client.query("UPDATE chess_rooms SET status='active',settings_snapshot=$2::jsonb WHERE id=$1",[room.id,JSON.stringify({...settings,timeControl:control})]);
      await client.query("DELETE FROM chess_matchmaking_queue WHERE user_id=ANY($1::bigint[])",[[hostId,playerId]]);
      await client.query("COMMIT");
      return reply.code(201).send({gameId:String(game.rows[0].id),fen:initialFen,clock,settings:{...settings,timeControl:control}});
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"chess_room_join_failed");}
    finally{client.release();}
  });

  app.get<{Params:{gameId:string}}>("/chess/games/:gameId",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const result=await pool.query(
      `SELECT g.*, wu.username AS white_username, bu.username AS black_username, r.host_user_id,
         jsonb_set(COALESCE(g.settings_snapshot,'{}'::jsonb),'{voiceEnabled}',
           to_jsonb(COALESCE((r.settings_snapshot->>'voiceEnabled')::boolean,false)),true) AS live_settings_snapshot
       FROM chess_games g JOIN users wu ON wu.id=g.white_user_id JOIN users bu ON bu.id=g.black_user_id
       JOIN chess_rooms r ON r.id=g.room_id
       WHERE g.id=$1 AND (g.white_user_id=$2 OR g.black_user_id=$2)`,
      [request.params.gameId,playerId]
    );
    if(!result.rowCount)return fail(reply,404,"game_not_found");
    const row=result.rows[0];
    const engine=new ChessGame(row.initial_fen, row.pgn);
    const engineState=engine.snapshot();
    return {gameId:String(row.id),fen:row.current_fen,pgn:row.pgn,status:row.status,revision:Number(row.revision),
      turn:engineState.turn,legalMoves:engineState.legalMoves,
      clock:row.clock_snapshot,settings:row.live_settings_snapshot,isHost:String(row.host_user_id)===playerId,
      players:{white:{username:row.white_username},black:{username:row.black_username}}};
  });

  app.get<{Params:{gameId:string};Querystring:{afterPly?:string}}>("/chess/games/:gameId/history",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const afterPly=request.query.afterPly===undefined?0:Number(request.query.afterPly);
    if(!Number.isSafeInteger(afterPly)||afterPly<0)return fail(reply,400,"invalid_history_cursor");
    const game=await pool.query(
      "SELECT id,current_fen,pgn,status,revision FROM chess_games WHERE id=$1 AND (white_user_id=$2 OR black_user_id=$2)",
      [request.params.gameId,playerId]
    );
    if(!game.rowCount)return fail(reply,404,"game_not_found");
    const moves=await pool.query(
      "SELECT ply,user_id,from_square,to_square,promotion,san,fen_after,created_at FROM chess_moves WHERE game_id=$1 AND ply>$2 ORDER BY ply ASC LIMIT 200",
      [request.params.gameId,afterPly]
    );
    return {
      gameId:String(game.rows[0].id),fen:game.rows[0].current_fen,pgn:game.rows[0].pgn,
      status:game.rows[0].status,revision:Number(game.rows[0].revision),
      moves:moves.rows.map(row=>({...row,ply:Number(row.ply),userId:String(row.user_id)}))
    };
  });

  app.post<{Params:{gameId:string};Body:MoveBody}>("/chess/games/:gameId/moves",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const body=request.body;
    if(!body||typeof body.from!=="string"||typeof body.to!=="string"||
       !/^[a-h][1-8]$/.test(body.from)||!/^[a-h][1-8]$/.test(body.to)||
       (body.promotion!==undefined&&!["q","r","b","n"].includes(body.promotion))) {
      return fail(reply,400,"invalid_move");
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query("SELECT * FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=result.rows[0];
      if(!row||row.status!=="active"){await client.query("ROLLBACK");return fail(reply,404,"active_game_not_found");}
      const white=String(row.white_user_id),black=String(row.black_user_id);
      const game=new ChessGame(row.initial_fen, row.pgn);
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
          [row.id,terminal,JSON.stringify({...elapsed,active:null,lastStartedAt:null,finished:true})]);
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});
        await client.query("COMMIT");
        return fail(reply,409,"clock_expired");
      }
      const played=game.play(request.body);
      const after=game.snapshot();
      const nextClock=settleClock(elapsed,control,now,true);
      const cancelledOffers=await client.query(
        "UPDATE chess_draw_offers SET status='cancelled',responded_by=$2,responded_at=NOW() WHERE game_id=$1 AND status='pending' RETURNING id",
        [row.id,playerId]
      );
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
        [row.id,played.fen,played.pgn,JSON.stringify(status==="active"?nextClock:{...nextClock,active:null,lastStartedAt:null,finished:true}),status]
      );
      if(status!=="active"){
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        if(status==="draw")await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"draw",winnerId:null,loserId:null});
        else {const winner=status==="white_win"?white:black;await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});}
      }
      await client.query("COMMIT");
      for(const offer of cancelledOffers.rows){
        try{await publishGameEvent(pool,row.id,{type:"draw_response",offerId:String(offer.id),status:"cancelled"});}
        catch(error){request.log.warn({err:error},"chess draw cancellation notification failed");}
      }
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
    const rawMessage=request.body?.message;
    if(typeof rawMessage!=="string")return fail(reply,400,"invalid_message");
    const message=rawMessage.trim();
    if(!message||message.length>2000)return fail(reply,400,"invalid_message");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_chat'),hashtext($1))",[playerId]);
      const recent=await client.query(
        "SELECT COUNT(*)::int AS count FROM chess_chat_messages WHERE user_id=$1 AND created_at>NOW()-INTERVAL '10 seconds'",
        [playerId]
      );
      if(Number(recent.rows[0]?.count??0)>=8){
        await client.query("ROLLBACK");
        return fail(reply,429,"chat_rate_limited");
      }
      const inserted=await client.query(
        `INSERT INTO chess_chat_messages(game_id,user_id,message)
         SELECT g.id,$2,$3 FROM chess_games g
         WHERE g.id=$1 AND g.status='active' AND (g.white_user_id=$2 OR g.black_user_id=$2)
           AND COALESCE((g.settings_snapshot->>'chatEnabled')::boolean,true)=true
         RETURNING id,created_at`,
        [request.params.gameId,playerId,message]
      );
      if(!inserted.rowCount){await client.query("ROLLBACK");return fail(reply,403,"chat_not_allowed");}
      const profile=await client.query("SELECT username FROM users WHERE id=$1",[playerId]);
      await client.query("COMMIT");
      return reply.code(201).send({id:String(inserted.rows[0].id),username:profile.rows[0]?.username??"",message,createdAt:inserted.rows[0].created_at});
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"chess_chat_failed");}
    finally{client.release();}
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
      const settings=row.settings_snapshot as {timeControl:TimeControl};
      const activeClock=row.clock_snapshot as ClockSnapshot;
      const elapsed=settleClock(activeClock,settings.timeControl,Date.now(),false);
      if(elapsed.finished){
        const timeoutWinner=activeClock.active==="white"?black:white;
        const timeoutStatus=timeoutWinner===white?"white_win":"black_win";
        await client.query("UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,timeoutStatus,JSON.stringify({...elapsed,active:null,lastStartedAt:null,finished:true})]);
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:timeoutWinner,loserId:timeoutWinner===white?black:white});
        await client.query("COMMIT");
        return fail(reply,409,"clock_expired");
      }
      const winner=playerId===white?black:white;
      const status=winner===white?"white_win":"black_win";
      const clock={...elapsed,active:null,lastStartedAt:null,finished:true};
      await client.query("UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,status,JSON.stringify(clock)]);
      await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
      await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
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
    const body=request.body;
    const {id,displayName,baseMs,incrementMs,enabled}=body??{} as {id:string;displayName:string;baseMs:number;incrementMs:number;enabled:boolean};
    if(typeof id!=="string"||!id.trim()||!/^[a-zA-Z0-9_-]{1,40}$/.test(id)||
       typeof displayName!=="string"||!displayName.trim()||displayName.length>80||
       !Number.isSafeInteger(baseMs)||baseMs<1000||baseMs>86_400_000||
       !Number.isSafeInteger(incrementMs)||incrementMs<0||incrementMs>60_000||
       typeof enabled!=="boolean")return fail(reply,400,"invalid_time_control");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const before=await client.query("SELECT id,display_name,base_ms,increment_ms,enabled FROM chess_time_controls WHERE id=$1 FOR UPDATE",[id]);
      const saved=await client.query(
        `INSERT INTO chess_time_controls(id,display_name,base_ms,increment_ms,enabled)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,
         base_ms=EXCLUDED.base_ms,increment_ms=EXCLUDED.increment_ms,enabled=EXCLUDED.enabled,updated_at=NOW()
         RETURNING id,display_name AS name,base_ms,increment_ms,enabled`,
        [id,displayName.trim(),baseMs,incrementMs,enabled]
      );
      await client.query(
        "INSERT INTO chess_admin_audit_events(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'time_control_upsert','time_control',$2,$3::jsonb,$4::jsonb)",
        [actor,id,before.rowCount?JSON.stringify(before.rows[0]):null,JSON.stringify(saved.rows[0])]
      );
      await client.query("COMMIT");
      return {timeControl:saved.rows[0],activeGamesUnchanged:true};
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"time_control_save_failed");}
    finally{client.release();}
  });

  app.get<{Querystring:{limit?:string}}>("/chess/admin/audit",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    if(!await options.canManageSettings(actor))return fail(reply,403,"forbidden");
    const limit=request.query.limit===undefined?50:Number(request.query.limit);
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)return fail(reply,400,"invalid_audit_limit");
    const result=await pool.query(
      `SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.created_at,u.username AS actor_username
       FROM chess_admin_audit_events a JOIN users u ON u.id=a.actor_user_id
       ORDER BY a.created_at DESC,a.id DESC LIMIT $1`,
      [limit]
    );
    return {events:result.rows.map(row=>({...row,id:String(row.id)}))};
  });

  app.get<{Params:{userId:string}}>("/chess/players/:userId/profile",{preHandler:options.authenticate},async(request,reply)=>{
    let viewer:string;
    try{viewer=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    if(!/^\d+$/.test(request.params.userId))return fail(reply,400,"invalid_user_id");
    const profile=await pool.query(
      'SELECT u.id,u.username,COALESCE(p.level,1) AS level,COALESCE(p.xp,0) AS xp,COALESCE(r.rating,1200) AS rating FROM users u LEFT JOIN chess_player_progression p ON p.user_id=u.id LEFT JOIN chess_player_ratings r ON r.user_id=u.id WHERE u.id=$1',
      [request.params.userId]
    );
    if(!profile.rowCount)return fail(reply,404,"player_not_found");
    const stats=await pool.query(
      "WITH played AS (SELECT CASE WHEN white_user_id=$1 THEN CASE status WHEN 'white_win' THEN 'win' WHEN 'black_win' THEN 'loss' ELSE 'draw' END ELSE CASE status WHEN 'black_win' THEN 'win' WHEN 'white_win' THEN 'loss' ELSE 'draw' END END AS outcome, COALESCE(settings_snapshot->'timeControl'->>'id','unknown') AS mode FROM chess_games WHERE status IN ('white_win','black_win','draw') AND (white_user_id=$1 OR black_user_id=$1)) SELECT mode,COUNT(*)::int AS games,COUNT(*) FILTER(WHERE outcome='win')::int AS wins,COUNT(*) FILTER(WHERE outcome='loss')::int AS losses,COUNT(*) FILTER(WHERE outcome='draw')::int AS draws FROM played GROUP BY mode ORDER BY mode",
      [request.params.userId]
    );
    const total=stats.rows.reduce((sum,row)=>sum+Number(row.games),0);
    const wins=stats.rows.reduce((sum,row)=>sum+Number(row.wins),0);
    return {username:profile.rows[0].username,level:Number(profile.rows[0].level),xp:Number(profile.rows[0].xp),rating:Number(profile.rows[0].rating),
      games:total,wins,losses:stats.rows.reduce((sum,row)=>sum+Number(row.losses),0),
      draws:stats.rows.reduce((sum,row)=>sum+Number(row.draws),0),winRate:total?Math.round(wins*1000/total)/10:0,
      byMode:stats.rows};
  });

  app.get<{Params:{username:string}}>("/chess/players/username/:username/profile",{preHandler:options.authenticate},async(request,reply)=>{
    try{userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const username=request.params.username.trim();
    if(!/^[a-zA-Z0-9_.-]{2,32}$/.test(username))return fail(reply,400,"invalid_username");
    const profile=await pool.query(
      "SELECT u.id,u.username,COALESCE(p.level,1) AS level,COALESCE(p.xp,0) AS xp,COALESCE(r.rating,1200) AS rating FROM users u LEFT JOIN chess_player_progression p ON p.user_id=u.id LEFT JOIN chess_player_ratings r ON r.user_id=u.id WHERE u.username=$1",
      [username]
    );
    if(!profile.rowCount)return fail(reply,404,"player_not_found");
    const stats=await pool.query(
      "WITH played AS (SELECT CASE WHEN white_user_id=$1 THEN CASE status WHEN 'white_win' THEN 'win' WHEN 'black_win' THEN 'loss' ELSE 'draw' END ELSE CASE status WHEN 'black_win' THEN 'win' WHEN 'white_win' THEN 'loss' ELSE 'draw' END END AS outcome, COALESCE(settings_snapshot->'timeControl'->>'id','unknown') AS mode FROM chess_games WHERE status IN ('white_win','black_win','draw') AND (white_user_id=$1 OR black_user_id=$1)) SELECT mode,COUNT(*)::int AS games,COUNT(*) FILTER(WHERE outcome='win')::int AS wins,COUNT(*) FILTER(WHERE outcome='loss')::int AS losses,COUNT(*) FILTER(WHERE outcome='draw')::int AS draws FROM played GROUP BY mode ORDER BY mode",
      [profile.rows[0].id]
    );
    const total=stats.rows.reduce((sum,row)=>sum+Number(row.games),0);
    const wins=stats.rows.reduce((sum,row)=>sum+Number(row.wins),0);
    return {username:profile.rows[0].username,level:Number(profile.rows[0].level),xp:Number(profile.rows[0].xp),rating:Number(profile.rows[0].rating),
      games:total,wins,losses:stats.rows.reduce((sum,row)=>sum+Number(row.losses),0),
      draws:stats.rows.reduce((sum,row)=>sum+Number(row.draws),0),winRate:total?Math.round(wins*1000/total)/10:0,
      byMode:stats.rows};
  });

  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/voice/request",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const leaseId=randomUUID();
    const result=await pool.query(
      "INSERT INTO chess_voice_leases(room_id,user_id,lease_id,expires_at) SELECT r.id,$2,$3,NOW()+INTERVAL '8 seconds' FROM chess_games g JOIN chess_rooms r ON r.id=g.room_id WHERE g.id=$1 AND g.status='active' AND (g.white_user_id=$2 OR g.black_user_id=$2) AND COALESCE((r.settings_snapshot->>'voiceEnabled')::boolean,false)=true ON CONFLICT(room_id) DO UPDATE SET user_id=EXCLUDED.user_id,lease_id=EXCLUDED.lease_id,expires_at=EXCLUDED.expires_at WHERE chess_voice_leases.expires_at<=NOW() OR chess_voice_leases.user_id=EXCLUDED.user_id RETURNING lease_id,expires_at,user_id",
      [request.params.gameId,playerId,leaseId]
    );
    if(!result.rowCount){
      const occupied=await pool.query("SELECT u.username FROM chess_voice_leases l JOIN chess_games g ON g.room_id=l.room_id JOIN users u ON u.id=l.user_id WHERE g.id=$1 AND l.expires_at>NOW()",[request.params.gameId]);
      return reply.code(409).send({granted:false,reason:"occupied",speakingUsername:occupied.rows[0]?.username??null});
    }
    return {granted:true,leaseId:result.rows[0].lease_id,expiresAt:result.rows[0].expires_at};
  });

  app.post<{Params:{gameId:string};Body:{leaseId:string}}>("/chess/games/:gameId/voice/release",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const result=await pool.query("DELETE FROM chess_voice_leases l USING chess_games g WHERE g.id=$1 AND l.room_id=g.room_id AND l.user_id=$2 AND l.lease_id=$3 RETURNING l.room_id",
      [request.params.gameId,playerId,request.body?.leaseId]);
    return {released:Boolean(result.rowCount)};
  });

  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/voice/disable",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const room=await client.query("SELECT r.id,r.host_user_id,r.settings_snapshot FROM chess_rooms r JOIN chess_games g ON g.room_id=r.id AND g.status='active' WHERE g.id=$1 FOR UPDATE OF r",[request.params.gameId]);
      if(!room.rowCount||String(room.rows[0].host_user_id)!==actor){await client.query("ROLLBACK");return fail(reply,403,"host_only");}
      const settings={...(room.rows[0].settings_snapshot??{}),voiceEnabled:false};
      await client.query("UPDATE chess_rooms SET settings_snapshot=$2::jsonb WHERE id=$1",[room.rows[0].id,JSON.stringify(settings)]);
      await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[room.rows[0].id]);
      await client.query("COMMIT");
      try{await publishGameEvent(pool,request.params.gameId,{type:"voice_settings"});}catch(error){request.log.warn({err:error},"voice disable notification failed");}
      return {voiceEnabled:false};
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"voice_disable_failed");}
    finally{client.release();}
  });

  app.delete<{Params:{id:string}}>("/chess/admin/time-controls/:id",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    if(!await options.canManageSettings(actor))return fail(reply,403,"forbidden");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const before=await client.query("SELECT id,display_name,base_ms,increment_ms,enabled FROM chess_time_controls WHERE id=$1 FOR UPDATE",[request.params.id]);
      if(!before.rowCount){await client.query("ROLLBACK");return fail(reply,404,"time_control_not_found");}
      const referenced=await client.query("SELECT 1 FROM chess_rooms WHERE time_control_id=$1 LIMIT 1",[request.params.id]);
      if(referenced.rowCount){
        const disabled=await client.query("UPDATE chess_time_controls SET enabled=false,updated_at=NOW() WHERE id=$1 RETURNING id,display_name,base_ms,increment_ms,enabled",[request.params.id]);
        await client.query(
          "INSERT INTO chess_admin_audit_events(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'time_control_disable','time_control',$2,$3::jsonb,$4::jsonb)",
          [actor,request.params.id,JSON.stringify(before.rows[0]),JSON.stringify(disabled.rows[0])]
        );
        await client.query("COMMIT");
        return {deleted:false,disabled:true,id:request.params.id};
      }
      await client.query("DELETE FROM chess_time_controls WHERE id=$1",[request.params.id]);
      await client.query(
        "INSERT INTO chess_admin_audit_events(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'time_control_delete','time_control',$2,$3::jsonb,NULL)",
        [actor,request.params.id,JSON.stringify(before.rows[0])]
      );
      await client.query("COMMIT");
      return {deleted:true,id:request.params.id};
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"time_control_delete_failed");}
    finally{client.release();}
  });

  app.get<{Params:{gameId:string};Querystring:{afterId?:string}}>("/chess/games/:gameId/chat",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const afterId=request.query.afterId??"0";
    if(!/^[0-9]{1,20}$/.test(afterId))return fail(reply,400,"invalid_chat_cursor");
    const membership=await pool.query(
      "SELECT 1 FROM chess_games WHERE id=$1 AND (white_user_id=$2 OR black_user_id=$2)",
      [request.params.gameId,playerId]
    );
    if(!membership.rowCount)return fail(reply,404,"game_not_found");
    const result=await pool.query(
      "SELECT c.id,c.message,c.created_at,u.username FROM chess_chat_messages c JOIN users u ON u.id=c.user_id JOIN chess_games g ON g.id=c.game_id WHERE g.id=$1 AND (g.white_user_id=$2 OR g.black_user_id=$2) AND c.id>$3 ORDER BY c.id ASC LIMIT 100",
      [request.params.gameId,playerId,afterId]
    );
    return {messages:result.rows.map(row=>({id:String(row.id),username:row.username,message:row.message,createdAt:row.created_at}))};
  });

  app.get<{Params:{gameId:string}}>("/chess/games/:gameId/draw-offers",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const game=await pool.query(
      "SELECT id FROM chess_games WHERE id=$1 AND (white_user_id=$2 OR black_user_id=$2)",
      [request.params.gameId,playerId]
    );
    if(!game.rowCount)return fail(reply,404,"game_not_found");
    const pending=await pool.query(
      "SELECT id,offered_by,created_at,expires_at FROM chess_draw_offers WHERE game_id=$1 AND status='pending' AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1",
      [request.params.gameId]
    );
    if(!pending.rowCount)return {pending:false};
    return {pending:true,offerId:String(pending.rows[0].id),offeredByMe:String(pending.rows[0].offered_by)===playerId,createdAt:pending.rows[0].created_at};
  });

  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/draw-offers",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const game=await client.query("SELECT id,room_id,white_user_id,black_user_id,status,settings_snapshot,clock_snapshot FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=game.rows[0];
      if(!row||row.status!=="active"){await client.query("ROLLBACK");return fail(reply,404,"active_game_not_found");}
      if(playerId!==String(row.white_user_id)&&playerId!==String(row.black_user_id)){await client.query("ROLLBACK");return fail(reply,403,"not_a_player");}
      const control=(row.settings_snapshot as {timeControl:TimeControl}).timeControl;
      const clock=row.clock_snapshot as ClockSnapshot;
      const elapsed=settleClock(clock,control,Date.now(),false);
      if(elapsed.finished){
        const white=String(row.white_user_id),black=String(row.black_user_id);
        const winner=clock.active==="white"?black:white;
        const terminal=winner===white?"white_win":"black_win";
        await client.query("UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,terminal,JSON.stringify({...elapsed,active:null,lastStartedAt:null,finished:true})]);
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});
        await client.query("COMMIT");
        return fail(reply,409,"clock_expired");
      }
      const pending=await client.query("SELECT id FROM chess_draw_offers WHERE game_id=$1 AND status='pending'",[row.id]);
      if(pending.rowCount){await client.query("ROLLBACK");return fail(reply,409,"draw_offer_pending");}
      const offer=await client.query("INSERT INTO chess_draw_offers(game_id,offered_by) VALUES($1,$2) RETURNING id,created_at,expires_at",[row.id,playerId]);
      await client.query("COMMIT");
      try{await publishGameEvent(pool,row.id,{type:"draw_offer",offerId:String(offer.rows[0].id),offeredBy:playerId});}catch(error){request.log.warn({err:error},"chess draw offer notification failed");}
      return reply.code(201).send({offerId:String(offer.rows[0].id),status:"pending",createdAt:offer.rows[0].created_at,expiresAt:offer.rows[0].expires_at});
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"draw_offer_failed");}
    finally{client.release();}
  });

  app.post<{Params:{gameId:string;offerId:string};Body:{accept:boolean}}>("/chess/games/:gameId/draw-offers/:offerId/respond",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    if(typeof request.body?.accept!=="boolean")return fail(reply,400,"invalid_draw_response");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const game=await client.query("SELECT * FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=game.rows[0];
      if(!row||row.status!=="active"){await client.query("ROLLBACK");return fail(reply,404,"active_game_not_found");}
      const white=String(row.white_user_id),black=String(row.black_user_id);
      if(playerId!==white&&playerId!==black){await client.query("ROLLBACK");return fail(reply,403,"not_a_player");}
      const control=(row.settings_snapshot as {timeControl:TimeControl}).timeControl;
      const clockNow=row.clock_snapshot as ClockSnapshot;
      const elapsed=settleClock(clockNow,control,Date.now(),false);
      if(elapsed.finished){
        const winner=clockNow.active==="white"?black:white;
        const terminal=winner===white?"white_win":"black_win";
        await client.query("UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,terminal,JSON.stringify({...elapsed,active:null,lastStartedAt:null,finished:true})]);
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});
        await client.query("COMMIT");
        return fail(reply,409,"clock_expired");
      }
      const offer=await client.query("SELECT * FROM chess_draw_offers WHERE id=$1 AND game_id=$2 AND status='pending' AND expires_at>NOW() FOR UPDATE",[request.params.offerId,row.id]);
      if(!offer.rowCount||String(offer.rows[0].offered_by)===playerId){await client.query("ROLLBACK");return fail(reply,409,"draw_offer_unavailable");}
      if(request.body?.accept===true){
        const clock={...(row.clock_snapshot as ClockSnapshot),active:null,lastStartedAt:null,finished:true};
        await client.query("UPDATE chess_draw_offers SET status='accepted',responded_by=$2,responded_at=NOW() WHERE id=$1",[offer.rows[0].id,playerId]);
        await client.query("UPDATE chess_games SET status='draw',clock_snapshot=$2::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",[row.id,JSON.stringify(clock)]);
        await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
        await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
        await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"draw",winnerId:null,loserId:null});
        await client.query("COMMIT");
        try{
          await publishGameEvent(pool,row.id,{type:"draw_response",offerId:String(offer.rows[0].id),status:"accepted"});
        }catch(error){request.log.warn({err:error},"chess draw acceptance notification failed");}
        return {status:"draw"};
      }
      await client.query("UPDATE chess_draw_offers SET status='declined',responded_by=$2,responded_at=NOW() WHERE id=$1",[offer.rows[0].id,playerId]);
      await client.query("COMMIT");
      try{await publishGameEvent(pool,row.id,{type:"draw_response",offerId:String(offer.rows[0].id),status:"declined"});}catch(error){request.log.warn({err:error},"chess draw response notification failed");}
      return {status:"declined"};
    }catch(error){await rollback(client);request.log.error(error);return fail(reply,500,"draw_response_failed");}
    finally{client.release();}
  });

  app.post<{Params:{gameId:string};Body:{leaseId:string}}>("/chess/games/:gameId/voice/renew",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const renewed=await pool.query(
      "UPDATE chess_voice_leases l SET expires_at=NOW()+INTERVAL '8 seconds' FROM chess_games g JOIN chess_rooms r ON r.id=g.room_id WHERE g.id=$1 AND g.status='active' AND COALESCE((r.settings_snapshot->>'voiceEnabled')::boolean,false)=true AND g.room_id=l.room_id AND l.user_id=$2 AND l.lease_id=$3 AND l.expires_at>NOW() RETURNING l.expires_at",
      [request.params.gameId,playerId,request.body?.leaseId]
    );
    if(!renewed.rowCount)return fail(reply,409,"voice_lease_expired");
    return {renewed:true,expiresAt:renewed.rows[0].expires_at};
  });

  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/voice/enable",{preHandler:options.authenticate},async(request,reply)=>{
    let actor:string;
    try{actor=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const changed=await pool.query(
      "UPDATE chess_rooms r SET settings_snapshot=jsonb_set(COALESCE(r.settings_snapshot,'{}'::jsonb),'{voiceEnabled}','true'::jsonb) FROM chess_games g WHERE g.id=$1 AND g.status='active' AND g.room_id=r.id AND r.host_user_id=$2 RETURNING r.id",
      [request.params.gameId,actor]
    );
    if(!changed.rowCount)return fail(reply,403,"host_only");
    try{await publishGameEvent(pool,request.params.gameId,{type:"voice_settings"});}catch(error){request.log.warn({err:error},"voice enable notification failed");}
    return {voiceEnabled:true};
  });


  // Any authenticated participant may ask the server to adjudicate an expired clock.
  // The row lock makes simultaneous claims idempotent across API instances.
  app.post<{Params:{gameId:string}}>("/chess/games/:gameId/clock/claim-timeout",{preHandler:options.authenticate},async(request,reply)=>{
    let claimant:string;
    try{claimant=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query("SELECT * FROM chess_games WHERE id=$1 FOR UPDATE",[request.params.gameId]);
      const row=result.rows[0];
      if(!row){await client.query("ROLLBACK");return fail(reply,404,"game_not_found");}
      const white=String(row.white_user_id),black=String(row.black_user_id);
      if(claimant!==white&&claimant!==black){await client.query("ROLLBACK");return fail(reply,403,"not_a_player");}
      if(row.status!=="active"){await client.query("COMMIT");return {adjudicated:false,status:row.status};}
      const settings=row.settings_snapshot as {timeControl:TimeControl};
      const clock=row.clock_snapshot as ClockSnapshot;
      if(clock.finished||clock.active===null||clock.lastStartedAt===null){
        await client.query("COMMIT");
        return {adjudicated:false,status:row.status,clock};
      }
      const settled=settleClock(clock,settings.timeControl,Date.now(),false);
      if(!settled.finished){
        await client.query("COMMIT");
        return {adjudicated:false,status:"active",clock:settled};
      }
      const winner=clock.active==="white"?black:white;
      const terminal=winner===white?"white_win":"black_win";
      const frozen={...settled,active:null,lastStartedAt:null,finished:true};
      await client.query(
        "UPDATE chess_games SET status=$2,clock_snapshot=$3::jsonb,finished_at=NOW(),revision=revision+1 WHERE id=$1",
        [row.id,terminal,JSON.stringify(frozen)]
      );
      await client.query("UPDATE chess_rooms SET status='finished' WHERE id=$1",[row.room_id]);
      await client.query("DELETE FROM chess_voice_leases WHERE room_id=$1",[row.room_id]);
      await awardChessResult(client,String(row.id),"final_result",white,black,{outcome:"win",winnerId:winner,loserId:winner===white?black:white});
      await client.query("COMMIT");
      return {adjudicated:true,status:terminal,winnerId:winner,clock:frozen};
    }catch(error){
      await rollback(client);
      request.log.error(error);
      return fail(reply,500,"clock_timeout_adjudication_failed");
    }finally{client.release();}
  });


  app.post<{Body:{timeControlId?:string;minOpponentLevel?:number}}>("/chess/matchmaking/join",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const timeControlId=request.body?.timeControlId??"rapid";
    const minOpponentLevel=request.body?.minOpponentLevel??1;
    if(!/^[a-zA-Z0-9_-]{1,40}$/.test(timeControlId)||!Number.isSafeInteger(minOpponentLevel)||minOpponentLevel<1||minOpponentLevel>10000)
      return fail(reply,400,"invalid_matchmaking_settings");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      // Serialize matching decisions across API instances; row locks still protect queue records.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_matchmaking'))");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('royal_chess_player'),hashtext($1))",[playerId]);
      const activeGame=await client.query("SELECT id FROM chess_games WHERE status='active' AND (white_user_id=$1 OR black_user_id=$1) LIMIT 1",[playerId]);
      if(activeGame.rowCount){await client.query("ROLLBACK");return fail(reply,409,"active_chess_game_exists");}
      const waitingRoom=await client.query(
        "SELECT id FROM chess_rooms WHERE host_user_id=$1 AND status='waiting' AND expires_at>NOW() LIMIT 1",
        [playerId]
      );
      if(waitingRoom.rowCount){await client.query("ROLLBACK");return fail(reply,409,"waiting_room_already_exists");}
      const ownLevelResult=await client.query("SELECT level FROM chess_player_progression WHERE user_id=$1",[playerId]);
      const ownLevel=Number(ownLevelResult.rows[0]?.level??1);
      if(ownLevel<minOpponentLevel){await client.query("ROLLBACK");return fail(reply,403,"minimum_chess_level_required");}
      const controlResult=await client.query("SELECT id,display_name,base_ms,increment_ms,enabled FROM chess_time_controls WHERE id=$1 AND enabled=true",[timeControlId]);
      const controlRow=controlResult.rows[0];
      if(!controlRow){await client.query("ROLLBACK");return fail(reply,400,"time_control_unavailable");}
      const opponentResult=await client.query(
        `SELECT q.user_id,q.min_opponent_level,COALESCE(p.level,1) AS level,u.username
         FROM chess_matchmaking_queue q
         LEFT JOIN chess_player_progression p ON p.user_id=q.user_id
         JOIN users u ON u.id=q.user_id
         WHERE q.time_control_id=$1 AND q.user_id<>$2
           AND COALESCE(p.level,1)>=$3 AND $4>=q.min_opponent_level
           AND NOT EXISTS (
             SELECT 1 FROM chess_games active
             WHERE active.status='active'
               AND (active.white_user_id=q.user_id OR active.black_user_id=q.user_id)
           )
         ORDER BY q.created_at,q.user_id FOR UPDATE OF q SKIP LOCKED LIMIT 1`,
        [timeControlId,playerId,minOpponentLevel,ownLevel]
      );
      if(!opponentResult.rowCount){
        await client.query(
          `INSERT INTO chess_matchmaking_queue(user_id,time_control_id,min_opponent_level)
           VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET time_control_id=EXCLUDED.time_control_id,
           min_opponent_level=EXCLUDED.min_opponent_level,created_at=NOW()`,
          [playerId,timeControlId,minOpponentLevel]
        );
        await client.query("COMMIT");
        return reply.code(202).send({status:"waiting",timeControlId,minOpponentLevel});
      }
      const opponentId=String(opponentResult.rows[0].user_id);
      const roomCode=randomBytes(5).toString("hex").toUpperCase();
      const settings={minOpponentLevel:Math.max(minOpponentLevel,Number(opponentResult.rows[0].min_opponent_level)),
        timeControlId,chatEnabled:true,voiceEnabled:false,
        timeControl:{id:controlRow.id,name:controlRow.id,baseMs:Number(controlRow.base_ms),
          incrementMs:Number(controlRow.increment_ms),enabled:controlRow.enabled}};
      const room=await client.query(
        `INSERT INTO chess_rooms(room_code,host_user_id,min_opponent_level,time_control_id,settings_snapshot,status)
         VALUES($1,$2,$3,$4,$5::jsonb,'active') RETURNING id,room_code`,
        [roomCode,opponentId,settings.minOpponentLevel,timeControlId,JSON.stringify(settings)]
      );
      const control:TimeControl={id:controlRow.id,name:controlRow.id,baseMs:Number(controlRow.base_ms),
        incrementMs:Number(controlRow.increment_ms),enabled:controlRow.enabled};
      const now=Date.now();
      const clock=startClock(snapshotClock(control,now),"white",now);
      const game=await client.query(
        `INSERT INTO chess_games(room_id,white_user_id,black_user_id,initial_fen,current_fen,pgn,clock_snapshot,settings_snapshot)
         VALUES($1,$2,$3,$4,$4,'',$5::jsonb,$6::jsonb) RETURNING id`,
        [room.rows[0].id,opponentId,playerId,initialFen,JSON.stringify(clock),JSON.stringify(settings)]
      );
      await client.query("DELETE FROM chess_matchmaking_queue WHERE user_id=ANY($1::bigint[])",[[playerId,opponentId]]);
      const ownProfile=await client.query("SELECT username FROM users WHERE id=$1",[playerId]);
      await client.query("COMMIT");
      return reply.code(201).send({status:"matched",gameId:String(game.rows[0].id),roomCode:room.rows[0].room_code,
        whiteUsername:opponentResult.rows[0].username,blackUsername:ownProfile.rows[0]?.username??"",
        fen:initialFen,clock,settings});
    }catch(error){
      await rollback(client);
      request.log.error(error);
      return fail(reply,500,"matchmaking_failed");
    }finally{client.release();}
  });

  app.get("/chess/matchmaking/status",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const active=await pool.query(
      `SELECT g.id,g.status,g.current_fen,g.clock_snapshot,g.settings_snapshot,
              CASE WHEN g.white_user_id=$1 THEN bu.username ELSE wu.username END AS opponent_username
       FROM chess_games g
       JOIN users wu ON wu.id=g.white_user_id JOIN users bu ON bu.id=g.black_user_id
       WHERE g.status='active' AND (g.white_user_id=$1 OR g.black_user_id=$1)
       ORDER BY g.started_at DESC LIMIT 1`,
      [playerId]
    );
    if(active.rowCount){
      const row=active.rows[0];
      return {status:"matched",gameId:String(row.id),fen:row.current_fen,clock:row.clock_snapshot,
        settings:row.settings_snapshot,opponentUsername:row.opponent_username};
    }
    const queued=await pool.query(
      "SELECT time_control_id,min_opponent_level,created_at FROM chess_matchmaking_queue WHERE user_id=$1",
      [playerId]
    );
    return queued.rowCount
      ? {status:"waiting",timeControlId:queued.rows[0].time_control_id,minOpponentLevel:Number(queued.rows[0].min_opponent_level),createdAt:queued.rows[0].created_at}
      : {status:"idle"};
  });

  app.delete("/chess/matchmaking/queue",{preHandler:options.authenticate},async(request,reply)=>{
    let playerId:string;
    try{playerId=userId(request,options);}catch{return fail(reply,401,"unauthorized");}
    const removed=await pool.query("DELETE FROM chess_matchmaking_queue WHERE user_id=$1 RETURNING user_id",[playerId]);
    return {cancelled:Boolean(removed.rowCount)};
  });

}
