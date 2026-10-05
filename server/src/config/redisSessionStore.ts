import session from 'express-session';
import { getRedisClient } from './redis';

/** Minimal durable session store backed by the same Redis instance as BullMQ. */
export class RedisSessionStore extends session.Store {
  constructor(private readonly prefix = 'veridara:sess:') { super(); }

  get(sid: string, callback: (error: unknown, session?: session.SessionData | null) => void): void {
    let client;
    try { client = getRedisClient(); } catch (error) { callback(error); return; }
    client.get(`${this.prefix}${sid}`)
      .then(value => callback(null, value ? JSON.parse(value) as session.SessionData : null))
      .catch(error => callback(error));
  }

  set(sid: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    const ttlSeconds = Math.ceil((value.cookie.maxAge ?? 7 * 24 * 60 * 60 * 1000) / 1000);
    let client;
    try { client = getRedisClient(); } catch (error) { callback?.(error); return; }
    client.set(`${this.prefix}${sid}`, JSON.stringify(value), 'EX', ttlSeconds)
      .then(() => callback?.())
      .catch(error => callback?.(error));
  }

  destroy(sid: string, callback?: (error?: unknown) => void): void {
    let client;
    try { client = getRedisClient(); } catch (error) { callback?.(error); return; }
    client.del(`${this.prefix}${sid}`)
      .then(() => callback?.())
      .catch(error => callback?.(error));
  }

  touch(sid: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    const ttlSeconds = Math.max(1, Math.ceil((value.cookie.maxAge ?? 7 * 24 * 60 * 60 * 1000) / 1000));
    let client;
    try { client = getRedisClient(); } catch (error) { callback?.(error); return; }
    client.expire(`${this.prefix}${sid}`, ttlSeconds)
      .then(() => callback?.())
      .catch(error => callback?.(error));
  }
}
