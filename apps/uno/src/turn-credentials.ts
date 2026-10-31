import { createHmac } from 'node:crypto';

export interface TurnCredentials {
  username: string;
  credential: string;
  expiresAt: number;
}
export function createTurnCredentials(
  userId: string,
  sharedSecret: string,
  ttlSeconds = 3600,
  nowMs = Date.now(),
): TurnCredentials {
  if (!userId || !sharedSecret) throw new Error('A user ID and TURN shared secret are required.');
  const requestedTtl = Number.isFinite(ttlSeconds) ? Math.floor(ttlSeconds) : 3600;
  const ttl = Math.min(3600, Math.max(60, requestedTtl));
  const expiresAt = Math.floor(nowMs / 1000) + ttl;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64');
  return { username, credential, expiresAt };
}
