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
    return result.rows[0]?.room_data ?? null;
  }

  async insert(room) {
    await this.#pool.query(
      "INSERT INTO hokm_rooms (room_id, version, room_data) VALUES ($1, $2, $3::jsonb)",
      [room.roomId, room.version, JSON.stringify(room)]
    );
    return room;
  }

  async compareAndSwap(roomId, expectedVersion, nextRoom) {
    if (nextRoom.roomId !== roomId || nextRoom.version !== expectedVersion + 1) {
      throw new Error("Invalid room compare-and-swap transition");
    }
    const client = await this.#pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE hokm_rooms SET version = $3, room_data = $4::jsonb, updated_at = now() WHERE room_id = $1 AND version = $2 RETURNING room_id",
        [roomId, expectedVersion, nextRoom.version, JSON.stringify(nextRoom)]
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
