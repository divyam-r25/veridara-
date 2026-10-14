const DEVELOPMENT_SESSION_SECRET = 'veridara-dev-secret-change-in-production';

function isNonEmpty(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function mustBeAbsoluteUrl(name: string, value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new Error('production URLs must use HTTPS');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid URL';
    throw new Error(`${name} must be an absolute URL (${reason})`);
  }
}

/**
 * Reject incomplete production configuration before Express starts listening.
 * OAuth is optional only when every OAuth variable is absent (demo-only mode).
 */
export function validateRuntimeConfiguration(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const required = ['MONGODB_URI', 'REDIS_URL', 'SESSION_SECRET', 'CLIENT_URL'];
  const missing = required.filter((key) => !isNonEmpty(process.env[key]));
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);

  const sessionSecret = process.env.SESSION_SECRET!.trim();
  if (sessionSecret === DEVELOPMENT_SESSION_SECRET || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be a unique production secret of at least 32 characters');
  }

  mustBeAbsoluteUrl('CLIENT_URL', process.env.CLIENT_URL!.trim());

  const oauthKeys = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL'];
  const configured = oauthKeys.filter((key) => isNonEmpty(process.env[key]));
  if (configured.length > 0 && configured.length !== oauthKeys.length) {
    throw new Error(`GitHub OAuth configuration is incomplete; set all of ${oauthKeys.join(', ')} or none for demo-only mode`);
  }

  if (configured.length === oauthKeys.length) {
    const callbackUrl = process.env.GITHUB_CALLBACK_URL!.trim();
    mustBeAbsoluteUrl('GITHUB_CALLBACK_URL', callbackUrl);
    const callback = new URL(callbackUrl);
    const client = new URL(process.env.CLIENT_URL!.trim());
    if (callback.origin !== client.origin || callback.pathname !== '/api/auth/github/callback') {
      throw new Error('GITHUB_CALLBACK_URL must be the CLIENT_URL origin followed by /api/auth/github/callback');
    }
  }
}

export function getClientUrl(): string {
  const value = process.env.CLIENT_URL?.trim();
  if (value) return value.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('CLIENT_URL is required in production');
  return 'http://localhost:5173';
}

export function getGitHubCallbackUrl(): string {
  const value = process.env.GITHUB_CALLBACK_URL?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error('GITHUB_CALLBACK_URL is required in production');
  return 'http://localhost:3001/api/auth/github/callback';
}

export function hasGitHubOAuthConfiguration(): boolean {
  return isNonEmpty(process.env.GITHUB_CLIENT_ID)
    && isNonEmpty(process.env.GITHUB_CLIENT_SECRET)
    && isNonEmpty(process.env.GITHUB_CALLBACK_URL);
}
