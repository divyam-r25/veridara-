import { consumeOAuthState, createOAuthState, statesMatch } from './auth';

function testSession(state?: string) {
  const session = {
    oauthState: state,
    save: jest.fn((callback: (error?: unknown) => void) => callback())
  };
  return session;
}

describe('GitHub OAuth state protection', () => {
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
