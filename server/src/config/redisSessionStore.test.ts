import { RedisSessionStore } from './redisSessionStore';

describe('RedisSessionStore', () => {
  it('reports an initialization error instead of silently losing an OAuth session', (done) => {
    const store = new RedisSessionStore();
    store.set('session-id', { cookie: { maxAge: 1000 } } as any, (error) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Redis not initialized');
      done();
    });
  });
});
