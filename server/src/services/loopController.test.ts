import { canTransition } from './loopController';

describe('Loop Controller transitions', () => {
  it('allows the required analysis path', () => {
    expect(canTransition('RECEIVED', 'TRIAGED')).toBe(true);
    expect(canTransition('FIX_PLAN_READY', 'AWAITING_FIX')).toBe(true);
    expect(canTransition('VERIFYING', 'RESOLVED')).toBe(true);
  });

  it('rejects skipped and terminal transitions', () => {
    expect(canTransition('FIX_PLAN_READY', 'RESOLVED')).toBe(false);
    expect(canTransition('RESOLVED', 'REANALYZING')).toBe(false);
  });
});
