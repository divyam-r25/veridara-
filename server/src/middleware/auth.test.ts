import { requireAuth } from './auth';

describe('requireAuth', () => {
  it('rejects an unauthenticated request with a specific status code', () => {
    const next = jest.fn();
    requireAuth({ session: {} } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
  });

  it('allows a request with a server-side session user id', () => {
    const next = jest.fn();
    requireAuth({ session: { userId: 'user-1' } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});
