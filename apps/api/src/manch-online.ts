import { randomBytes, randomInt } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { nextProgressionState } from './player-progression.js';
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
    CREATE TABLE IF NOT EXISTS manch_match_presence (
      match_id BIGINT NOT NULL REFERENCES manch_matches(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_ai_action_at TIMESTAMPTZ,
      PRIMARY KEY (match_id, user_id)
    );
    ALTER TABLE manch_match_presence
      ADD COLUMN IF NOT EXISTS last_ai_action_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS manch_match_presence_seen_idx
      ON manch_match_presence (match_id, last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS manch_match_invites (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES manch_matches(id) ON DELETE CASCADE,
      inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      CHECK (inviter_user_id <> invitee_user_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS manch_match_invites_pending_pair_idx
      ON manch_match_invites (match_id, invitee_user_id)
      WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS manch_match_invites_inbox_idx
      ON manch_match_invites (invitee_user_id, status, expires_at DESC);
    CREATE TABLE IF NOT EXISTS manch_player_stats (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
      wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
      losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
      quits INTEGER NOT NULL DEFAULT 0 CHECK (quits >= 0),
      xp_points INTEGER NOT NULL DEFAULT 0 CHECK (xp_points >= 0),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS manch_progression_events (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES manch_matches(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'quit')),
      points_delta INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, event_key, user_id)
    );
    CREATE INDEX IF NOT EXISTS manch_player_stats_leaderboard_idx
      ON manch_player_stats (xp_points DESC, level DESC, wins DESC);
    CREATE INDEX IF NOT EXISTS manch_progression_user_idx
      ON manch_progression_events (user_id, created_at DESC);
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
            p.seat_colour AS "seatColour", u.username,
            presence.last_seen_at AS "lastSeenAt",
            COALESCE(presence.last_seen_at >= NOW() - INTERVAL '30 seconds', FALSE) AS "isOnline",
            COALESCE(presence.last_ai_action_at >= NOW() - INTERVAL '30 seconds', FALSE) AS "aiControlling"
       FROM manch_match_players p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN manch_match_presence presence
         ON presence.match_id = p.match_id AND presence.user_id = p.user_id
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

/** Record one competitive result per participant, with permanent levels and idempotent XP events. */
async function recordManchProgression(
  client: PoolClient,
  matchId: string,
  winnerUserId: string,
  quittingUserId: string | null = null,
): Promise<void> {
  const participants = await client.query(
    'SELECT user_id FROM manch_match_players WHERE match_id = $1 ORDER BY user_id',
    [matchId],
  );
  const userIds = participants.rows.map((row) => String(row.user_id));
  if (userIds.length < 2 || !userIds.includes(winnerUserId) ||
      (quittingUserId !== null && (!userIds.includes(quittingUserId) || quittingUserId === winnerUserId))) {
    throw new Error('Invalid Manch progression participants.');
  }
  await client.query(
    'INSERT INTO manch_player_stats (user_id) SELECT unnest($1::bigint[]) ON CONFLICT (user_id) DO NOTHING',
    [userIds],
  );
  const locked = await client.query(
    `SELECT user_id, xp_points, level FROM manch_player_stats
      WHERE user_id = ANY($1::bigint[]) ORDER BY user_id FOR UPDATE`,
    [userIds],
  );
  const stats = new Map(locked.rows.map((row) => [String(row.user_id), row]));
  for (const userId of userIds) {
    const outcome = userId === winnerUserId ? 'win' : userId === quittingUserId ? 'quit' : 'loss';
    const pointsDelta = outcome === 'win' ? 20 : outcome === 'loss' ? 5 : -5;
    const inserted = await client.query(
      `INSERT INTO manch_progression_events
        (match_id, event_key, user_id, outcome, points_delta)
       VALUES ($1, 'final', $2, $3, $4)
       ON CONFLICT (match_id, event_key, user_id) DO NOTHING
       RETURNING user_id`,
      [matchId, userId, outcome, pointsDelta],
    );
    if (!inserted.rowCount) continue;
    const current = stats.get(userId);
    if (!current) throw new Error('Could not lock Manch progression stats.');
    const next = nextProgressionState(Number(current.xp_points), Number(current.level), outcome);
    await client.query(
      `UPDATE manch_player_stats
          SET games_played = games_played + 1,
              wins = wins + CASE WHEN $1 = 'win' THEN 1 ELSE 0 END,
              losses = losses + CASE WHEN $1 IN ('loss', 'quit') THEN 1 ELSE 0 END,
              quits = quits + CASE WHEN $1 = 'quit' THEN 1 ELSE 0 END,
              xp_points = $2, level = $3, updated_at = NOW()
        WHERE user_id = $4`,
      [outcome, next.xp, next.level, userId],
    );
    current.xp_points = next.xp;
    current.level = next.level;
  }
}

function sendError(reply: any, statusCode: number, error: string) {
  return reply.code(statusCode).send({ error });
}

/** Apply one server-authoritative AI action when the active seat has missed its 30-second heartbeat lease. */
async function processTemporaryManchAiTurn(pool: Pool, matchId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, status, player_count, game_state, current_turn_user_id
         FROM manch_matches WHERE id = $1 FOR UPDATE`,
      [matchId],
    );
    const match = locked.rows[0];
    if (!match || match.status !== 'active' || !match.current_turn_user_id) {
      await client.query('ROLLBACK');
      return false;
    }
    const policyResult = await client.query(
      `SELECT enabled, grace_seconds, takeover_mode
         FROM game_disconnect_policies WHERE game_type = 'manch' FOR SHARE`,
    );
    const policy = policyResult.rows[0];
    if (!policy?.enabled || policy.takeover_mode !== 'temporary_ai') {
      await client.query('ROLLBACK');
      return false;
    }
    const presenceResult = await client.query(
      `SELECT last_seen_at, last_ai_action_at,
              last_seen_at <= NOW() - make_interval(secs => $3::int) AS overdue,
              last_ai_action_at > NOW() - INTERVAL '2 seconds' AS recently_acted
         FROM manch_match_presence
        WHERE match_id = $1 AND user_id = $2
        FOR UPDATE`,
      [matchId, match.current_turn_user_id, policy.grace_seconds],
    );
    const presence = presenceResult.rows[0];
    if (!presence || !presence.overdue || presence.recently_acted) {
      await client.query('ROLLBACK');
      return false;
    }
    const state = match.game_state as ManchGameState;
    if (!isValidManchState(state)) {
      await client.query('ROLLBACK');
      return false;
    }

    let nextState = state;
    if (nextState.pendingDice === null) {
      const rolled = rollManchDice(nextState, randomInt(1, 7));
      if ('error' in rolled) {
        await client.query('ROLLBACK');
        return false;
      }
      nextState = rolled.state;
    }

    if (nextState.winnerIndex === null && nextState.pendingDice !== null) {
      const moves = legalManchMoves(nextState);
      if (moves.length === 0) {
        const passed = passManchTurn(nextState);
        if ('error' in passed) {
          await client.query('ROLLBACK');
          return false;
        }
        nextState = passed.state;
      } else {
        const selected = [...moves].sort((left, right) => {
          const score = (move: typeof left) =>
            (move.toProgress === 57 ? 10000 : 0) +
            (move.capturedPlayerIndex !== null ? 1000 : 0) +
            (move.fromProgress === -1 ? 250 : 0) +
            move.toProgress;
          return score(right) - score(left) || left.tokenIndex - right.tokenIndex;
        })[0];
        const applied = applyManchMove(nextState, selected.tokenIndex);
        if ('error' in applied) {
          await client.query('ROLLBACK');
          return false;
        }
        nextState = applied.state;
      }
    }

    const finished = nextState.winnerIndex !== null;
    const players = await matchPlayers(client, matchId);
    const nextUser = finished
      ? null
      : players.find((player) => player.seatIndex === nextState.activePlayerIndex)?.userId ?? null;
    const winnerUser = finished
      ? players.find((player) => player.seatIndex === nextState.winnerIndex)?.userId ?? null
      : null;
    if (!finished && !nextUser) {
      await client.query('ROLLBACK');
      return false;
    }
    if (finished && !winnerUser) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE manch_matches
          SET game_state = $1::jsonb, status = $2, current_turn_user_id = $3,
              winner_user_id = $4, finish_reason = $5,
              state_version = state_version + 1, updated_at = NOW()
        WHERE id = $6`,
      [JSON.stringify(nextState), finished ? 'finished' : 'active', nextUser,
       winnerUser, finished ? 'completed' : null, matchId],
    );
    if (finished && winnerUser) {
      await recordManchProgression(client, matchId, winnerUser);
    }
    await client.query(
      `UPDATE manch_match_presence
          SET last_ai_action_at = NOW()
        WHERE match_id = $1 AND user_id = $2`,
      [matchId, match.current_turn_user_id],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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
      if (active) {
        await client.query(
          `INSERT INTO manch_match_presence (match_id, user_id, last_seen_at)
           SELECT $1, user_id, NOW() FROM manch_match_players WHERE match_id = $1
           ON CONFLICT (match_id, user_id) DO NOTHING`,
          [id],
        );
      }
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

  app.get('/api/v1/manch/matches/history', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    if (!userId) return sendError(reply, 401, 'Authentication required.');
    const result = await pool.query(
      `SELECT m.id, m.room_code AS "roomCode",
              m.player_count AS "playerCount", m.status,
              m.winner_user_id AS "winnerUserId",
              m.finish_reason AS "finishReason",
              m.state_version AS "stateVersion",
              m.created_at AS "createdAt", m.updated_at AS "updatedAt"
         FROM manch_matches m
         JOIN manch_match_players p ON p.match_id = m.id
        WHERE p.user_id = $1 AND m.status = 'finished'
        ORDER BY m.updated_at DESC
        LIMIT 50`,
      [userId],
    );
    const matches = await Promise.all(result.rows.map(async (match) => ({
      ...match,
      players: await matchPlayers(pool as unknown as PoolClient, String(match.id)),
    })));
    return { matches };
  });

  app.get('/api/v1/manch/leaderboard', { onRequest: [requireMatchAuth] }, async (request: any) => {
    const userId = String(request.user?.sub ?? '');
    const result = await pool.query(
      `SELECT s.user_id AS "userId", u.username,
              u.avatar_data_url AS "avatarDataUrl",
              s.level, s.xp_points AS "xpPoints",
              s.games_played AS "gamesPlayed", s.wins, s.losses, s.quits
         FROM manch_player_stats s
         JOIN users u ON u.id = s.user_id
        WHERE s.games_played > 0
        ORDER BY s.level DESC, s.xp_points DESC, s.wins DESC,
                 s.games_played ASC, LOWER(u.username) ASC
        LIMIT 50`,
    );
    return { leaderboard: result.rows, currentUserId: userId, game: 'manch' };
  });

  app.get('/api/v1/manch/matches/stats', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    if (!userId) return sendError(reply, 401, 'Authentication required.');
    const result = await pool.query(
      `SELECT COALESCE(games_played, 0)::int AS played,
              COALESCE(wins, 0)::int AS wins,
              COALESCE(losses, 0)::int AS losses,
              COALESCE(quits, 0)::int AS quits,
              COALESCE(xp_points, 0)::int AS "xpPoints",
              COALESCE(level, 1)::int AS level
         FROM manch_player_stats WHERE user_id = $1`,
      [userId],
    );
    return { stats: result.rows[0] ?? { played: 0, wins: 0, losses: 0, quits: 0, xpPoints: 0, level: 1 } };
  });

  app.post('/api/v1/manch/matches/:id/invites', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const inviterId = String(request.user?.sub ?? '');
    const matchId = String(request.params?.id ?? '');
    const inviteeId = String(request.body?.friendUserId ?? '');
    if (!/^\d+$/.test(matchId) || !/^\d+$/.test(inviteeId) || !inviterId || inviteeId === inviterId) {
      return sendError(reply, 400, 'A valid friend user id is required.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const matchResult = await client.query(
        `SELECT id, host_user_id, status, expires_at
           FROM manch_matches WHERE id = $1 FOR UPDATE`,
        [matchId],
      );
      const match = matchResult.rows[0];
      if (!match) {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Manch room not found.');
      }
      if (String(match.host_user_id) !== inviterId) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'Only the room host can invite friends.');
      }
      if (match.status !== 'waiting' || !match.expires_at || new Date(match.expires_at).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'Only an open waiting room can receive invitations.');
      }
      const friendship = await client.query(
        `SELECT 1 FROM friendships
          WHERE status = 'accepted'
            AND ((requester_id = $1 AND addressee_id = $2)
              OR (requester_id = $2 AND addressee_id = $1))`,
        [inviterId, inviteeId],
      );
      if (!friendship.rowCount) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'Manch invitations can only be sent to accepted friends.');
      }
      const target = await client.query('SELECT username FROM users WHERE id = $1', [inviteeId]);
      if (!target.rowCount) {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Friend not found.');
      }
      const invite = await client.query(
        `INSERT INTO manch_match_invites
           (match_id, inviter_user_id, invitee_user_id, expires_at)
         VALUES ($1, $2, $3, LEAST(NOW() + INTERVAL '2 minutes', $4::timestamptz))
         ON CONFLICT (match_id, invitee_user_id) WHERE status = 'pending'
         DO UPDATE SET inviter_user_id = EXCLUDED.inviter_user_id,
                       expires_at = EXCLUDED.expires_at,
                       created_at = NOW()
         RETURNING id, match_id AS "matchId", invitee_user_id AS "inviteeUserId",
                   status, expires_at AS "expiresAt"`,
        [matchId, inviterId, inviteeId, match.expires_at],
      );
      await client.query(
        `INSERT INTO notifications (user_id, actor_user_id, type, title, body, data)
         VALUES ($1, $2, 'system', 'دعوت بازی منچ', 'دوست شما را به یک اتاق منچ دعوت کرده است.',
                 jsonb_build_object('kind', 'manch_invite', 'inviteId', $3::bigint, 'matchId', $4::bigint))
        `,
        [inviteeId, inviterId, invite.rows[0].id, matchId],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ invite: invite.rows[0], friendUsername: target.rows[0].username });
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not create Manch friend invitation');
      return sendError(reply, 500, 'Could not send Manch invitation.');
    } finally {
      client.release();
    }
  });

  app.get('/api/v1/manch/invites', { onRequest: [requireMatchAuth] }, async (request: any) => {
    const userId = String(request.user?.sub ?? '');
    await pool.query(
      `UPDATE manch_match_invites SET status = 'expired', responded_at = NOW()
        WHERE invitee_user_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
      [userId],
    );
    const result = await pool.query(
      `SELECT i.id, i.match_id AS "matchId", i.status,
              i.expires_at AS "expiresAt", i.created_at AS "createdAt",
              m.room_code AS "roomCode", m.player_count AS "playerCount",
              u.username AS "inviterUsername"
         FROM manch_match_invites i
         JOIN manch_matches m ON m.id = i.match_id
         JOIN users u ON u.id = i.inviter_user_id
        WHERE i.invitee_user_id = $1 AND i.status = 'pending'
          AND i.expires_at > NOW() AND m.status = 'waiting'
        ORDER BY i.created_at DESC LIMIT 50`,
      [userId],
    );
    return { invites: result.rows };
  });

  app.post('/api/v1/manch/invites/:id/accept', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const inviteId = String(request.params?.id ?? '');
    if (!/^\d+$/.test(inviteId) || !userId) return sendError(reply, 400, 'Invalid invitation id.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock order is always match first, then invitation. Invitation creation
      // already locks the match; this prevents an invite/accept deadlock.
      const lookup = await client.query(
        'SELECT match_id FROM manch_match_invites WHERE id = $1 AND invitee_user_id = $2',
        [inviteId, userId],
      );
      if (!lookup.rowCount) {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Invitation not found.');
      }
      const matchResult = await client.query(
        `SELECT id, player_count, status, expires_at
           FROM manch_matches WHERE id = $1 FOR UPDATE`,
        [lookup.rows[0].match_id],
      );
      const match = matchResult.rows[0];
      const inviteResult = await client.query(
        `SELECT id, match_id, inviter_user_id, status, expires_at
           FROM manch_match_invites WHERE id = $1 AND invitee_user_id = $2 FOR UPDATE`,
        [inviteId, userId],
      );
      const invite = inviteResult.rows[0];
      if (!invite) {
        await client.query('ROLLBACK');
        return sendError(reply, 404, 'Invitation not found.');
      }
      if (invite.status !== 'pending' || new Date(invite.expires_at).getTime() <= Date.now()) {
        if (invite.status === 'pending') {
          await client.query(
            `UPDATE manch_match_invites SET status = 'expired', responded_at = NOW() WHERE id = $1`,
            [inviteId],
          );
        }
        await client.query('COMMIT');
        return sendError(reply, 410, 'Manch invitation has expired or was already answered.');
      }
      if (!match || match.status !== 'waiting' || !match.expires_at ||
          new Date(match.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE manch_match_invites SET status = 'expired', responded_at = NOW() WHERE id = $1`,
          [inviteId],
        );
        await client.query('COMMIT');
        return sendError(reply, 410, 'The invited Manch room is no longer available.');
      }
      const friendship = await client.query(
        `SELECT 1 FROM friendships
          WHERE status = 'accepted'
            AND ((requester_id = $1 AND addressee_id = $2)
              OR (requester_id = $2 AND addressee_id = $1))`,
        [invite.inviter_user_id, userId],
      );
      if (!friendship.rowCount) {
        await client.query('ROLLBACK');
        return sendError(reply, 403, 'You are no longer friends with the inviter.');
      }
      const players = await matchPlayers(client, String(match.id));
      if (players.some((player) => player.userId === userId)) {
        await client.query('ROLLBACK');
        return sendError(reply, 409, 'You have already joined this room.');
      }
      if (players.length >= Number(match.player_count)) {
        await client.query(
          `UPDATE manch_match_invites SET status = 'expired', responded_at = NOW() WHERE id = $1`,
          [inviteId],
        );
        await client.query('COMMIT');
        return sendError(reply, 409, 'The Manch room is full.');
      }
      const seatIndex = players.length;
      const colour = seatColours(Number(match.player_count))[seatIndex];
      await client.query(
        `INSERT INTO manch_match_players (match_id, user_id, seat_index, seat_colour)
         VALUES ($1, $2, $3, $4)`,
        [match.id, userId, seatIndex, colour],
      );
      const nextPlayers = await matchPlayers(client, String(match.id));
      const active = nextPlayers.length === Number(match.player_count);
      const updated = await client.query(
        `UPDATE manch_matches
            SET status = $1,
                current_turn_user_id = CASE WHEN $1 = 'active' THEN host_user_id ELSE NULL END,
                expires_at = CASE WHEN $1 = 'active' THEN NULL ELSE expires_at END,
                state_version = state_version + 1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, room_code AS "roomCode", player_count AS "playerCount",
                    status, game_state AS "gameState",
                    current_turn_user_id AS "currentTurnUserId",
                    state_version AS "stateVersion"`,
        [active ? 'active' : 'waiting', match.id],
      );
      if (active) {
        await client.query(
          `INSERT INTO manch_match_presence (match_id, user_id, last_seen_at)
           SELECT $1, user_id, NOW() FROM manch_match_players WHERE match_id = $1
           ON CONFLICT (match_id, user_id) DO NOTHING`,
          [match.id],
        );
        await client.query(
          `UPDATE manch_match_invites SET status = 'cancelled', responded_at = NOW()
            WHERE match_id = $1 AND status = 'pending' AND id <> $2`,
          [match.id, inviteId],
        );
      }
      await client.query(
        `UPDATE manch_match_invites SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
        [inviteId],
      );
      await client.query('COMMIT');
      return { match: { ...updated.rows[0], players: nextPlayers } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      request.log.error({ err: error }, 'Could not accept Manch invitation');
      return sendError(reply, 500, 'Could not accept Manch invitation.');
    } finally {
      client.release();
    }
  });

  app.post('/api/v1/manch/invites/:id/decline', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const inviteId = String(request.params?.id ?? '');
    if (!/^\d+$/.test(inviteId) || !userId) return sendError(reply, 400, 'Invalid invitation id.');
    const result = await pool.query(
      `UPDATE manch_match_invites SET status = 'declined', responded_at = NOW()
        WHERE id = $1 AND invitee_user_id = $2 AND status = 'pending' AND expires_at > NOW()
        RETURNING id`,
      [inviteId, userId],
    );
    if (!result.rowCount) return sendError(reply, 404, 'Pending Manch invitation not found.');
    return { declined: true };
  });

  app.post('/api/v1/manch/matches/:id/presence', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    const userId = String(request.user?.sub ?? '');
    const id = String(request.params?.id ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');
    const membership = await pool.query(
      'SELECT 1 FROM manch_match_players WHERE match_id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!membership.rowCount) {
      return sendError(reply, 403, 'You are not a player in this Manch match.');
    }
    await processTemporaryManchAiTurn(pool, id);
    const result = await pool.query(
      `INSERT INTO manch_match_presence (match_id, user_id, last_seen_at, last_ai_action_at)
       SELECT m.id, p.user_id, NOW(), NULL
         FROM manch_matches m
         JOIN manch_match_players p ON p.match_id = m.id
        WHERE m.id = $1 AND m.status = 'active' AND p.user_id = $2
       ON CONFLICT (match_id, user_id)
       DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at,
                       last_ai_action_at = NULL
       RETURNING last_seen_at AS "lastSeenAt"`,
      [id, userId],
    );
    if (!result.rowCount) {
      const membership = await pool.query(
        'SELECT 1 FROM manch_match_players WHERE match_id = $1 AND user_id = $2',
        [id, userId],
      );
      return membership.rowCount
        ? sendError(reply, 409, 'Presence is only available for active Manch matches.')
        : sendError(reply, 403, 'You are not a player in this Manch match.');
    }
    return { acknowledged: true, lastSeenAt: result.rows[0].lastSeenAt };
  });

  app.get('/api/v1/manch/matches/:id', { onRequest: [requireMatchAuth] }, async (request: any, reply: any) => {
    await cleanupExpiredManchRooms(pool);
    const id = String(request.params?.id ?? '');
    const userId = String(request.user?.sub ?? '');
    if (!/^\d+$/.test(id) || !userId) return sendError(reply, 400, 'Invalid match identifier.');

    // Authorize membership before lazy AI processing: an outsider must never
    // be able to advance another match by polling a guessed match identifier.
    const membership = await pool.query(
      'SELECT 1 FROM manch_match_players WHERE match_id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!membership.rowCount) {
      const exists = await pool.query('SELECT 1 FROM manch_matches WHERE id = $1', [id]);
      return exists.rowCount
        ? sendError(reply, 403, 'You are not a player in this Manch match.')
        : sendError(reply, 404, 'Manch match not found.');
    }

    await processTemporaryManchAiTurn(pool, id);
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
    const players = await matchPlayers(pool as unknown as PoolClient, id);
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
      if (finished && winnerUser) await recordManchProgression(client, id, winnerUser);
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
          error: 'Manch state changed; refresh before forfeiting.',
          currentStateVersion: Number(match.state_version),
        });
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
      await recordManchProgression(client, id, winner.userId, userId);
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
