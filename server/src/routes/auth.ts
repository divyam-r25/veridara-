import { Router, Request, Response, NextFunction } from 'express';
import { exchangeCodeForToken, getGitHubUser } from '../github/githubService';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { createError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { getClientUrl, getGitHubCallbackUrl, hasGitHubOAuthConfiguration } from '../config/runtime';

export const authRouter = Router();

type OAuthStateSession = {
  oauthState?: string;
  save(callback: (error?: unknown) => void): void;
  regenerate(callback: (error?: unknown) => void): void;
};

export function createOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function statesMatch(expectedState: string | undefined, receivedState: unknown): boolean {
  if (!expectedState || typeof receivedState !== 'string' || expectedState.length !== receivedState.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState));
}

function saveSession(session: OAuthStateSession): Promise<void> {
  return new Promise((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
}

function regenerateSession(session: OAuthStateSession): Promise<void> {
  return new Promise((resolve, reject) => session.regenerate(error => error ? reject(error) : resolve()));
}

/** Validate and consume an OAuth state. Every result invalidates the old state. */
export async function consumeOAuthState(session: OAuthStateSession, receivedState: unknown): Promise<boolean> {
  const valid = statesMatch(session.oauthState, receivedState);
  delete session.oauthState;
  await saveSession(session);
  return valid;
}

// GitHub OAuth begins as a browser navigation, not a cross-site XHR. This
// ensures the state cookie is established before GitHub redirects back.
authRouter.get('/github', async (req: Request, res: Response, next: NextFunction) => {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();

  if (!hasGitHubOAuthConfiguration() || !clientId) {
    return next(createError('GitHub sign-in is not configured', 503, 'OAUTH_NOT_CONFIGURED'));
  }

  try {
    // repo is required only to list and select the user's private repositories.
    // Pull-request analysis itself still uses short-lived GitHub App tokens.
    const scope = 'read:user user:email repo';
    const redirectUri = getGitHubCallbackUrl();
    const state = createOAuthState();
    req.session.oauthState = state;
    await saveSession(req.session);
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return res.redirect(githubAuthUrl);
  } catch (error) {
    return next(error);
  }
});

// GitHub OAuth callback
authRouter.get('/github/callback', async (req: Request, res: Response, next: NextFunction) => {
  const { code, error, state } = req.query;
  let clientUrl: string;
  try {
    clientUrl = getClientUrl();
  } catch (configurationError) {
    return next(configurationError);
  }

  if (error) {
    return res.redirect(`${clientUrl}?error=github_denied`);
  }

  if (!code) {
    return next(createError('Missing OAuth code', 400, 'MISSING_CODE'));
  }

  try {
    if (!await consumeOAuthState(req.session, state)) {
      return next(createError('Invalid OAuth state', 400, 'INVALID_OAUTH_STATE'));
    }
  } catch (err) {
    return next(err);
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

    // Rotate the identifier after authentication to prevent session fixation.
    await regenerateSession(req.session);
    req.session.userId = user.id;
    await saveSession(req.session);

    await AuditLog.create({
      userId: user.id,
      action: 'GITHUB_CONNECTED',
      metadata: { githubLogin: githubUser.login },
      ip: req.ip
    }).catch((auditError) => logger.warn('GitHub sign-in audit log failed:', auditError instanceof Error ? auditError.message : String(auditError)));

    return res.redirect(`${clientUrl}/dashboard`);
  } catch (err) {
    logger.error('GitHub OAuth callback failed:', err instanceof Error ? err.message : String(err));
    res.redirect(`${clientUrl}/?error=auth_failed`);
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

    await regenerateSession(req.session);
    req.session.userId = demoUser.id;
    await saveSession(req.session);

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
      demoModeAvailable: !hasGitHubOAuthConfiguration()
    }
  });
});
