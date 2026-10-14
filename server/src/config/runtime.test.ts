import { validateRuntimeConfiguration } from './runtime';

const originalEnvironment = { ...process.env };

function productionConfiguration(): void {
  process.env.NODE_ENV = 'production';
  process.env.MONGODB_URI = 'mongodb://example.test/veridara';
  process.env.REDIS_URL = 'redis://example.test:6379';
  process.env.SESSION_SECRET = 'a-secure-production-session-secret-with-32-chars';
  process.env.CLIENT_URL = 'https://veridara.vercel.app';
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'client-secret';
  process.env.GITHUB_CALLBACK_URL = 'https://veridara.vercel.app/api/auth/github/callback';
}

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

describe('production runtime configuration', () => {
  it('accepts a consistent Vercel callback configuration', () => {
    productionConfiguration();
    expect(validateRuntimeConfiguration).not.toThrow();
  });

  it('rejects missing session infrastructure before listening', () => {
    productionConfiguration();
    delete process.env.REDIS_URL;
    expect(validateRuntimeConfiguration).toThrow('REDIS_URL');
  });

  it('rejects a callback on a different origin', () => {
    productionConfiguration();
    process.env.GITHUB_CALLBACK_URL = 'https://veridara-api.onrender.com/api/auth/github/callback';
    expect(validateRuntimeConfiguration).toThrow('GITHUB_CALLBACK_URL must be the CLIENT_URL origin');
  });
});
