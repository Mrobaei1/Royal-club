import { randomBytes, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  createManchGame,
  defaultManchRuleProfile,
  isValidManchState,
  legalManchMoves,
  rollManchDice,
  passManchTurn,
  applyManchMove,
  type ManchColour,
  type ManchGameState,
} from './manch-rules.js';

const SEAT_COLOURS: Record<number, ManchColour[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

export async function ensureManchSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manch_matches (
      id BIGSERIAL PRIMARY KEY,
      room_code TEXT NOT NULL UNIQUE,
      host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_count SMALLINT NOT NULL CHECK (player_count BETWEEN 2 AND 4),
      status TEXT NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
      game_state JSONB NOT NULL,
      current_turn_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      winner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      finish_reason TEXT,
      state_version INTEGER NOT NULL DEFAULT 0 CHECK (state_version >= 0),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE manch_matches
      ADD COLUMN IF NOT EXISTS winner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE manch_matches
      ADD COLUMN IF NOT EXISTS finish_reason TEXT;
    CREATE INDEX IF NOT EXISTS manch_matches_waiting_idx
      ON manch_matches (created_at DESC)
      WHERE status = 'waiting';
    CREATE INDEX IF NOT EXISTS manch_matches_players_idx
      ON manch_matches (host_user_id, status);
    CREATE TABLE IF NOT EXISTS manch_match_players (
      match_id BIGINT NOT NULL REFERENCES manch_matches(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seat_index SMALLINT NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
      seat_colour TEXT NOT NULL CHECK (seat_colour IN ('red', 'green', 'yellow', 'blue')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (match_id, user_id),
      UNIQUE (match_id, seat_index),
      UNIQUE (match_id, seat_colour)
    );
    CREATE INDEX IF NOT EXISTS manch_match_players_user_idx
      ON manch_match_players (user_id, joined_at DESC);
  `);
}

async function cleanupExpiredManchRooms(pool: Pool): Promise<void> {
  await pool.query(
    `DELETE FROM manch_matches
      WHERE status = 'waiting' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
  );
}

function seatColours(playerCount: number): ManchColour[] {
  return [...SEAT_COLOURS[playerCount]];
}

async function lockMatch(client: PoolClient, id: string) {
  const result = await client.query(
    `SELECT id, room_code, host_user_id, player_count, status, game_state,
            current_turn_user_id, state_version, expires_at
       FROM manch_matches WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] as {
    id: string;
    room_code: string;
    host_user_id: string;
    player_count: number;
    status: string;
    game_state: ManchGameState;
    current_turn_user_id: string | null;
    state_version: number;
    expires_at: Date | null;
  } | undefined;
}

async function matchPlayers(client: any, matchId: string) {
  const result = await client.query(
    `SELECT p.user_id AS "userId", p.seat_index AS "seatIndex",
            p.seat_colour AS "seatColour", u.username
       FROM manch_match_players p
       JOIN users u ON u.id = p.user_id
      WHERE p.match_id = $1 ORDER BY p.seat_index`,
    [matchId],
  );
  return result.rows as Array<{
    userId: string;
    seatIndex: number;
    seatColour: ManchColour;
    username: string | null;
  }>;
}

function sendError(reply: any, statusCode: number, error: string) {
  return reply.code(statusCode).send({ error });
}

export function registerManchRoutes(app: any, pool: Pool, requireMatchAuth: any): void {
  app.get('/api/v1/manch/matches', { onRequest: [requireMatchAuth] }, async (request: any) => {
    await cleanupExpiredManchRooms(pool);
    const result = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode", m.player_count AS "playerCount",
              m.created_at AS "createdAt", u.username AS "hostUsername",
              COUNT(p.user_id)::int AS "joinedPlayers"
         FROM manch_matches m
         JOIN users u ON u.id = m.host_user_id
         LEFT JOIN manch_match_players p ON p.match_id = m.id
        WHERE m.status = 'waiting' AND m.expires_at > NOW()
        GROUP BY m.id, u.username
       HAVING COUNT(p.user_id) < m.player_count
        ORDER BY m.created_at ASC
        LIMIT 50`,
    );
    return { matches: result.rows };
  });

  app.post('/api/v1/manch/matches', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const playerCount = Number(request.body?.playerCount ?? 2);
    if (!userId || !Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
      return sendError(reply, 400, 'Player count must be between 2 and 4.');
    }

    if (request.body?.profile !== undefined) {
      return sendError(reply, 400, 'Manch rules are selected by the server, not by the client.');
    }

    let state: ManchGameState;
    try {
      // Until manager-controlled rule settings are integrated, every room
      // receives the server's canonical default profile.
      state = createManchGame(seatColours(playerCount), defaultManchRuleProfile());
    } catch (error) {
      return sendError(reply, 400, error instanceof Error ? error.message : 'Invalid Manch setup.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roomCode = randomBytes(6).toString('hex').toUpperCase();
      const inserted = await client.query(
        `INSERT INTO manch_matches
          (room_code, host_user_id, player_count, status, game_state, expires_at)
         VALUES ($1, $2, $3, 'waiting', $4::jsonb, NOW() + INTERVAL '30 seconds')
         RETURNING id, room_code AS "roomCode", player_count AS "playerCount",
                   status, state_version AS "stateVersion", expires_at AS "expiresAt"`,
        [roomCode, userId, playerCount, JSON.stringify(state)],
      );
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO manch_match_players (match_id, user_id, seat_index, seat_colour)
         VALUES ($1, $2, 0, $3)`,
        [created.id, userId, seatColours(playerCount)[0]],
      );
      await client.query('COMMIT');
      return reply.code(201).send({
        match: { ...created, gameState: state, players: [{ userId, seatIndex: 0, seatColour: seatColours(playerCount)[0] }] },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Manch room creation failed');
      return sendError(reply, 500, 'Could not create a Manch room.');
    } finally {
      client.release();
    }
  });

  app.post('/api/v1/manch/matches/:id/join', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    await cleanupExpiredManchRooms(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const match = await lockMatch(client, id);
      if (!match) {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Manch room not found.');
      }
      const players = await matchPlayers(client, id);
      const existing = players.find((player) => player.userId === userId);
      if (existing) {
        await client.query('COMMIT');
        return { match: { ...match, players } };
      }
      if (match.status !== 'waiting' || !match.expires_at ||
          new Date(match.expires_at).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return sendError(reply, 410, 'Manch room has expired or is no longer waiting.');
      }
      if (players.length >= match.player_count) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Manch room is full.');
      }
      const seatIndex = players.length;
      const colour = seatColours(match.player_count)[seatIndex];
      await client.query(
        `INSERT INTO manch_match_players (match_id, user_id, seat_index, seat_colour)
         VALUES ($1, $2, $3, $4)`,
        [id, userId, seatIndex, colour],
      );
      const nextPlayers = await matchPlayers(client, id);
      const active = nextPlayers.length === match.player_count;
      const updated = await client.query(
        `UPDATE manch_matches
            SET status = $1,
                current_turn_user_id = CASE WHEN $1 = 'active' THEN $2::bigint ELSE NULL END,
                expires_at = CASE WHEN $1 = 'active' THEN NULL ELSE expires_at END,
                state_version = state_version + 1,
                updated_at = NOW()
          WHERE id = $3
          RETURNING id, room_code AS "roomCode", player_count AS "playerCount",
                    status, game_state AS "gameState",
                    current_turn_user_id AS "currentTurnUserId",
                    state_version AS "stateVersion"`,
        [active ? 'active' : 'waiting', match.host_user_id, id],
      );
      await client.query('COMMIT');
      return { match: { ...updated.rows[0], players: nextPlayers } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Joining Manch room failed');
      return sendError(reply, 500, 'Could not join the Manch room.');
    } finally {
      client.release();
    }
  });

  app.get('/api/v1/manch/matches/mine', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    if (!userId) return sendError(reply, 401, 'Authentication required.');
    await cleanupExpiredManchRooms(pool);
    const result = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode", m.player_count AS "playerCount",
              m.status, m.game_state AS "gameState",
              m.current_turn_user_id AS "currentTurnUserId",
              m.state_version AS "stateVersion",
              m.expires_at AS "expiresAt", m.updated_at AS "updatedAt"
         FROM manch_matches m
         JOIN manch_match_players p ON p.match_id = m.id
        WHERE p.user_id = $1 AND m.status IN ('waiting', 'active')
        ORDER BY m.updated_at DESC
        LIMIT 1`,
      [userId],
    );
    const match = result.rows[0];
    if (!match) return { match: null };
    const players = await matchPlayers(pool as unknown as PoolClient, String(match.id));
    return { match: { ...match, players } };
  });

  app.get('/api/v1/manch/matches/:id', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    await cleanupExpiredManchRooms(pool);
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    const result = await pool.query(
      `SELECT id, room_code AS "roomCode", player_count AS "playerCount",
              status, game_state AS "gameState",
              current_turn_user_id AS "currentTurnUserId",
              winner_user_id AS "winnerUserId", finish_reason AS "finishReason",
              state_version AS "stateVersion", created_at AS "createdAt"
         FROM manch_matches WHERE id = $1`,
      [id],
    );
    const match = result.rows[0];
    if (!match) return sendError(reply, 404, 'Manch match not found.');
    const players = await matchPlayers(pool as unknown as PoolClient, id).catch(() => []);
    if (!players.some((player) => player.userId === userId)) {
      return sendError(reply, 403, 'You are not a player in this Manch match.');
    }
    return { match: { ...match, players } };
  });

  app.post('/api/v1/manch/matches/:id/roll', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    const expectedVersion = request.body?.expectedStateVersion;
    if (!/^\d+$/.test(id) || !userId ||
        !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return sendError(reply, 400, 'A valid match id and state version are required.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const match = await lockMatch(client, id);
      if (!match || match.status !== 'active') {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Active Manch match not found.');
      }
      if (Number(match.state_version) !== expectedVersion) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'Manch state changed; refresh before rolling.',
          currentStateVersion: Number(match.state_version),
        });
      }
      if (match.current_turn_user_id !== userId) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'It is not your turn.');
      }
      const state = match.game_state;
      if (!isValidManchState(state)) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Persisted Manch state is invalid.');
      }
      const dice = randomInt(1, 7);
      const rolled = rollManchDice(state, dice);
      if ('error' in rolled) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, rolled.error);
      }
      let nextState = rolled.state;
      let autoPassed = false;
      let noLegalMove = false;
      // A third-six penalty advances the turn inside rollManchDice and has
      // no pending die. Only a real pending die can be auto-passed here.
      if (nextState.pendingDice !== null && legalManchMoves(nextState).length === 0) {
        noLegalMove = true;
        const playerBeforePass = nextState.activePlayerIndex;
        const passed = passManchTurn(nextState);
        if ('error' in passed) {
          await client.query('ROLLBACK');
          return sendError(reply, 409, passed.error);
        }
        nextState = passed.state;
        autoPassed = nextState.activePlayerIndex !== playerBeforePass;
      }
      const turnLost = nextState.activePlayerIndex !== state.activePlayerIndex &&
        !autoPassed && nextState.pendingDice === null;
      const players = await matchPlayers(client, id);
      const nextUser = players.find((player) => player.seatIndex === nextState.activePlayerIndex);
      if (!nextUser) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Active player seat is missing.');
      }
      const updated = await client.query(
        `UPDATE manch_matches
            SET game_state = $1::jsonb, current_turn_user_id = $2,
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $3
          RETURNING state_version AS "stateVersion"`,
        [JSON.stringify(nextState), nextUser.userId, id],
      );
      await client.query('COMMIT');
      return { dice, autoPassed, noLegalMove, turnLost, state: nextState, currentTurnUserId: nextUser.userId,
        stateVersion: updated.rows[0].stateVersion };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Manch dice roll failed');
      return sendError(reply, 500, 'Could not roll Manch dice.');
    } finally {
      client.release();
    }
  });

  app.post('/api/v1/manch/matches/:id/move', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    const tokenIndex = request.body?.tokenIndex;
    const expectedVersion = request.body?.expectedStateVersion;
    if (!/^\d+$/.test(id) || !userId || !Number.isInteger(tokenIndex) ||
        !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return sendError(reply, 400, 'A valid match id, token index and state version are required.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const match = await lockMatch(client, id);
      if (!match || match.status !== 'active') {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Active Manch match not found.');
      }
      if (Number(match.state_version) !== expectedVersion) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'Manch state changed; refresh before moving.',
          currentStateVersion: Number(match.state_version),
        });
      }
      if (match.current_turn_user_id !== userId) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'It is not your turn.');
      }
      if (!isValidManchState(match.game_state)) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Persisted Manch state is invalid.');
      }
      const applied = applyManchMove(match.game_state, tokenIndex);
      if ('error' in applied) {
        await client.query('ROLLBACK');
        return sendError(reply, 400, applied.error);
      }
      const nextState = applied.state;
      const finished = nextState.winnerIndex !== null;
      const players = await matchPlayers(client, id);
      const nextUser = finished
        ? null
        : players.find((player) => player.seatIndex === nextState.activePlayerIndex)?.userId ?? null;
      const winnerUser = finished
        ? players.find((player) => player.seatIndex === nextState.winnerIndex)?.userId ?? null
        : null;
      if (finished && !winnerUser) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Winner seat is missing.');
      }
      if (!finished && !nextUser) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Active player seat is missing.');
      }
      const updated = await client.query(
        `UPDATE manch_matches
            SET game_state = $1::jsonb, status = $2,
                current_turn_user_id = $3, winner_user_id = $5,
                finish_reason = $6,
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $4
          RETURNING state_version AS "stateVersion"`,
        [JSON.stringify(nextState), finished ? 'finished' : 'active', nextUser,
          id, winnerUser, finished ? 'completed' : null],
      );
      await client.query('COMMIT');
      return {
        state: nextState,
        move: applied.move,
        status: finished ? 'finished' : 'active',
        currentTurnUserId: nextUser,
        winnerUserId: winnerUser,
        finishReason: finished ? 'completed' : null,
        stateVersion: updated.rows[0].stateVersion,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Manch move failed');
      return sendError(reply, 500, 'Could not apply Manch move.');
    } finally {
      client.release();
    }
  });

  app.post('/api/v1/manch/matches/:id/forfeit', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const match = await lockMatch(client, id);
      if (!match || match.status !== 'active') {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Active Manch match not found.');
      }
      if (match.player_count !== 2) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Forfeit is currently supported for two-player matches only.');
      }
      const players = await matchPlayers(client, id);
      if (!players.some((player) => player.userId === userId)) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'You are not a player in this Manch match.');
      }
      const winner = players.find((player) => player.userId !== userId);
      if (!winner) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'The opponent seat is missing.');
      }
      const updated = await client.query(
        `UPDATE manch_matches
            SET status = 'finished', current_turn_user_id = NULL,
                winner_user_id = $1, finish_reason = 'forfeit',
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $2
          RETURNING state_version AS "stateVersion"`,
        [winner.userId, id],
      );
      await client.query('COMMIT');
      return { status: 'finished', finishReason: 'forfeit',
        forfeitingUserId: userId, winnerUserId: winner.userId,
        stateVersion: updated.rows[0].stateVersion };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Manch forfeit failed');
      return sendError(reply, 500, 'Could not forfeit the Manch match.');
    } finally {
      client.release();
    }
  });
  app.post('/api/v1/manch/matches/:id/rematch', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const previous = await lockMatch(client, id);
      if (!previous || previous.status !== 'finished') {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Only a finished Manch match can be rematched.');
      }
      const previousPlayers = await matchPlayers(client, id);
      if (!previousPlayers.some((player) => player.userId === userId)) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'You are not a player in this Manch match.');
      }
      const colours = seatColours(previous.player_count);
      const state = createManchGame(colours, defaultManchRuleProfile());
      const roomCode = randomBytes(6).toString('hex').toUpperCase();
      const inserted = await client.query(
        `INSERT INTO manch_matches
          (room_code, host_user_id, player_count, status, game_state, expires_at)
         VALUES ($1, $2, $3, 'waiting', $4::jsonb, NOW() + INTERVAL '30 seconds')
         RETURNING id, room_code AS "roomCode", player_count AS "playerCount",
                   status, state_version AS "stateVersion", expires_at AS "expiresAt"`,
        [roomCode, userId, previous.player_count, JSON.stringify(state)],
      );
      const created = inserted.rows[0];
      await client.query(
        `INSERT INTO manch_match_players (match_id, user_id, seat_index, seat_colour)
         VALUES ($1, $2, 0, $3)`,
        [created.id, userId, colours[0]],
      );
      await client.query('COMMIT');
      return reply.code(201).send({
        match: { ...created, gameState: state, players: [{ userId, seatIndex: 0, seatColour: colours[0] }] },
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Manch rematch creation failed');
      return sendError(reply, 500, 'Could not create a Manch rematch.');
    } finally {
      client.release();
    }
  });
  app.delete('/api/v1/manch/matches/:id', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    const result = await pool.query(
      `UPDATE manch_matches SET status = 'cancelled', expires_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND host_user_id = $2 AND status = 'waiting'
        RETURNING id`,
      [id, userId],
    );
    if (!result.rowCount) return sendError(reply, 404, 'Waiting Manch room not found.');
    return { cancelled: true };
  });
}
