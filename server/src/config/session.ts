import type { Express } from 'express';
import session, { SessionOptions } from 'express-session';
import { RedisSessionStore } from './redisSessionStore';

export function getSessionOptions(): SessionOptions {
  const production = process.env.NODE_ENV === 'production';
  return {
    store: new RedisSessionStore(),
    secret: process.env.SESSION_SECRET || 'veridara-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: production,
      // The Vercel frontend and Render API are separate sites in production.
      // Cross-site requests need an explicitly cross-site session cookie.
      sameSite: production ? 'none' : 'lax',
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
