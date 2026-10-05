import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test';
  const uri = isTest ? process.env.TEST_MONGODB_URI : (process.env.MONGODB_URI || 'mongodb://localhost:27017/veridara');
  if (!uri) throw new Error('TEST_MONGODB_URI is required when NODE_ENV=test');

  const options: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 10000, // 10s timeout before giving up
    connectTimeoutMS: 10000,
  };

  try {
    await mongoose.connect(uri, options);
    logger.info('✅ Connected to MongoDB');
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err);
    logger.error('');
    logger.error('  ↳ Possible causes:');
    logger.error('    1. If using Atlas: check internet/VPN, and that your IP is whitelisted in Atlas Network Access');
    logger.error('    2. If using local MongoDB: run `docker-compose up -d mongodb`');
    logger.error('    3. Check MONGODB_URI in server/.env');
    logger.error('');
    throw err;
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}
