import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { Pool } from "pg";
import type { FastifyRequest } from "fastify";
import { registerChessRoutes } from "./routes.js";
import { awardChessResult } from "./progression-store.js";
import { adjudicateExpiredChessClocks, expirePendingChessDrawOffers } from "./clock-scheduler.js";

const databaseUrl = process.env.CHESS_TEST_DATABASE_URL;
const migrationFiles = [
  "001_chess_core.sql",
  "002_realtime_notifications.sql",
  "003_draws_and_ratings.sql",
  "004_matchmaking_queue.sql",
  "005_room_lifecycle.sql",
  "006_admin_audit.sql",
  "007_chat_rate_limit_index.sql",
  "008_cancel_draws_on_terminal.sql",
  "009_draw_offer_expiry.sql",
      "010_presence_sessions.sql",
];

test("authenticated chess routes support private game, draw, chat, profiles and admin audit", { skip: !databaseUrl }, async () => {
  const schema = `chess_routes_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });
  const app = Fastify();
  const appTwo = Fastify();

  try {
    await pool.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE
      )
    `);
    for (const file of migrationFiles) {
      const sql = await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8");
      await pool.query(sql);
    }

    const users = await pool.query(
      "INSERT INTO users(username) VALUES ('route_white'),('route_black'),('queue_one'),('queue_two'),('queue_cancel'),('concurrent_room_host'),('race_room_host'),('race_guest_one'),('race_guest_two'),('claim_white'),('claim_black'),('claim_timeout_white'),('claim_timeout_black') RETURNING id,username"
    );
    const ids = users.rows.map(row => String(row.id));
    const white = ids[0]!;
    const black = ids[1]!;
    const queueOne = ids[2]!;
    const queueTwo = ids[3]!;
    const queueCancel = ids[4]!;
    const concurrentRoomHost = ids[5]!;
    const claimWhite = ids[9]!;
    const claimBlack = ids[10]!;
    const claimTimeoutWhite = ids[11]!;
    const claimTimeoutBlack = ids[12]!;

    await registerChessRoutes(app, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async (userId: string) => userId === white,
    });
    await app.ready();
    // A second Fastify process shares only PostgreSQL, matching a multi-instance deployment.
    await registerChessRoutes(appTwo, {
      pool,
      authenticate: async (_request: FastifyRequest) => {},
      getUserId: (request: FastifyRequest) => String(request.headers["x-user-id"] ?? ""),
      canManageSettings: async (userId: string) => userId === white,
    });
    await appTwo.ready();

    type TestResponse = { statusCode: number; body: string; json: () => any };
    const request = async (
      userId: string,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      payload?: unknown,
      server: typeof app | typeof appTwo = app,
    ): Promise<TestResponse> => await (server.inject({
      method,
      url,
      headers: { "x-user-id": userId },
      ...(payload === undefined ? {} : { payload }),
    } as never) as unknown as Promise<TestResponse>);

    const concurrentRoomAttempts = await Promise.all([
      request(concurrentRoomHost, "POST", "/chess/rooms", {
        timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
      }, app),
      request(concurrentRoomHost, "POST", "/chess/rooms", {
        timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
      }, appTwo),
    ]);
    assert.deepEqual(concurrentRoomAttempts.map(response => response.statusCode).sort(), [201, 409]);
    const concurrentRoomWinner = concurrentRoomAttempts.find(response => response.statusCode === 201)!;
    const concurrentRoomCleanup = await request(concurrentRoomHost, "DELETE",
      `/chess/rooms/${concurrentRoomWinner.json().roomCode}`);
    assert.equal(concurrentRoomCleanup.statusCode, 200, concurrentRoomCleanup.body);

    // Two different guests race to claim one room through separate Fastify instances.
    const raceRoomHost = ids[6]!;
    const raceGuestOne = ids[7]!;
    const raceGuestTwo = ids[8]!;
    const joinRaceRoom = await request(raceRoomHost, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(joinRaceRoom.statusCode, 201, joinRaceRoom.body);
    const joinRaceCode = joinRaceRoom.json().roomCode as string;
    const racingJoins = await Promise.all([
      request(raceGuestOne, "POST", `/chess/rooms/${joinRaceCode}/join`, undefined, app),
      request(raceGuestTwo, "POST", `/chess/rooms/${joinRaceCode}/join`, undefined, appTwo),
    ]);
    assert.deepEqual(racingJoins.map(response => response.statusCode).sort(), [201, 404]);
    const joinedRaceGameId = racingJoins.find(response => response.statusCode === 201)!.json().gameId as string;
    const raceGamePlayers = await pool.query(
      "SELECT white_user_id,black_user_id,status FROM chess_games WHERE id=$1",
      [joinedRaceGameId],
    );
    assert.equal(raceGamePlayers.rowCount, 1);
    assert.equal(raceGamePlayers.rows[0].status, "active");
    assert.ok([raceGuestOne, raceGuestTwo].includes(String(raceGamePlayers.rows[0].black_user_id)));

    // Concurrent moves from the same side must serialize; only the first legal move commits.
    const competingMoves = await Promise.all([
      request(raceRoomHost, "POST", `/chess/games/${joinedRaceGameId}/moves`, { from: "e2", to: "e4" }, app),
      request(raceRoomHost, "POST", `/chess/games/${joinedRaceGameId}/moves`, { from: "d2", to: "d4" }, appTwo),
    ]);
    assert.deepEqual(competingMoves.map(response => response.statusCode).sort(), [200, 403]);
    const raceMoveCount = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_moves WHERE game_id=$1",
      [joinedRaceGameId],
    );
    assert.equal(raceMoveCount.rows[0].count, 1);

    const levelGateRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid",
      minOpponentLevel: 3,
      chatEnabled: true,
          });
    assert.equal(levelGateRoom.statusCode, 201, levelGateRoom.body);
    const underLevel = await request(black, "POST", `/chess/rooms/${levelGateRoom.json().roomCode}/join`);
    assert.equal(underLevel.statusCode, 403, underLevel.body);
    const cancelLevelGateRoom = await request(white, "DELETE", `/chess/rooms/${levelGateRoom.json().roomCode}`);
    assert.equal(cancelLevelGateRoom.statusCode, 200, cancelLevelGateRoom.body);

    const created = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid",
      minOpponentLevel: 1,
      chatEnabled: true,
          });
    assert.equal(created.statusCode, 201, created.body);
    const roomCode = created.json().roomCode as string;
    const duplicateRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(duplicateRoom.statusCode, 409);

    const selfJoin = await request(white, "POST", `/chess/rooms/${roomCode}/join`);
    assert.equal(selfJoin.statusCode, 400);
    const joined = await request(black, "POST", `/chess/rooms/${roomCode}/join`);
    assert.equal(joined.statusCode, 201, joined.body);
    const configuredTimeControl = await pool.query("SELECT display_name FROM chess_time_controls WHERE id='rapid'");
    assert.equal(joined.json().settings.timeControl.name, configuredTimeControl.rows[0].display_name);
    const gameId = joined.json().gameId as string;

    const whiteGame = await request(white, "GET", `/chess/games/${gameId}`);
    assert.equal(whiteGame.statusCode, 200, whiteGame.body);
    assert.equal(whiteGame.json().isHost, true);
    assert.ok(whiteGame.json().legalMoves.includes("e2e4"));
    assert.equal(whiteGame.json().players.white.username, "route_white");

    const offer = await request(white, "POST", `/chess/games/${gameId}/draw-offers`);
    assert.equal(offer.statusCode, 201, offer.body);
    const pending = await request(black, "GET", `/chess/games/${gameId}/draw-offers`);
    assert.equal(pending.json().pending, true);
    assert.equal(pending.json().offeredByMe, false);
    const malformedDrawResponse = await request(black, "POST",
      `/chess/games/${gameId}/draw-offers/${offer.json().offerId}/respond`, {});
    assert.equal(malformedDrawResponse.statusCode, 400);
    assert.equal(malformedDrawResponse.json().error, "invalid_draw_response");
    const stillPending = await request(black, "GET", `/chess/games/${gameId}/draw-offers`);
    assert.equal(stillPending.json().pending, true);
    const declined = await request(black, "POST",
      `/chess/games/${gameId}/draw-offers/${offer.json().offerId}/respond`, { accept: false });
    assert.equal(declined.statusCode, 200, declined.body);
    assert.equal(declined.json().status, "declined");

    const claimRoom = await request(claimWhite, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(claimRoom.statusCode, 201, claimRoom.body);
    const claimJoin = await request(claimBlack, "POST", `/chess/rooms/${claimRoom.json().roomCode}/join`);
    assert.equal(claimJoin.statusCode, 201, claimJoin.body);
    const claimGameId = claimJoin.json().gameId as string;
    const prematureClaim = await request(claimWhite, "POST", `/chess/games/${claimGameId}/claim-draw`);
    assert.equal(prematureClaim.statusCode, 409);
    assert.equal(prematureClaim.json().error, "draw_not_claimable");
    const claimableFen = "4k3/8/8/8/8/8/8/R3K3 w - - 100 1";
    await pool.query(
      "UPDATE chess_games SET initial_fen=$2,current_fen=$2,pgn='' WHERE id=$1",
      [claimGameId, claimableFen],
    );
    const claimSnapshot = await request(claimWhite, "GET", `/chess/games/${claimGameId}`);
    assert.equal(claimSnapshot.json().drawClaimable, true);
    assert.equal(claimSnapshot.json().drawClaimReason, "fifty_move_rule");
    const wrongTurnClaim = await request(claimBlack, "POST", `/chess/games/${claimGameId}/claim-draw`);
    assert.equal(wrongTurnClaim.statusCode, 403);
    assert.equal(wrongTurnClaim.json().error, "not_your_turn");
    const nonPlayerClaim = await request(queueOne, "POST", `/chess/games/${claimGameId}/claim-draw`);
    assert.equal(nonPlayerClaim.statusCode, 403);
    assert.equal(nonPlayerClaim.json().error, "not_a_player");
    const pendingClaimOffer = await request(claimBlack, "POST", `/chess/games/${claimGameId}/draw-offers`);
    assert.equal(pendingClaimOffer.statusCode, 201, pendingClaimOffer.body);
    const competingClaims = await Promise.all([
      request(claimWhite, "POST", `/chess/games/${claimGameId}/claim-draw`, undefined, app),
      request(claimWhite, "POST", `/chess/games/${claimGameId}/claim-draw`, undefined, appTwo),
    ]);
    assert.deepEqual(competingClaims.map(response => response.statusCode).sort(), [200, 404]);
    const claimedDraw = competingClaims.find(response => response.statusCode === 200)!;
    assert.deepEqual(claimedDraw.json(), {status:"draw",reason:"fifty_move_rule"});
    const cancelledClaimOffer = await pool.query(
      "SELECT status FROM chess_draw_offers WHERE id=$1",
      [pendingClaimOffer.json().offerId],
    );
    assert.equal(cancelledClaimOffer.rows[0].status, "cancelled");
    const claimAwards = await pool.query(
      "SELECT user_id,xp_delta FROM chess_progression_events WHERE game_id=$1 AND event_key='final_result' ORDER BY user_id",
      [claimGameId],
    );
    assert.deepEqual(claimAwards.rows.map(row => Number(row.xp_delta)), [5, 5]);
    const claimedGame = await pool.query(
      "SELECT status,clock_snapshot->>'finished' AS finished FROM chess_games WHERE id=$1",
      [claimGameId],
    );
    assert.equal(claimedGame.rows[0].status, "draw");
    assert.equal(claimedGame.rows[0].finished, "true");
    const repeatedClaim = await request(claimWhite, "POST", `/chess/games/${claimGameId}/claim-draw`);
    assert.equal(repeatedClaim.statusCode, 404);

    const prospectiveRoom = await request(claimWhite, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(prospectiveRoom.statusCode, 201, prospectiveRoom.body);
    const prospectiveJoin = await request(claimBlack, "POST", `/chess/rooms/${prospectiveRoom.json().roomCode}/join`);
    assert.equal(prospectiveJoin.statusCode, 201, prospectiveJoin.body);
    const prospectiveGameId = prospectiveJoin.json().gameId as string;
    const prospectiveFen = "4k3/8/8/8/8/8/8/R3K3 w - - 99 1";
    await pool.query(
      "UPDATE chess_games SET initial_fen=$2,current_fen=$2,pgn='' WHERE id=$1",
      [prospectiveGameId, prospectiveFen],
    );
    const invalidProspectiveClaim = await request(claimWhite, "POST", `/chess/games/${prospectiveGameId}/claim-draw`, {
      move: {from:"a1",to:"a1"},
    });
    assert.equal(invalidProspectiveClaim.statusCode, 400);
    assert.equal(invalidProspectiveClaim.json().error, "invalid_claim_move");
    const prospectiveClaim = await request(claimWhite, "POST", `/chess/games/${prospectiveGameId}/claim-draw`, {
      move: {from:"a1",to:"a2"},
    });
    assert.equal(prospectiveClaim.statusCode, 200, prospectiveClaim.body);
    assert.deepEqual(prospectiveClaim.json(), {status:"draw",reason:"fifty_move_rule"});
    const prospectiveStored = await pool.query(
      "SELECT current_fen,status,(SELECT COUNT(*)::int FROM chess_moves WHERE game_id=$1) AS moves FROM chess_games WHERE id=$1",
      [prospectiveGameId],
    );
    assert.equal(prospectiveStored.rows[0].current_fen, prospectiveFen);
    assert.equal(prospectiveStored.rows[0].status, "draw");
    assert.equal(prospectiveStored.rows[0].moves, 0);

    const repetitionRoom = await request(claimWhite, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(repetitionRoom.statusCode, 201, repetitionRoom.body);
    const repetitionJoin = await request(claimBlack, "POST", `/chess/rooms/${repetitionRoom.json().roomCode}/join`);
    assert.equal(repetitionJoin.statusCode, 201, repetitionJoin.body);
    const repetitionGameId = repetitionJoin.json().gameId as string;
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [player, from, to] of [
        [claimWhite, "g1", "f3"],
        [claimBlack, "g8", "f6"],
        [claimWhite, "f3", "g1"],
        [claimBlack, "f6", "g8"],
      ] as const) {
        const moved = await request(player, "POST", `/chess/games/${repetitionGameId}/moves`, {from,to});
        assert.equal(moved.statusCode, 200, moved.body);
      }
    }
    const repetitionSnapshot = await request(claimWhite, "GET", `/chess/games/${repetitionGameId}`);
    assert.equal(repetitionSnapshot.json().drawClaimable, true);
    assert.equal(repetitionSnapshot.json().drawClaimReason, "threefold_repetition");
    const repetitionClaim = await request(claimWhite, "POST", `/chess/games/${repetitionGameId}/claim-draw`);
    assert.equal(repetitionClaim.statusCode, 200, repetitionClaim.body);
    assert.deepEqual(repetitionClaim.json(), {status:"draw",reason:"threefold_repetition"});

    const claimTimeoutRoom = await request(claimTimeoutWhite, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(claimTimeoutRoom.statusCode, 201, claimTimeoutRoom.body);
    const claimTimeoutJoin = await request(claimTimeoutBlack, "POST", `/chess/rooms/${claimTimeoutRoom.json().roomCode}/join`);
    assert.equal(claimTimeoutJoin.statusCode, 201, claimTimeoutJoin.body);
    const claimTimeoutGameId = claimTimeoutJoin.json().gameId as string;
    const claimTimeoutFen = "4k3/8/8/8/8/8/8/R3K3 w - - 100 1";
    const claimTimeoutNow = Date.now();
    await pool.query(
      "UPDATE chess_games SET initial_fen=$2,current_fen=$2,pgn='',clock_snapshot=jsonb_set(jsonb_set(clock_snapshot,'{whiteMs}','1'::jsonb),'{lastStartedAt}',to_jsonb($3::bigint)) WHERE id=$1",
      [claimTimeoutGameId, claimTimeoutFen, claimTimeoutNow - 5000],
    );
    const timeoutListener = await pool.connect();
    const timeoutChannel = "chess_game_" + claimTimeoutGameId;
    let timeoutNotification: string | null = null;
    await timeoutListener.query("LISTEN " + timeoutChannel);
    timeoutListener.on("notification", notification => {
      if (notification.channel === timeoutChannel) timeoutNotification = notification.payload ?? null;
    });
    const expiredClockClaim = await request(claimTimeoutWhite, "POST", `/chess/games/${claimTimeoutGameId}/claim-draw`);
    assert.equal(expiredClockClaim.statusCode, 409);
    assert.equal(expiredClockClaim.json().error, "clock_expired");
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(timeoutNotification, "clock expiry must publish a terminal state event");
    assert.equal(JSON.parse(timeoutNotification!).type, "state");
    await timeoutListener.query("UNLISTEN " + timeoutChannel);
    timeoutListener.release();
    const claimTimeoutResult = await pool.query(
      "SELECT status,clock_snapshot->>'finished' AS finished FROM chess_games WHERE id=$1",
      [claimTimeoutGameId],
    );
    assert.equal(claimTimeoutResult.rows[0].status, "black_win");
    assert.equal(claimTimeoutResult.rows[0].finished, "true");
    const claimTimeoutAwards = await pool.query(
      "SELECT xp_delta FROM chess_progression_events WHERE game_id=$1 AND event_key='final_result' ORDER BY user_id",
      [claimTimeoutGameId],
    );
    assert.deepEqual(claimTimeoutAwards.rows.map(row => Number(row.xp_delta)), [5, 20]);

    const malformedChat = await request(white, "POST", `/chess/games/${gameId}/chat`, { message: { text: "not a string" } });
    assert.equal(malformedChat.statusCode, 400);
    assert.equal(malformedChat.json().error, "invalid_message");
    const chat = await request(white, "POST", `/chess/games/${gameId}/chat`, { message: "hello chess" });
    assert.equal(chat.statusCode, 201, chat.body);
    const history = await request(black, "GET", `/chess/games/${gameId}/chat`);
    assert.equal(history.json().messages[0].message, "hello chess");
    assert.equal(history.json().messages[0].username, "route_white");
    for (let index = 0; index < 7; index++) {
      const allowed = await request(white, "POST", `/chess/games/${gameId}/chat`, {message:`rate test ${index}`});
      assert.equal(allowed.statusCode, 201, allowed.body);
    }
    const rateLimited = await request(white, "POST", `/chess/games/${gameId}/chat`, {message:"rate limit overflow"});
    assert.equal(rateLimited.statusCode, 429);
    assert.equal(rateLimited.json().error, "chat_rate_limited");
    const otherPlayerUnaffected = await request(black, "POST", `/chess/games/${gameId}/chat`, {message:"independent player"});
    assert.equal(otherPlayerUnaffected.statusCode, 201, otherPlayerUnaffected.body);

    const moveWhite = await request(white, "POST", `/chess/games/${gameId}/moves`, { from: "e2", to: "e4" });
    assert.equal(moveWhite.statusCode, 200, moveWhite.body);
    const moveBlack = await request(black, "POST", `/chess/games/${gameId}/moves`, { from: "e7", to: "e5" });
    assert.equal(moveBlack.statusCode, 200, moveBlack.body);
    const historyMoves = await request(white, "GET", `/chess/games/${gameId}/history?afterPly=0`);
    assert.equal(historyMoves.json().moves.length, 2);

    const profile = await request(black, "GET", "/chess/players/username/route_white/profile");
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json().username, "route_white");
    assert.equal("fullName" in profile.json(), false);
    assert.equal("phone" in profile.json(), false);
    assert.equal("email" in profile.json(), false);
    assert.equal("id" in profile.json(), false);
    const privateGame = await request(queueCancel, "GET", `/chess/games/${gameId}`);
    assert.equal(privateGame.statusCode, 404);
    const privateChat = await request(queueCancel, "GET", `/chess/games/${gameId}/chat`);
    assert.equal(privateChat.statusCode, 404);

    const deniedAdmin = await request(black, "PUT", "/chess/admin/time-controls", {
      id: "forbidden", displayName: "Forbidden", baseMs: 180000, incrementMs: 0, enabled: true,
    });
    assert.equal(deniedAdmin.statusCode, 403);
    const savedControl = await request(white, "PUT", "/chess/admin/time-controls", {
      id: "blitz_test",
      displayName: "Test Blitz",
      baseMs: 180000,
      incrementMs: 2000,
      enabled: true,
    });
    assert.equal(savedControl.statusCode, 200, savedControl.body);
    const audit = await request(white, "GET", "/chess/admin/audit");
    assert.ok(audit.json().events.some((event: { action: string }) => event.action === "time_control_upsert"));

    const resigned = await request(white, "POST", `/chess/games/${gameId}/resign`);
    assert.equal(resigned.statusCode, 200, resigned.body);
    assert.equal(resigned.json().status, "black_win");
    const whiteFinishedProfile = await request(black, "GET", "/chess/players/username/route_white/profile");
    assert.equal(whiteFinishedProfile.json().games, 1);
    assert.equal(whiteFinishedProfile.json().losses, 1);
    assert.equal(whiteFinishedProfile.json().winRate, 0);
    assert.deepEqual(whiteFinishedProfile.json().byMode.map((row: {mode:string}) => row.mode), ["rapid"]);
    const blackFinishedProfile = await request(white, "GET", "/chess/players/username/route_black/profile");
    assert.equal(blackFinishedProfile.json().games, 1);
    assert.equal(blackFinishedProfile.json().wins, 1);
    assert.equal(blackFinishedProfile.json().winRate, 100);
    assert.deepEqual(blackFinishedProfile.json().byMode.map((row: {mode:string}) => row.mode), ["rapid"]);

    const progressionBefore = await pool.query(
      "SELECT user_id,xp FROM chess_player_progression WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(progressionBefore.rows.map(row => Number(row.xp)), [0, 20]);
    const ratingBefore = await pool.query(
      "SELECT user_id,rating FROM chess_player_ratings WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(ratingBefore.rows.map(row => Number(row.rating)), [1184, 1216]);
    const idempotencyClient = await pool.connect();
    try {
      await idempotencyClient.query("BEGIN");
      await awardChessResult(idempotencyClient, gameId, "final_result", white, black, {
        outcome: "resignation", winnerId: black, loserId: white,
      });
      await idempotencyClient.query("COMMIT");
    } catch (error) {
      await idempotencyClient.query("ROLLBACK");
      throw error;
    } finally {
      idempotencyClient.release();
    }
    const progressionAfter = await pool.query(
      "SELECT user_id,xp FROM chess_player_progression WHERE user_id=ANY($1::bigint[]) ORDER BY user_id",
      [[white, black]],
    );
    assert.deepEqual(progressionAfter.rows.map(row => Number(row.xp)), [0, 20]);

    const timeoutRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    const timeoutJoin = await request(black, "POST", `/chess/rooms/${timeoutRoom.json().roomCode}/join`);
    assert.equal(timeoutJoin.statusCode, 201, timeoutJoin.body);
    const timeoutGameId = timeoutJoin.json().gameId as string;
    const expiringOffer = await request(white, "POST", `/chess/games/${timeoutGameId}/draw-offers`);
    assert.equal(expiringOffer.statusCode, 201, expiringOffer.body);
    await pool.query(
      "UPDATE chess_draw_offers SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",
      [expiringOffer.json().offerId],
    );
    assert.equal(await expirePendingChessDrawOffers(pool), 1);
    const expiredOffer = await pool.query("SELECT status FROM chess_draw_offers WHERE id=$1", [expiringOffer.json().offerId]);
    assert.equal(expiredOffer.rows[0].status, "cancelled");
    // An expired pending offer must not block a new offer even before a background sweep.
    const freshAfterExpiry = await request(black, "POST", `/chess/games/${timeoutGameId}/draw-offers`);
    assert.equal(freshAfterExpiry.statusCode, 201, freshAfterExpiry.body);
    const oldOfferAfterRefresh = await pool.query("SELECT status FROM chess_draw_offers WHERE id=$1", [expiringOffer.json().offerId]);
    assert.equal(oldOfferAfterRefresh.rows[0].status, "cancelled");
    const timeoutNow = Date.now();
    await pool.query(
      "UPDATE chess_games SET clock_snapshot=jsonb_set(jsonb_set(clock_snapshot,'{whiteMs}','1'::jsonb),'{lastStartedAt}',to_jsonb($2::bigint)) WHERE id=$1",
      [timeoutGameId, timeoutNow - 5000],
    );
    const concurrentTimeouts = await Promise.all([
      adjudicateExpiredChessClocks(pool, timeoutNow),
      adjudicateExpiredChessClocks(pool, timeoutNow),
    ]);
    assert.deepEqual(concurrentTimeouts.sort(), [0, 1]);
    const timeoutResult = await pool.query(
      "SELECT status,clock_snapshot->>'finished' AS finished FROM chess_games WHERE id=$1",
      [timeoutGameId],
    );
    assert.equal(timeoutResult.rows[0].status, "black_win");
    assert.equal(timeoutResult.rows[0].finished, "true");
    assert.equal(await adjudicateExpiredChessClocks(pool, timeoutNow + 1000), 0);
    const timeoutRoomStatus = await pool.query(
      "SELECT status FROM chess_rooms WHERE room_code=$1",
      [timeoutRoom.json().roomCode],
    );
    assert.equal(timeoutRoomStatus.rows[0].status, "finished");

    // Race a player's move against the scheduler at an already-expired clock.
    // Exactly one transaction must finalize the game and award progression/rating.
    const raceRoom = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(raceRoom.statusCode, 201, raceRoom.body);
    const raceJoin = await request(black, "POST", `/chess/rooms/${raceRoom.json().roomCode}/join`);
    assert.equal(raceJoin.statusCode, 201, raceJoin.body);
    const raceGameId = raceJoin.json().gameId as string;
    const raceNow = Date.now();
    await pool.query(
      "UPDATE chess_games SET clock_snapshot=jsonb_set(jsonb_set(clock_snapshot,'{whiteMs}','1'::jsonb),'{lastStartedAt}',to_jsonb($2::bigint)) WHERE id=$1",
      [raceGameId, raceNow - 5000],
    );
    const [racingMove, racingScheduler] = await Promise.all([
      request(white, "POST", `/chess/games/${raceGameId}/moves`, { from: "e2", to: "e4" }),
      adjudicateExpiredChessClocks(pool, raceNow),
    ]);
    assert.ok(
      (racingMove.statusCode === 409 && racingMove.json().error === "clock_expired") ||
      (racingMove.statusCode === 404 && racingMove.json().error === "active_game_not_found"),
      racingMove.body,
    );
    assert.ok(racingScheduler === 0 || racingScheduler === 1);
    const raceResult = await pool.query("SELECT status FROM chess_games WHERE id=$1", [raceGameId]);
    assert.equal(raceResult.rows[0].status, "black_win");
    const raceXpEvents = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_progression_events WHERE game_id=$1 AND event_key='final_result'",
      [raceGameId],
    );
    assert.equal(raceXpEvents.rows[0].count, 2);
    const raceRatingEvents = await pool.query(
      "SELECT COUNT(*)::int AS count FROM chess_rating_events WHERE game_id=$1",
      [raceGameId],
    );
    assert.equal(raceRatingEvents.rows[0].count, 2);
    assert.equal(await adjudicateExpiredChessClocks(pool, raceNow + 1000), 0);

    const cancellable = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    const cancellableCode = cancellable.json().roomCode as string;
    const guestCancel = await request(black, "DELETE", `/chess/rooms/${cancellableCode}`);
    assert.equal(guestCancel.statusCode, 404);
    const hostCancel = await request(white, "DELETE", `/chess/rooms/${cancellableCode}`);
    assert.equal(hostCancel.statusCode, 200);
    assert.equal(hostCancel.json().cancelled, true);

    const expiring = await request(white, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    const expiringCode = expiring.json().roomCode as string;
    await pool.query("UPDATE chess_rooms SET expires_at=NOW()-INTERVAL '1 second' WHERE room_code=$1", [expiringCode]);
    const expiredJoin = await request(black, "POST", `/chess/rooms/${expiringCode}/join`);
    assert.equal(expiredJoin.statusCode, 410);
    const expiredRoom = await pool.query("SELECT status FROM chess_rooms WHERE room_code=$1", [expiringCode]);
    assert.equal(expiredRoom.rows[0].status, "cancelled");

    const queued = await request(queueOne, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(queued.json().status, "waiting");
    const queuedRoom = await request(queueOne, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(queuedRoom.statusCode, 409);
    const matched = await request(queueTwo, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(matched.statusCode, 201, matched.body);
    assert.equal(matched.json().status, "matched");
    const matchStatus = await request(queueOne, "GET", "/chess/matchmaking/status");
    assert.equal(matchStatus.json().status, "matched");
    const activeRoom = await request(queueOne, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(activeRoom.statusCode, 409);

    const queueCancelRoom = await request(queueCancel, "POST", "/chess/rooms", {
      timeControlId: "rapid", minOpponentLevel: 1, chatEnabled: true,
    });
    assert.equal(queueCancelRoom.statusCode, 201, queueCancelRoom.body);
    const queueCancelMatchmaking = await request(queueCancel, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(queueCancelMatchmaking.statusCode, 409);
    assert.equal(queueCancelMatchmaking.json().error, "waiting_room_already_exists");
    const queueCancelRoomDelete = await request(queueCancel, "DELETE", `/chess/rooms/${queueCancelRoom.json().roomCode}`);
    assert.equal(queueCancelRoomDelete.statusCode, 200);

    const cancelQueue = await request(queueCancel, "POST", "/chess/matchmaking/join", { timeControlId: "rapid" });
    assert.equal(cancelQueue.statusCode, 202);
    const cancelled = await request(queueCancel, "DELETE", "/chess/matchmaking/queue");
    assert.equal(cancelled.json().cancelled, true);
    const idle = await request(queueCancel, "GET", "/chess/matchmaking/status");
    assert.equal(idle.json().status, "idle");
  } finally {
    await app.close();
    await appTwo.close();
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
