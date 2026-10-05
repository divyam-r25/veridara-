import { verifyOriginalFinding } from './findingVerifier';

const original = { category: 'SECURITY', affectedFiles: ['src/auth.ts'] } as any;

describe('independent finding verifier', () => {
  it('does not mark a matching high-risk finding as resolved', () => {
    expect(verifyOriginalFinding(original, [{ category: 'SECURITY', affectedFiles: ['src/auth.ts'], severity: 'HIGH' }])).toBe('UNRESOLVED');
  });

  it('marks a finding resolved only when the independent check found no related issue', () => {
    expect(verifyOriginalFinding(original, [])).toBe('RESOLVED');
  });
});
