// @ts-nocheck
import { EventEmitter } from 'node:events';

/**
 * Cross-process room change fan-out. PostgreSQL NOTIFY is emitted by the
 * repository inside the same transaction as the authoritative room update.
 * Each API process holds one dedicated LISTEN connection and fans notifications
 * out to its local SSE subscribers.
 */
export class HokmEventHub extends EventEmitter {
  #pool;
  #client = null;
  #started = false;
  #closed = false;
  #onError;

  constructor(pool, { onError = () => {} } = {}) {
    super();
    if (!pool || typeof pool.connect !== 'function') throw new TypeError('A PostgreSQL pool is required');
    if (typeof onError !== 'function') throw new TypeError('onError must be a function');
    this.#pool = pool;
    this.#onError = onError;
  }

  async start() {
    if (this.#started) return false;
    if (this.#closed) throw new Error('HokmEventHub is already closed');
    const client = await this.#pool.connect();
    this.#client = client;
    client.on('notification', message => {
      if (message.channel !== 'hokm_room_updates' || typeof message.payload !== 'string') return;
      if (!message.payload || message.payload.length > 128) return;
      this.emit(message.payload);
    });
    client.on('error', error => {
      try { this.#onError(error); } catch { /* monitoring cannot break event fan-out */ }
    });
    await client.query('LISTEN hokm_room_updates');
    this.#started = true;
    return true;
  }

  subscribe(roomId, listener) {
    if (!this.#started || this.#closed) throw new Error('HokmEventHub is not running');
    if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 128) {
      throw new TypeError('A valid room ID is required');
    }
    if (typeof listener !== 'function') throw new TypeError('A listener is required');
    this.on(roomId, listener);
    return () => this.off(roomId, listener);
  }

  async close() {
    if (this.#closed) return false;
    this.#closed = true;
    this.#started = false;
    const client = this.#client;
    this.#client = null;
    if (client) {
      try { await client.query('UNLISTEN hokm_room_updates'); }
      catch (error) { try { this.#onError(error); } catch { /* ignored */ } }
      finally { client.release(); }
    }
    this.removeAllListeners();
    return true;
  }

  get isRunning() { return this.#started && !this.#closed; }
}
