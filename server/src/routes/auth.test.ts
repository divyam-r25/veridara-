jest.mock('../github/githubService', () => ({
  exchangeCodeForToken: jest.fn(),
  getGitHubUser: jest.fn()
}));
jest.mock('../models/User', () => ({ User: { findOneAndUpdate: jest.fn() } }));
jest.mock('../models/AuditLog', () => ({ AuditLog: { create: jest.fn() } }));

import { authRouter, consumeOAuthState, createOAuthState, statesMatch } from './auth';
import { exchangeCodeForToken, getGitHubUser } from '../github/githubService';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';

function testSession(state?: string) {
  const session = {
    oauthState: state,
    userId: undefined as string | undefined,
    save: jest.fn((callback: (error?: unknown) => void) => callback()),
    regenerate: jest.fn((callback: (error?: unknown) => void) => callback()),
    destroy: jest.fn((callback: (error?: unknown) => void) => callback())
  };
  return session;
}

function handler(method: 'get' | 'post', path: string): (req: any, res: any, next: any) => Promise<void> | void {
  const layer = (authRouter.stack as any[]).find((entry) => entry.route?.path === path && entry.route.methods[method]);
  return layer.route.stack[0].handle;
}

function response() {
  return { redirect: jest.fn(), json: jest.fn() };
}

const oauthExchange = exchangeCodeForToken as jest.MockedFunction<typeof exchangeCodeForToken>;
const githubUserLookup = getGitHubUser as jest.MockedFunction<typeof getGitHubUser>;
const upsertUser = User.findOneAndUpdate as jest.Mock;
const createAuditLog = AuditLog.create as jest.Mock;

const savedEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callback: process.env.GITHUB_CALLBACK_URL,
  clientUrl: process.env.CLIENT_URL
};

function configureOAuth(): void {
  process.env.NODE_ENV = 'test';
  process.env.CLIENT_URL = 'https://veridara.vercel.app';
  process.env.GITHUB_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
  process.env.GITHUB_CALLBACK_URL = 'https://veridara.vercel.app/api/auth/github/callback';
}

describe('GitHub OAuth state protection', () => {
  beforeEach(() => {
    configureOAuth();
    jest.clearAllMocks();
    createAuditLog.mockResolvedValue({});
  });

  afterAll(() => {
    restoreEnvironment('NODE_ENV', savedEnvironment.nodeEnv);
    restoreEnvironment('GITHUB_CLIENT_ID', savedEnvironment.clientId);
    restoreEnvironment('GITHUB_CLIENT_SECRET', savedEnvironment.clientSecret);
    restoreEnvironment('GITHUB_CALLBACK_URL', savedEnvironment.callback);
    restoreEnvironment('CLIENT_URL', savedEnvironment.clientUrl);
  });
  it('generates a cryptographically sized random state', () => {
    const first = createOAuthState();
    const second = createOAuthState();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it('accepts a matching callback state and removes it from the session', async () => {
    const state = createOAuthState();
    const session = testSession(state);
    await expect(consumeOAuthState(session, state)).resolves.toBe(true);
    expect(session.oauthState).toBeUndefined();
    expect(session.save).toHaveBeenCalledTimes(1);
  });

  it('rejects missing and mismatched callback state and consumes the stored value', async () => {
    const missing = testSession(createOAuthState());
    await expect(consumeOAuthState(missing, undefined)).resolves.toBe(false);
    expect(missing.oauthState).toBeUndefined();

    const mismatched = testSession(createOAuthState());
    await expect(consumeOAuthState(mismatched, createOAuthState())).resolves.toBe(false);
    expect(mismatched.oauthState).toBeUndefined();
  });

  it('uses a constant-time-compatible comparison only for equal-length state values', () => {
    expect(statesMatch('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(statesMatch('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(statesMatch('a'.repeat(64), 'short')).toBe(false);
  });
});

describe('GitHub OAuth routes', () => {
  beforeEach(() => {
    configureOAuth();
    jest.clearAllMocks();
    createAuditLog.mockResolvedValue({});
  });

  it('persists state before redirecting to GitHub with the configured callback', async () => {
    const req = { session: testSession() };
    const res = response();
    const next = jest.fn();

    await handler('get', '/github')(req, res, next);

    expect(req.session.oauthState).toMatch(/^[a-f0-9]{64}$/);
    expect(req.session.save).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('redirect_uri=https%3A%2F%2Fveridara.vercel.app%2Fapi%2Fauth%2Fgithub%2Fcallback'));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('scope=read%3Auser%20user%3Aemail%20repo'));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a specific 503 error when OAuth configuration is missing', async () => {
    delete process.env.GITHUB_CLIENT_SECRET;
    const next = jest.fn();

    await handler('get', '/github')({ session: testSession() }, response(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, code: 'OAUTH_NOT_CONFIGURED' }));
  });

  it('rotates and persists the session after a successful callback', async () => {
    const session = testSession('state-value');
    oauthExchange.mockResolvedValue('access-token');
    githubUserLookup.mockResolvedValue({ id: 123, login: 'octocat', email: 'octocat@example.com', avatar_url: 'avatar' } as any);
    upsertUser.mockResolvedValue({ id: 'user-1' });
    const res = response();

    await handler('get', '/github/callback')({ query: { code: 'code', state: 'state-value' }, session, ip: '127.0.0.1' }, res, jest.fn());

    expect(oauthExchange).toHaveBeenCalledWith('code');
    expect(githubUserLookup).toHaveBeenCalledWith('access-token');
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ githubUserId: '123' }), expect.objectContaining({ githubAccessToken: 'access-token' }), { upsert: true, new: true });
    expect(session.regenerate).toHaveBeenCalledTimes(1);
    expect(session.userId).toBe('user-1');
    expect(session.save).toHaveBeenCalledTimes(2);
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', action: 'GITHUB_CONNECTED' }));
    expect(res.redirect).toHaveBeenCalledWith('https://veridara.vercel.app/dashboard');
  });

  it('redirects a GitHub authorization denial back to a useful UI state', async () => {
    const res = response();
    await handler('get', '/github/callback')({ query: { error: 'access_denied' }, session: testSession() }, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('https://veridara.vercel.app?error=github_denied');
  });

  it('redirects safely when token exchange or persistence fails', async () => {
    const session = testSession('state-value');
    oauthExchange.mockRejectedValue(new Error('GitHub rejected the code'));
    const res = response();

    await handler('get', '/github/callback')({ query: { code: 'code', state: 'state-value' }, session }, res, jest.fn());

    expect(res.redirect).toHaveBeenCalledWith('https://veridara.vercel.app/?error=auth_failed');
    expect(session.regenerate).not.toHaveBeenCalled();
  });

  it('redirects safely when MongoDB cannot persist the authenticated user', async () => {
    const session = testSession('state-value');
    oauthExchange.mockResolvedValue('access-token');
    githubUserLookup.mockResolvedValue({ id: 123, login: 'octocat', avatar_url: 'avatar' } as any);
    upsertUser.mockRejectedValue(new Error('MongoDB write failed'));
    const res = response();

    await handler('get', '/github/callback')({ query: { code: 'code', state: 'state-value' }, session }, res, jest.fn());

    expect(res.redirect).toHaveBeenCalledWith('https://veridara.vercel.app/?error=auth_failed');
    expect(session.regenerate).not.toHaveBeenCalled();
  });

  it('rejects OAuth state replay after the stored state has been consumed', async () => {
    const session = testSession('one-time-state');
    await expect(consumeOAuthState(session, 'one-time-state')).resolves.toBe(true);
    await expect(consumeOAuthState(session, 'one-time-state')).resolves.toBe(false);
  });

  it('destroys the server-side session during logout', async () => {
    const session = testSession();
    session.userId = 'user-1';
    const res = response();
    await handler('post', '/logout')({ session, ip: '127.0.0.1' }, res, jest.fn());
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { message: 'Logged out' } });
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
