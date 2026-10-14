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
  const isTest = process.env.NODE_ENV === 'test';
  const production = process.env.NODE_ENV === 'production';
  const url = isTest ? process.env.TEST_REDIS_URL : process.env.REDIS_URL;
  if (!url) {
    if (!production && !isTest) {
      logger.warn('REDIS_URL is not configured; development will use in-memory sessions and inline queues');
      return;
    }
    throw new Error(`${isTest ? 'TEST_REDIS_URL' : 'REDIS_URL'} is required`);
  }

  redisClient = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
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

  redisClient.on('ready', () => {
    redisAvailable = true;
    errorLogged = false;
  });

  try {
    await redisClient.connect();
    await redisClient.ping();
    redisAvailable = true;
    logger.info('✅ Connected to Redis');
  } catch (error) {
    redisAvailable = false;
    redisClient.disconnect();
    redisClient = null;
    throw error;
  }
}
