import express from 'express';
import type { CookieOptions } from 'express-session';
import { configureSession, getSessionOptions } from './session';

describe('production session configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('trusts the Render reverse proxy before registering secure sessions', () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    configureSession(app);
    expect(app.get('trust proxy')).toBe(1);
  });

  it('uses secure cross-site cookies only in production', () => {
    process.env.NODE_ENV = 'production';
    const productionCookie = getSessionOptions().cookie as CookieOptions;
    expect(productionCookie.secure).toBe(true);
    expect(productionCookie.sameSite).toBe('none');
    expect(productionCookie.httpOnly).toBe(true);

    process.env.NODE_ENV = 'development';
    const developmentCookie = getSessionOptions().cookie as CookieOptions;
    expect(developmentCookie.secure).toBe(false);
    expect(developmentCookie.sameSite).toBe('lax');
  });
});
