import crypto from 'crypto';
import { exchangeCodeForToken, validateWebhookSignature } from './githubService';

describe('GitHub webhook signature', () => {
  it('accepts a valid sha256 signature and rejects an invalid one', async () => {
    const payload = '{"action":"push"}';
    const secret = 'webhook-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    await expect(validateWebhookSignature(payload, signature, secret)).resolves.toBe(true);
    await expect(validateWebhookSignature(payload, 'sha256=bad', secret)).resolves.toBe(false);
  });
});

describe('GitHub OAuth token exchange', () => {
  const originalFetch = global.fetch;
  const originalClientId = process.env.GITHUB_CLIENT_ID;
  const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const originalCallbackUrl = process.env.GITHUB_CALLBACK_URL;

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.GITHUB_CALLBACK_URL = 'https://veridara-api.onrender.com/api/auth/github/callback';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnvironment('GITHUB_CLIENT_ID', originalClientId);
    restoreEnvironment('GITHUB_CLIENT_SECRET', originalClientSecret);
    restoreEnvironment('GITHUB_CALLBACK_URL', originalCallbackUrl);
  });

  it('uses form encoding and returns GitHub access tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'test-access-token' })
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(exchangeCodeForToken('oauth-code')).resolves.toBe('test-access-token');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        })
      })
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = new URLSearchParams(request.body as string);
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
    expect(body.get('code')).toBe('oauth-code');
    expect(body.get('redirect_uri')).toBe('https://veridara-api.onrender.com/api/auth/github/callback');
  });

  it('omits redirect_uri when it is not configured', async () => {
    delete process.env.GITHUB_CALLBACK_URL;
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'test-access-token' }) });
    global.fetch = fetchMock as typeof fetch;

    await exchangeCodeForToken('oauth-code');
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new URLSearchParams(request.body as string).has('redirect_uri')).toBe(false);
  });

  it('surfaces GitHub error descriptions without exposing request credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'incorrect_client_credentials', error_description: 'Bad client credentials' })
    }) as typeof fetch;

    await expect(exchangeCodeForToken('oauth-code')).rejects.toThrow('Bad client credentials');
  });
});

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
