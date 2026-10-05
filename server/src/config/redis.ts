import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let redisAvailable = false;

export function getRedisClient(): Redis {
  if (!redisClient) {
    // Return a dummy client that will fail gracefully
    throw new Error('Redis not initialized');
  }
  return redisClient;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function connectRedis(): Promise<void> {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop retrying after 3 attempts
      return Math.min(times * 200, 1000);
    }
  });

  let errorLogged = false;
  redisClient.on('error', (err) => {
    if (!errorLogged) {
      logger.warn(`Redis unavailable (${err.message}) — analyses will run inline`);
      errorLogged = true;
    }
    redisAvailable = false;
  });

  redisClient.on('connect', () => {
    logger.info('✅ Connected to Redis');
    redisAvailable = true;
    errorLogged = false;
  });

  redisClient.on('ready', () => {
    redisAvailable = true;
  });

  try {
    await redisClient.connect();
    redisAvailable = true;
  } catch {
    // Silently handled by the 'error' event listener above
    redisAvailable = false;
  }
}
