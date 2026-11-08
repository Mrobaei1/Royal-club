// @ts-nocheck
import { cardId } from "./engine.js";

function restoreRoom(raw) {
  if (!raw) return null;
  const room = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!room.round) return room;
  const round = room.round;
  let seenCards;
  if (Array.isArray(round.seenCards)) {
    seenCards = round.seenCards;
  } else if (round.seenCards instanceof Set) {
    seenCards = [...round.seenCards];
  } else {
    // Backward compatibility for rows written before Set serialization was
    // normalized: dealt cards remain in hands or have been played in a trick.
    seenCards = [
      ...(round.hands ?? []).flat().map(cardId),
      ...(round.completedTricks ?? []).flatMap(trick => trick.map(play => cardId(play.card))),
      ...(round.currentTrick ?? []).map(play => cardId(play.card)),
    ];
  }
  return { ...room, round: { ...round, seenCards: new Set(seenCards) } };
}

function serializeRoom(room) {
  const serializable = room.round
    ? { ...room, round: { ...room.round, seenCards: [...(room.round.seenCards ?? [])] } }
    : room;
  return JSON.stringify(serializable);
}

/**
 * PostgreSQL adapter for HokmRoomService.
 * Accepts a node-postgres Pool (connect/query). No driver dependency is bundled.
 * Run migrations/001_hokm_rooms.sql before use.
 */
export class PostgresRoomRepository {
  #pool;

  constructor(pool) {
    if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") {
      throw new TypeError("A node-postgres compatible Pool is required");
    }
    this.#pool = pool;
  }

  async get(roomId) {
    const result = await this.#pool.query(
      "SELECT room_data FROM hokm_rooms WHERE room_id = $1",
      [roomId]
    );
    const room = restoreRoom(result.rows[0]?.room_data ?? null);
    if (!room) return null;

    // Progress is a cross-match account aggregate, not a per-room resettable
    // value. Hydrate every participant from PostgreSQL before any transition
    // can calculate the next match award.
    const userIds = (room.players ?? []).map(player => player.userId)
      .filter(userId => typeof userId === "string" && /^\d+$/.test(userId));
    const accounts = userIds.length
      ? await this.#pool.query(
          `SELECT u.id::text AS "userId", u.username, p.xp, p.level
             FROM users u
             LEFT JOIN hokm_player_progress p ON p.user_id = u.id
            WHERE u.id = ANY($1::bigint[])`,
          [userIds]
        )
      : { rows: [] };
    const playerProgress = { ...(room.playerProgress ?? {}) };
    const usernames = new Map();
    for (const userId of userIds) {
      playerProgress[userId] ??= { xp: 0, level: 1 };
    }
    for (const row of accounts.rows) {
      const userId = String(row.userId);
      usernames.set(userId, typeof row.username === "string" && row.username.trim() ? row.username : null);
      if (row.xp !== null && row.xp !== undefined && row.level !== null && row.level !== undefined) {
        playerProgress[userId] = { xp: Number(row.xp), level: Number(row.level) };
      }
    }
    const players = room.players.map(player => ({
      ...player,
      username: usernames.get(player.userId) ?? null
    }));
    return { ...room, players, playerProgress };
  }

  /** Find persisted rooms whose server-owned deadlines have elapsed. */
  async listDueRooms(now, limit = 100) {
    if (!Number.isFinite(now) || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new TypeError("Invalid due-room query");
    }
    const sql = [
      "SELECT room_data",
      "FROM hokm_rooms",
      "WHERE room_data->>'status' IN ('playing', 'round_completed')",
      "AND (",
      "  CASE WHEN jsonb_typeof(room_data->'turnDeadlineAt') = 'number'",
      "       THEN (room_data->>'turnDeadlineAt')::double precision END <= $1",
      "  OR CASE WHEN jsonb_typeof(room_data->'allDisconnectedDeadline') = 'number'",
      "          THEN (room_data->>'allDisconnectedDeadline')::double precision END <= $1",
      "  OR CASE WHEN jsonb_typeof(room_data->'multipleDisconnectedDeadline') = 'number'",
      "          THEN (room_data->>'multipleDisconnectedDeadline')::double precision END <= $1",
      "  OR EXISTS (",
      "    SELECT 1",
      "    FROM jsonb_array_elements(COALESCE(room_data->'players', '[]'::jsonb)) AS p(value)",
      "    WHERE p.value->>'connected' = 'false'",
      "      AND COALESCE(p.value->>'forfeited', 'false') <> 'true'",
      "      AND COALESCE(p.value->>'temporaryBot', 'false') <> 'true'",
      "      AND CASE WHEN jsonb_typeof(p.value->'reconnectDeadline') = 'number'",
      "               THEN (p.value->>'reconnectDeadline')::double precision END <= $1",
      "  )",
      ")",
      "ORDER BY updated_at ASC",
      "LIMIT $2"
    ].join("\n");
    const result = await this.#pool.query(sql, [now, limit]);
    return result.rows.map(row => restoreRoom(row.room_data));
  }

  async insert(room) {
    await this.#pool.query(
      "INSERT INTO hokm_rooms (room_id, version, room_data) VALUES ($1, $2, $3::jsonb)",
      [room.roomId, room.version, serializeRoom(room)]
    );
    return room;
  }

  async compareAndSwap(roomId, expectedVersion, nextRoom) {
    if (nextRoom.roomId !== roomId || !Number.isInteger(nextRoom.version) || nextRoom.version <= expectedVersion) {
      throw new Error("Invalid room compare-and-swap transition");
    }
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE hokm_rooms SET version = $3, room_data = $4::jsonb, updated_at = now() WHERE room_id = $1 AND version = $2 RETURNING room_id",
        [roomId, expectedVersion, nextRoom.version, serializeRoom(nextRoom)]
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }

      // Persist every changed player's aggregate in the same transaction as
      // the room state, covering both match rewards and one-time leaver penalties.
      for (const [userId, progress] of Object.entries(nextRoom.playerProgress ?? {})) {
        await client.query(
          "INSERT INTO hokm_player_progress (user_id, xp, level) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level, updated_at = now()",
          [userId, progress.xp, progress.level]
        );
      }
      // NOTIFY is transactional: subscribers wake only after the CAS commit succeeds.
      await client.query("SELECT pg_notify('hokm_room_updates', $1)", [roomId]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }
}
