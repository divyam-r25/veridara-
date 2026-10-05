import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { initQueues } from './queues';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { repositoriesRouter } from './routes/repositories';
import { pullRequestsRouter } from './routes/pullRequests';
import { analysesRouter } from './routes/analyses';
import { webhooksRouter } from './routes/webhooks';
import { meRouter } from './routes/me';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// CORS
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});
app.use('/api/', limiter);

// Webhook route must be BEFORE json body parser (needs raw body for signature verification)
app.use('/api/webhooks', webhooksRouter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.info(msg.trim()) }
}));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'release-radar-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/repositories', repositoriesRouter);
app.use('/api/pulls', pullRequestsRouter);
app.use('/api/analyses', analysesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// In production, the Render build copies the Vite bundle here so the API and
// client share one origin. This keeps session cookies and API requests working
// without a cross-origin proxy.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../public');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  // Start listening first so the server is immediately available
  app.listen(PORT, () => {
    logger.info(`🚀 ReleaseRadar server running on port ${PORT}`);
    logger.info(`   Health: http://localhost:${PORT}/api/health`);
    logger.info(`   Demo login: POST http://localhost:${PORT}/api/auth/demo-login`);
  });

  // Then connect to backing services (non-fatal if unavailable)
  try {
    await connectDatabase();
  } catch (err) {
    logger.error('⚠️  MongoDB unavailable — API will return errors until connected');
    logger.error('    Fix: whitelist your IP at https://cloud.mongodb.com → Network Access');
  }

  try {
    await connectRedis();
    await initQueues();
  } catch (err) {
    logger.warn('⚠️  Redis unavailable — analyses will run inline (no queue)');
  }
}

start();

export { app };
