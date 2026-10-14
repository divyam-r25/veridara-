import type { Express, Request, Response, NextFunction } from 'express';
import session, { SessionOptions } from 'express-session';
import { RedisSessionStore } from './redisSessionStore';
import { isRedisAvailable } from './redis';
import { isDatabaseAvailable } from './database';

export function getSessionOptions(): SessionOptions {
  const production = process.env.NODE_ENV === 'production';
  return {
    // Development remains usable without Redis. Production is validated and
    // started only after Redis is ready, so sessions are always durable there.
    ...(production ? { store: new RedisSessionStore() } : {}),
    secret: process.env.SESSION_SECRET || 'veridara-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: production,
      // The browser talks to Vercel's same-origin /api proxy. Lax permits the
      // top-level GitHub callback while rejecting unnecessary cross-site sends.
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  };
}

/** Configure proxy-aware, Redis-backed sessions before registering routes. */
export function configureSession(app: Express): void {
  // Render terminates TLS at its reverse proxy. Without this Express refuses
  // to issue a secure session cookie, so the GitHub callback loses oauthState.
  app.set('trust proxy', 1);
  app.use(session(getSessionOptions()));
}

/** Reject normal requests after a dependency outage before session I/O runs. */
export function requireReadyDependencies(req: Request, _res: Response, next: NextFunction): void {
  if (req.path === '/api/health') return next();
  if (process.env.NODE_ENV === 'production' && (!isRedisAvailable() || !isDatabaseAvailable())) {
    const unavailable = !isRedisAvailable() ? 'Session store' : 'Database';
    const error = new Error(`${unavailable} is unavailable`) as Error & { statusCode: number; code: string };
    error.statusCode = 503;
    error.code = 'SERVICE_UNAVAILABLE';
    return next(error);
  }
  next();
}
