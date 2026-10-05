import { Router, Request, Response, NextFunction } from 'express';
import { exchangeCodeForToken, getGitHubUser } from '../github/githubService';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export const authRouter = Router();

// GitHub OAuth - get redirect URL
authRouter.get('/github', (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();

  if (!clientId) {
    return res.json({
      success: true,
      data: {
        demoMode: true,
        message: 'GitHub OAuth not configured. Using demo mode.',
        demoLoginUrl: '/api/auth/demo-login'
      }
    });
  }

  const scope = 'read:user user:email';
  const redirectUri = (process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/auth/github/callback').trim();
  const state = crypto.randomBytes(32).toString('hex');
  req.session.oauthState = state;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.json({ success: true, data: { url: githubAuthUrl } });
});

// GitHub OAuth callback
authRouter.get('/github/callback', async (req: Request, res: Response, next: NextFunction) => {
  const { code, error, state } = req.query;
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').trim();

  if (error) {
    return res.redirect(`${clientUrl}?error=github_denied`);
  }

  if (!code) {
    return next(createError('Missing OAuth code', 400, 'MISSING_CODE'));
  }

  const expectedState = req.session.oauthState;
  delete req.session.oauthState;
  if (!expectedState || typeof state !== 'string' || expectedState.length !== state.length || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(state))) {
    return next(createError('Invalid OAuth state', 400, 'INVALID_OAUTH_STATE'));
  }

  try {
    const token = await exchangeCodeForToken(String(code));
    const githubUser = await getGitHubUser(token);

    const user = await User.findOneAndUpdate(
      { githubUserId: String(githubUser.id) },
      {
        githubUserId: String(githubUser.id),
        username: githubUser.login,
        email: githubUser.email || undefined,
        avatarUrl: githubUser.avatar_url,
        githubAccessToken: token
      },
      { upsert: true, new: true }
    );

    req.session.userId = user.id;

    await AuditLog.create({
      userId: user.id,
      action: 'GITHUB_CONNECTED',
      metadata: { githubLogin: githubUser.login },
      ip: req.ip
    });

    res.redirect(`${clientUrl}/dashboard`);
  } catch (err) {
    logger.error('GitHub OAuth callback failed:', err instanceof Error ? err.message : String(err));
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=auth_failed`);
  }
});

// Demo login (no GitHub required)
authRouter.post('/demo-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const demoUser = await User.findOneAndUpdate(
      { githubUserId: 'demo-user-001' },
      {
        githubUserId: 'demo-user-001',
        username: 'demo-developer',
        email: 'demo@veridara.dev',
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
      },
      { upsert: true, new: true }
    );

    req.session.userId = demoUser.id;

    res.json({
      success: true,
      data: {
        user: {
          id: demoUser.id,
          username: demoUser.username,
          email: demoUser.email,
          avatarUrl: demoUser.avatarUrl
        },
        demoMode: true
      }
    });
  } catch (err) {
    next(err);
  }
});

// Logout
authRouter.post('/logout', async (req: Request, res: Response) => {
  const userId = req.session.userId;

  if (userId) {
    await AuditLog.create({
      userId,
      action: 'LOGGED_OUT',
      ip: req.ip
    }).catch(() => {});
  }

  req.session.destroy((err) => {
    if (err) logger.warn('Session destroy error:', err);
    res.json({ success: true, data: { message: 'Logged out' } });
  });
});

// Check auth status
authRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      authenticated: !!req.session.userId,
      demoModeAvailable: !process.env.GITHUB_CLIENT_ID
    }
  });
});
